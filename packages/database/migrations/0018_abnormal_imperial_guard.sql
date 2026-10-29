SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
CREATE TABLE "form_email_settings" (
	"workspace_id" uuid NOT NULL,
	"form_id" uuid NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"updated_by" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "form_email_settings_workspace_id_form_id_pk" PRIMARY KEY("workspace_id","form_id"),
	CONSTRAINT "form_email_settings_revision" CHECK ("form_email_settings"."revision">0)
);
--> statement-breakpoint
ALTER TABLE "form_email_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "response_email_delivery" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"form_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"recipient_user_id" text NOT NULL,
	"recipient_email" text NOT NULL,
	"settings_revision" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "response_email_event" UNIQUE("event_id"),
	CONSTRAINT "response_email_settings_revision" CHECK ("response_email_delivery"."settings_revision">0),
	CONSTRAINT "response_email_state" CHECK (("response_email_delivery"."status"='pending' and "response_email_delivery"."reason" is null) or ("response_email_delivery"."status"='cancelled' and "response_email_delivery"."reason"='disabled') or ("response_email_delivery"."status"='needs_action' and "response_email_delivery"."reason"='recipient-unavailable'))
);
--> statement-breakpoint
ALTER TABLE "response_email_delivery" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "form_email_settings" ADD CONSTRAINT "form_email_settings_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_email_settings" ADD CONSTRAINT "form_email_settings_workspace_id_form_id_form_workspace_id_id_fk" FOREIGN KEY ("workspace_id","form_id") REFERENCES "public"."form"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "response_email_delivery" ADD CONSTRAINT "response_email_delivery_recipient_user_id_user_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "response_outbox" ADD CONSTRAINT "response_outbox_delivery_identity" UNIQUE("id","workspace_id","form_id","session_id");--> statement-breakpoint
ALTER TABLE "response_email_delivery" ADD CONSTRAINT "response_email_event_tenant_fk" FOREIGN KEY ("event_id","workspace_id","form_id","session_id") REFERENCES "public"."response_outbox"("id","workspace_id","form_id","session_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "response_email_pending_idx" ON "response_email_delivery" USING btree ("created_at") WHERE "response_email_delivery"."status"='pending';--> statement-breakpoint
CREATE POLICY "form_email_settings_read" ON "form_email_settings" AS PERMISSIVE FOR SELECT TO "snapform_runtime" USING ("form_email_settings"."workspace_id"::text = current_setting('snapform.workspace_id', true)
    and exists (select 1 from public.membership m
      where m.workspace_id = "form_email_settings"."workspace_id"
        and m.user_id = current_setting('snapform.user_id', true)
        and true));--> statement-breakpoint
CREATE POLICY "form_email_settings_create" ON "form_email_settings" AS PERMISSIVE FOR INSERT TO "snapform_runtime" WITH CHECK ("form_email_settings"."workspace_id"::text = current_setting('snapform.workspace_id', true)
    and exists (select 1 from public.membership m
      where m.workspace_id = "form_email_settings"."workspace_id"
        and m.user_id = current_setting('snapform.user_id', true)
        and m.role in ('owner', 'editor')) and "form_email_settings"."updated_by"=current_setting('snapform.user_id',true));--> statement-breakpoint
CREATE POLICY "form_email_settings_update" ON "form_email_settings" AS PERMISSIVE FOR UPDATE TO "snapform_runtime" USING ("form_email_settings"."workspace_id"::text = current_setting('snapform.workspace_id', true)
    and exists (select 1 from public.membership m
      where m.workspace_id = "form_email_settings"."workspace_id"
        and m.user_id = current_setting('snapform.user_id', true)
        and m.role in ('owner', 'editor'))) WITH CHECK ("form_email_settings"."workspace_id"::text = current_setting('snapform.workspace_id', true)
    and exists (select 1 from public.membership m
      where m.workspace_id = "form_email_settings"."workspace_id"
        and m.user_id = current_setting('snapform.user_id', true)
        and m.role in ('owner', 'editor')) and "form_email_settings"."updated_by"=current_setting('snapform.user_id',true));--> statement-breakpoint
CREATE POLICY "response_email_read" ON "response_email_delivery" AS PERMISSIVE FOR SELECT TO "snapform_runtime" USING ("response_email_delivery"."workspace_id"::text = current_setting('snapform.workspace_id', true)
    and exists (select 1 from public.membership m
      where m.workspace_id = "response_email_delivery"."workspace_id"
        and m.user_id = current_setting('snapform.user_id', true)
        and true));
--> statement-breakpoint
REVOKE ALL ON TABLE public.form_email_settings,public.response_email_delivery FROM PUBLIC;
--> statement-breakpoint
GRANT SELECT,INSERT,UPDATE ON public.form_email_settings TO snapform_runtime;
--> statement-breakpoint
GRANT SELECT ON public.response_email_delivery TO snapform_runtime;
--> statement-breakpoint
CREATE FUNCTION public.seed_response_owner_email()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog
AS $$
DECLARE owner_id text; owner_email text; settings_revision integer; eligible boolean;
BEGIN
 SELECT w.created_by,u.email,s.revision,
   u.email_verified AND EXISTS(SELECT 1 FROM public.membership m WHERE m.workspace_id=w.id AND m.user_id=w.created_by AND m.role='owner')
 INTO owner_id,owner_email,settings_revision,eligible
 FROM public.form_email_settings s
 JOIN public.workspace w ON w.id=s.workspace_id
 JOIN public."user" u ON u.id=w.created_by
 WHERE s.workspace_id=NEW.workspace_id AND s.form_id=NEW.form_id AND s.enabled
 FOR SHARE OF s;
 IF NOT FOUND THEN RETURN NEW; END IF;
 INSERT INTO public.response_email_delivery(event_id,workspace_id,form_id,session_id,recipient_user_id,recipient_email,settings_revision,status,reason)
 VALUES(NEW.id,NEW.workspace_id,NEW.form_id,NEW.session_id,owner_id,owner_email,settings_revision,
   CASE WHEN eligible THEN 'pending' ELSE 'needs_action' END,
   CASE WHEN eligible THEN NULL ELSE 'recipient-unavailable' END);
 RETURN NEW;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.seed_response_owner_email() FROM PUBLIC;
--> statement-breakpoint
CREATE TRIGGER response_owner_email AFTER INSERT ON public.response_outbox
FOR EACH ROW WHEN(NEW.kind='response.submitted') EXECUTE FUNCTION public.seed_response_owner_email();
--> statement-breakpoint
CREATE FUNCTION public.cancel_response_owner_emails()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog
AS $$
BEGIN
 UPDATE public.response_email_delivery SET status='cancelled',reason='disabled'
 WHERE workspace_id=NEW.workspace_id AND form_id=NEW.form_id AND status IN('pending','needs_action');
 RETURN NEW;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.cancel_response_owner_emails() FROM PUBLIC;
--> statement-breakpoint
CREATE TRIGGER form_email_optout AFTER UPDATE OF enabled ON public.form_email_settings
FOR EACH ROW WHEN(OLD.enabled AND NOT NEW.enabled) EXECUTE FUNCTION public.cancel_response_owner_emails();
