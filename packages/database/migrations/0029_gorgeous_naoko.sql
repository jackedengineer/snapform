SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
CREATE TABLE "workspace_retention" (
	"workspace_id" uuid PRIMARY KEY NOT NULL,
	"days" integer DEFAULT 90 NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"updated_by" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_retention_days" CHECK ("workspace_retention"."days" in (30,90,365)),
	CONSTRAINT "workspace_retention_revision" CHECK ("workspace_retention"."revision">0)
);
--> statement-breakpoint
ALTER TABLE "workspace_retention" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "workspace_retention" ADD CONSTRAINT "workspace_retention_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_retention" ADD CONSTRAINT "workspace_retention_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "workspace_retention_read" ON "workspace_retention" AS PERMISSIVE FOR SELECT TO "snapform_runtime" USING ("workspace_retention"."workspace_id"::text = current_setting('snapform.workspace_id', true)
    and exists (select 1 from public.membership m
      where m.workspace_id = "workspace_retention"."workspace_id"
        and m.user_id = current_setting('snapform.user_id', true)
        and true));--> statement-breakpoint
CREATE POLICY "workspace_retention_create" ON "workspace_retention" AS PERMISSIVE FOR INSERT TO "snapform_runtime" WITH CHECK ("workspace_retention"."workspace_id"::text=current_setting('snapform.workspace_id',true) and exists(select 1 from public.membership m where m.workspace_id="workspace_retention"."workspace_id" and m.user_id=current_setting('snapform.user_id',true) and m.role='owner') and "workspace_retention"."updated_by"=current_setting('snapform.user_id',true));--> statement-breakpoint
CREATE POLICY "workspace_retention_update" ON "workspace_retention" AS PERMISSIVE FOR UPDATE TO "snapform_runtime" USING ("workspace_retention"."workspace_id"::text=current_setting('snapform.workspace_id',true) and exists(select 1 from public.membership m where m.workspace_id="workspace_retention"."workspace_id" and m.user_id=current_setting('snapform.user_id',true) and m.role='owner')) WITH CHECK ("workspace_retention"."workspace_id"::text=current_setting('snapform.workspace_id',true) and exists(select 1 from public.membership m where m.workspace_id="workspace_retention"."workspace_id" and m.user_id=current_setting('snapform.user_id',true) and m.role='owner') and "workspace_retention"."updated_by"=current_setting('snapform.user_id',true));
--> statement-breakpoint
ALTER TABLE public.workspace_retention FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON TABLE public.workspace_retention FROM PUBLIC,snapform_runtime,snapform_jobs;
--> statement-breakpoint
GRANT SELECT,INSERT,UPDATE ON TABLE public.workspace_retention TO snapform_runtime;
