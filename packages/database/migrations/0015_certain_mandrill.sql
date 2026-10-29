SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
CREATE TABLE "response_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"form_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"kind" text DEFAULT 'response.submitted' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"lease_token" uuid,
	"lease_until" timestamp with time zone,
	"dispatched_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	CONSTRAINT "response_outbox_session" UNIQUE("session_id"),
	CONSTRAINT "response_outbox_kind" CHECK ("response_outbox"."kind" = 'response.submitted'),
	CONSTRAINT "response_outbox_attempts" CHECK ("response_outbox"."attempts" >= 0),
	CONSTRAINT "response_outbox_lease" CHECK (("response_outbox"."lease_token" is null) = ("response_outbox"."lease_until" is null))
);
--> statement-breakpoint
ALTER TABLE "response_outbox" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "response_outbox" ADD CONSTRAINT "response_outbox_session_fk" FOREIGN KEY ("workspace_id","form_id","version_id","session_id") REFERENCES "public"."response_session"("workspace_id","form_id","version_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "response_outbox_due_idx" ON "response_outbox" USING btree ("available_at","created_at") WHERE "response_outbox"."completed_at" is null;--> statement-breakpoint
CREATE POLICY "response_outbox_read" ON "response_outbox" AS PERMISSIVE FOR SELECT TO "snapform_runtime" USING (public.intake_session_access("response_outbox"."session_id") or ("response_outbox"."workspace_id"::text = current_setting('snapform.workspace_id', true)
    and exists (select 1 from public.membership m
      where m.workspace_id = "response_outbox"."workspace_id"
        and m.user_id = current_setting('snapform.user_id', true)
        and true)));
--> statement-breakpoint
GRANT SELECT ON public.response_outbox TO snapform_runtime;
--> statement-breakpoint
CREATE FUNCTION public.record_response_submission()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $$
BEGIN
 INSERT INTO public.response_outbox(session_id,workspace_id,form_id,version_id)
 VALUES(NEW.id,NEW.workspace_id,NEW.form_id,NEW.version_id);
 RETURN NEW;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.record_response_submission() FROM PUBLIC;
--> statement-breakpoint
CREATE TRIGGER response_submission_outbox
AFTER UPDATE OF status ON public.response_session
FOR EACH ROW WHEN (OLD.status = 'collecting' AND NEW.status = 'submitted')
EXECUTE FUNCTION public.record_response_submission();
