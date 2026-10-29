CREATE TABLE "response_session" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"form_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"capability_hash" text NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"answers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'collecting' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "response_session_capability_hash_unique" UNIQUE("capability_hash"),
	CONSTRAINT "response_session_tenant_identity" UNIQUE("workspace_id","form_id","version_id","id"),
	CONSTRAINT "response_session_hash" CHECK ("response_session"."capability_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "response_session_revision" CHECK ("response_session"."revision" > 0),
	CONSTRAINT "response_session_status" CHECK ("response_session"."status" in ('collecting','submitted')),
	CONSTRAINT "response_session_expiry" CHECK ("response_session"."expires_at" > "response_session"."created_at"),
	CONSTRAINT "response_session_answers" CHECK (jsonb_typeof("response_session"."answers") = 'object' and octet_length("response_session"."answers"::text) <= 2097152)
);
--> statement-breakpoint
ALTER TABLE "response_session" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "response_session" ADD CONSTRAINT "response_session_version_fk" FOREIGN KEY ("workspace_id","form_id","version_id") REFERENCES "public"."form_version"("workspace_id","form_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "response_session_expiry_idx" ON "response_session" USING btree ("expires_at");--> statement-breakpoint
-- Define the fixed-path capability predicate after its table and before policies.
CREATE FUNCTION public.intake_session_access(requested_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.response_session s
    JOIN public.form_publication p ON p.workspace_id = s.workspace_id AND p.form_id = s.form_id
    WHERE s.id = requested_id
      AND s.id::text = current_setting('snapform.intake_id', true)
      AND s.capability_hash = current_setting('snapform.intake_hash', true)
      AND p.public_id::text = current_setting('snapform.public_id', true)
      AND s.expires_at > now() AND p.active = true
  )
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.intake_session_access(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.intake_session_access(uuid) TO snapform_runtime;
--> statement-breakpoint
CREATE POLICY "response_session_read" ON "response_session" AS PERMISSIVE FOR SELECT TO "snapform_runtime" USING ("response_session"."id" = nullif(current_setting('snapform.intake_id',true),'')::uuid and public.intake_session_access("response_session"."id"));--> statement-breakpoint
CREATE POLICY "response_session_update" ON "response_session" AS PERMISSIVE FOR UPDATE TO "snapform_runtime" USING ("response_session"."id" = nullif(current_setting('snapform.intake_id',true),'')::uuid and public.intake_session_access("response_session"."id") and "response_session"."status" = 'collecting') WITH CHECK ("response_session"."id" = nullif(current_setting('snapform.intake_id',true),'')::uuid and public.intake_session_access("response_session"."id") and "response_session"."status" = 'collecting');--> statement-breakpoint
CREATE FUNCTION public.start_response_session(requested_public_id uuid, requested_id uuid, requested_hash text)
RETURNS uuid LANGUAGE sql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  INSERT INTO public.response_session (id, workspace_id, form_id, version_id, capability_hash, expires_at)
  SELECT requested_id, p.workspace_id, p.form_id, p.version_id, requested_hash, now() + interval '24 hours'
  FROM public.form_publication p
  WHERE p.public_id = requested_public_id AND p.active = true AND requested_hash ~ '^[0-9a-f]{64}$'
  FOR SHARE OF p
  ON CONFLICT DO NOTHING
  RETURNING id
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.start_response_session(uuid, uuid, text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.start_response_session(uuid, uuid, text) TO snapform_runtime;
--> statement-breakpoint
CREATE FUNCTION public.read_response_session(requested_id uuid)
RETURNS TABLE (id uuid, public_id uuid, version_id uuid, definition jsonb, revision integer, answers jsonb, expires_at timestamp with time zone, status text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT s.id, p.public_id, s.version_id, v.definition, s.revision, s.answers, s.expires_at, s.status
  FROM public.response_session s
  JOIN public.form_publication p ON p.workspace_id = s.workspace_id AND p.form_id = s.form_id
  JOIN public.form_version v ON v.workspace_id = s.workspace_id AND v.form_id = s.form_id AND v.id = s.version_id
  WHERE s.id = requested_id AND public.intake_session_access(s.id)
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.read_response_session(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.read_response_session(uuid) TO snapform_runtime;
--> statement-breakpoint
REVOKE ALL ON TABLE public.response_session FROM PUBLIC;
--> statement-breakpoint
GRANT SELECT ON TABLE public.response_session TO snapform_runtime;
--> statement-breakpoint
GRANT UPDATE (answers, revision, updated_at) ON TABLE public.response_session TO snapform_runtime;
