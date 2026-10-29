SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
CREATE TABLE "form_webhook_settings" (
	"workspace_id" uuid NOT NULL,
	"form_id" uuid NOT NULL,
	"configuration_id" uuid NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"updated_by" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "form_webhook_settings_workspace_id_form_id_pk" PRIMARY KEY("workspace_id","form_id"),
	CONSTRAINT "form_webhook_settings_revision" CHECK ("form_webhook_settings"."revision">0)
);
--> statement-breakpoint
ALTER TABLE "form_webhook_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "webhook_configuration" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"form_id" uuid NOT NULL,
	"sealed_destination" text NOT NULL,
	"verified_at" timestamp with time zone,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "webhook_configuration_tenant" UNIQUE("workspace_id","form_id","id"),
	CONSTRAINT "webhook_configuration_envelope" CHECK (length("webhook_configuration"."sealed_destination") between 80 and 8192 and "webhook_configuration"."sealed_destination" like 'v1.%')
);
--> statement-breakpoint
ALTER TABLE "webhook_configuration" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "form_webhook_settings" ADD CONSTRAINT "form_webhook_settings_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_webhook_settings" ADD CONSTRAINT "form_webhook_configuration_tenant_fk" FOREIGN KEY ("workspace_id","form_id","configuration_id") REFERENCES "public"."webhook_configuration"("workspace_id","form_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_configuration" ADD CONSTRAINT "webhook_configuration_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_configuration" ADD CONSTRAINT "webhook_configuration_workspace_id_form_id_form_workspace_id_id_fk" FOREIGN KEY ("workspace_id","form_id") REFERENCES "public"."form"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "form_webhook_settings_read" ON "form_webhook_settings" AS PERMISSIVE FOR SELECT TO "snapform_runtime" USING ("form_webhook_settings"."workspace_id"::text = current_setting('snapform.workspace_id', true)
    and exists (select 1 from public.membership m
      where m.workspace_id = "form_webhook_settings"."workspace_id"
        and m.user_id = current_setting('snapform.user_id', true)
        and true));--> statement-breakpoint
CREATE POLICY "form_webhook_settings_create" ON "form_webhook_settings" AS PERMISSIVE FOR INSERT TO "snapform_runtime" WITH CHECK ("form_webhook_settings"."workspace_id"::text = current_setting('snapform.workspace_id', true)
    and exists (select 1 from public.membership m
      where m.workspace_id = "form_webhook_settings"."workspace_id"
        and m.user_id = current_setting('snapform.user_id', true)
        and m.role in ('owner', 'editor')) and "form_webhook_settings"."updated_by"=current_setting('snapform.user_id',true));--> statement-breakpoint
CREATE POLICY "form_webhook_settings_update" ON "form_webhook_settings" AS PERMISSIVE FOR UPDATE TO "snapform_runtime" USING ("form_webhook_settings"."workspace_id"::text = current_setting('snapform.workspace_id', true)
    and exists (select 1 from public.membership m
      where m.workspace_id = "form_webhook_settings"."workspace_id"
        and m.user_id = current_setting('snapform.user_id', true)
        and m.role in ('owner', 'editor'))) WITH CHECK ("form_webhook_settings"."workspace_id"::text = current_setting('snapform.workspace_id', true)
    and exists (select 1 from public.membership m
      where m.workspace_id = "form_webhook_settings"."workspace_id"
        and m.user_id = current_setting('snapform.user_id', true)
        and m.role in ('owner', 'editor')) and "form_webhook_settings"."updated_by"=current_setting('snapform.user_id',true));--> statement-breakpoint
CREATE POLICY "webhook_configuration_read" ON "webhook_configuration" AS PERMISSIVE FOR SELECT TO "snapform_runtime" USING ("webhook_configuration"."workspace_id"::text = current_setting('snapform.workspace_id', true)
    and exists (select 1 from public.membership m
      where m.workspace_id = "webhook_configuration"."workspace_id"
        and m.user_id = current_setting('snapform.user_id', true)
        and m.role in ('owner', 'editor')));--> statement-breakpoint
CREATE POLICY "webhook_configuration_create" ON "webhook_configuration" AS PERMISSIVE FOR INSERT TO "snapform_runtime" WITH CHECK ("webhook_configuration"."workspace_id"::text = current_setting('snapform.workspace_id', true)
    and exists (select 1 from public.membership m
      where m.workspace_id = "webhook_configuration"."workspace_id"
        and m.user_id = current_setting('snapform.user_id', true)
        and m.role in ('owner', 'editor')) and "webhook_configuration"."created_by"=current_setting('snapform.user_id',true) and "webhook_configuration"."verified_at" is null);
--> statement-breakpoint
REVOKE ALL ON TABLE public.webhook_configuration,public.form_webhook_settings FROM PUBLIC;
--> statement-breakpoint
GRANT SELECT,INSERT ON public.webhook_configuration TO snapform_runtime;
--> statement-breakpoint
GRANT SELECT,INSERT,UPDATE ON public.form_webhook_settings TO snapform_runtime;
--> statement-breakpoint
CREATE FUNCTION public.require_verified_webhook()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF NEW.enabled AND NOT EXISTS(SELECT 1 FROM public.webhook_configuration c
  WHERE c.workspace_id=NEW.workspace_id AND c.form_id=NEW.form_id
   AND c.id=NEW.configuration_id AND c.verified_at IS NOT NULL) THEN
  RAISE EXCEPTION 'Webhook preflight is required' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.require_verified_webhook() FROM PUBLIC;
--> statement-breakpoint
CREATE TRIGGER form_webhook_preflight BEFORE INSERT OR UPDATE ON public.form_webhook_settings
FOR EACH ROW EXECUTE FUNCTION public.require_verified_webhook();
