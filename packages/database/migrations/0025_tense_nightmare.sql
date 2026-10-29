SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
CREATE TABLE "webhook_delivery" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"form_id" uuid NOT NULL,
	"configuration_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"event_id" uuid,
	"session_id" uuid,
	"kind" text NOT NULL,
	"payload" text,
	"status" text DEFAULT 'preview' NOT NULL,
	"reason" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"first_attempt_at" timestamp with time zone,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lease_token" uuid,
	"lease_until" timestamp with time zone,
	"http_status" integer,
	"acknowledged_at" timestamp with time zone,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "webhook_delivery_event" UNIQUE("event_id"),
	CONSTRAINT "webhook_delivery_kind" CHECK (("webhook_delivery"."kind"='test' and "webhook_delivery"."event_id" is null and "webhook_delivery"."session_id" is null and "webhook_delivery"."created_by" is not null and "webhook_delivery"."payload" is not null) or ("webhook_delivery"."kind"='response.submitted' and "webhook_delivery"."event_id" is not null and "webhook_delivery"."session_id" is not null and "webhook_delivery"."created_by" is null)),
	CONSTRAINT "webhook_delivery_attempts" CHECK ("webhook_delivery"."attempts" between 0 and 8 and (("webhook_delivery"."attempts"=0 and "webhook_delivery"."first_attempt_at" is null) or ("webhook_delivery"."attempts">0 and "webhook_delivery"."first_attempt_at" is not null))),
	CONSTRAINT "webhook_delivery_payload" CHECK ("webhook_delivery"."payload" is null or octet_length("webhook_delivery"."payload") between 2 and 3145728),
	CONSTRAINT "webhook_delivery_http" CHECK ("webhook_delivery"."http_status" is null or "webhook_delivery"."http_status" between 100 and 599),
	CONSTRAINT "webhook_delivery_ack" CHECK ((("webhook_delivery"."status"='acknowledged')=("webhook_delivery"."acknowledged_at" is not null)) and ("webhook_delivery"."status"<>'acknowledged' or ("webhook_delivery"."payload" is not null and "webhook_delivery"."attempts">0))),
	CONSTRAINT "webhook_delivery_lease" CHECK (("webhook_delivery"."status"='sending' and "webhook_delivery"."attempts">0 and "webhook_delivery"."lease_token" is not null and "webhook_delivery"."lease_until" is not null) or ("webhook_delivery"."status"<>'sending' and "webhook_delivery"."lease_token" is null and "webhook_delivery"."lease_until" is null)),
	CONSTRAINT "webhook_delivery_state" CHECK (("webhook_delivery"."status" in ('preview','sending','acknowledged') and "webhook_delivery"."reason" is null and ("webhook_delivery"."status"<>'preview' or "webhook_delivery"."kind"='test')) or ("webhook_delivery"."status"='pending' and ("webhook_delivery"."reason" is null or "webhook_delivery"."reason" in ('rate-limited','receiver-unavailable'))) or ("webhook_delivery"."status"='unknown' and "webhook_delivery"."reason" is not distinct from 'receiver-unconfirmed') or ("webhook_delivery"."status"='cancelled' and coalesce("webhook_delivery"."reason",'') in ('disabled','configuration-changed')) or ("webhook_delivery"."status"='needs_action' and coalesce("webhook_delivery"."reason",'') in ('configuration','redirect-blocked','authorization','receiver-rejected','retry-later','attempts-exhausted','payload-invalid')))
);
--> statement-breakpoint
ALTER TABLE "webhook_delivery" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "webhook_delivery" ADD CONSTRAINT "webhook_delivery_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_delivery" ADD CONSTRAINT "webhook_delivery_configuration_tenant_fk" FOREIGN KEY ("workspace_id","form_id","configuration_id") REFERENCES "public"."webhook_configuration"("workspace_id","form_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_delivery" ADD CONSTRAINT "webhook_delivery_version_tenant_fk" FOREIGN KEY ("workspace_id","form_id","version_id") REFERENCES "public"."form_version"("workspace_id","form_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_delivery" ADD CONSTRAINT "webhook_delivery_event_tenant_fk" FOREIGN KEY ("event_id","workspace_id","form_id","session_id") REFERENCES "public"."response_outbox"("id","workspace_id","form_id","session_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "webhook_delivery_due_idx" ON "webhook_delivery" USING btree ("available_at","created_at") WHERE "webhook_delivery"."status"='pending';--> statement-breakpoint
CREATE INDEX "webhook_delivery_lease_idx" ON "webhook_delivery" USING btree ("lease_until") WHERE "webhook_delivery"."status"='sending';--> statement-breakpoint
CREATE POLICY "webhook_delivery_read" ON "webhook_delivery" AS PERMISSIVE FOR SELECT TO "snapform_runtime" USING ("webhook_delivery"."workspace_id"::text = current_setting('snapform.workspace_id', true)
    and exists (select 1 from public.membership m
      where m.workspace_id = "webhook_delivery"."workspace_id"
        and m.user_id = current_setting('snapform.user_id', true)
        and m.role in ('owner', 'editor')));--> statement-breakpoint
CREATE POLICY "webhook_delivery_preview" ON "webhook_delivery" AS PERMISSIVE FOR INSERT TO "snapform_runtime" WITH CHECK ("webhook_delivery"."workspace_id"::text = current_setting('snapform.workspace_id', true)
    and exists (select 1 from public.membership m
      where m.workspace_id = "webhook_delivery"."workspace_id"
        and m.user_id = current_setting('snapform.user_id', true)
        and m.role in ('owner', 'editor')) and "webhook_delivery"."kind"='test' and "webhook_delivery"."status"='preview' and "webhook_delivery"."attempts"=0 and "webhook_delivery"."created_by"=current_setting('snapform.user_id',true) and exists(select 1 from "form_webhook_settings" s where s.workspace_id="webhook_delivery"."workspace_id" and s.form_id="webhook_delivery"."form_id" and s.configuration_id="webhook_delivery"."configuration_id") and exists(select 1 from "form_publication" p where p.workspace_id="webhook_delivery"."workspace_id" and p.form_id="webhook_delivery"."form_id" and p.version_id="webhook_delivery"."version_id" and p.active));
--> statement-breakpoint
REVOKE ALL ON TABLE public.webhook_delivery FROM PUBLIC;
--> statement-breakpoint
GRANT SELECT,INSERT ON public.webhook_delivery TO snapform_runtime;
