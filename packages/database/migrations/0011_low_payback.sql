CREATE TABLE "trial_response_usage" (
	"owner_id" text PRIMARY KEY NOT NULL,
	"responses_used" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trial_response_usage_bounds" CHECK ("trial_response_usage"."responses_used" >= 0 and "trial_response_usage"."responses_used" <= 50)
);
--> statement-breakpoint
ALTER TABLE "trial_response_usage" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "response_session" ADD COLUMN "reservation_until" timestamp with time zone DEFAULT now() + interval '15 minutes' NOT NULL;--> statement-breakpoint
ALTER TABLE "trial_response_usage" ADD CONSTRAINT "trial_response_usage_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "response_session_reservation_idx" ON "response_session" USING btree ("workspace_id","status","reservation_until");--> statement-breakpoint
ALTER TABLE "response_session" ADD CONSTRAINT "response_session_reservation_expiry" CHECK ("response_session"."reservation_until" <= "response_session"."expires_at");--> statement-breakpoint
CREATE POLICY "trial_response_usage_read" ON "trial_response_usage" AS PERMISSIVE FOR SELECT TO "snapform_runtime" USING ("trial_response_usage"."owner_id" = current_setting('snapform.user_id',true));--> statement-breakpoint
REVOKE ALL ON TABLE public.trial_response_usage FROM PUBLIC;
--> statement-breakpoint
GRANT SELECT ON TABLE public.trial_response_usage TO snapform_runtime;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.start_response_session(requested_public_id uuid, requested_id uuid, requested_hash text)
RETURNS uuid LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  creator text;
  trial_started timestamp with time zone;
  used integer;
  reserved bigint;
  publication_record record;
  result_id uuid;
BEGIN
  IF requested_hash IS NULL OR requested_hash !~ '^[0-9a-f]{64}$' THEN RETURN NULL; END IF;
  SELECT w.created_by INTO creator
    FROM public.form_publication p JOIN public.workspace w ON w.id = p.workspace_id
    WHERE p.public_id = requested_public_id AND p.active = true;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT u.created_at INTO trial_started FROM public."user" u WHERE u.id = creator AND u.email_verified = true;
  IF NOT FOUND OR trial_started + interval '14 days' <= now() THEN RETURN NULL; END IF;
  INSERT INTO public.trial_response_usage (owner_id) VALUES (creator) ON CONFLICT DO NOTHING;
  -- The counter update serializes reservations, including under stronger isolation levels.
  UPDATE public.trial_response_usage SET updated_at = now() WHERE owner_id = creator RETURNING responses_used INTO used;
  SELECT count(*) INTO reserved
    FROM public.response_session s JOIN public.workspace w ON w.id = s.workspace_id
    WHERE w.created_by = creator AND s.status = 'collecting'
      AND s.reservation_until > now() AND s.expires_at > now();
  IF used + reserved >= 50 THEN RETURN NULL; END IF;
  SELECT p.* INTO publication_record
    FROM public.form_publication p JOIN public.workspace w ON w.id = p.workspace_id
    WHERE p.public_id = requested_public_id AND p.active = true AND w.created_by = creator
    FOR SHARE OF p;
  IF NOT FOUND THEN RETURN NULL; END IF;
  INSERT INTO public.response_session (id, workspace_id, form_id, version_id, capability_hash, expires_at)
    VALUES (requested_id, publication_record.workspace_id, publication_record.form_id, publication_record.version_id, requested_hash, now() + interval '24 hours')
    ON CONFLICT DO NOTHING RETURNING id INTO result_id;
  RETURN result_id;
END
$$;
