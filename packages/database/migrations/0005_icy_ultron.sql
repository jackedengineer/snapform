CREATE TABLE "draft_operation" (
	"workspace_id" uuid NOT NULL,
	"form_id" uuid NOT NULL,
	"id" uuid NOT NULL,
	"actor_id" text NOT NULL,
	"base_revision" integer NOT NULL,
	"result_revision" integer NOT NULL,
	"payload_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "draft_operation_workspace_id_form_id_id_pk" PRIMARY KEY("workspace_id","form_id","id"),
	CONSTRAINT "draft_operation_revision_step" CHECK ("draft_operation"."base_revision" >= 0 and "draft_operation"."result_revision" = "draft_operation"."base_revision" + 1),
	CONSTRAINT "draft_operation_hash" CHECK ("draft_operation"."payload_hash" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
ALTER TABLE "draft_operation" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "form" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "form_workspace_id_unique" UNIQUE("workspace_id","id")
);
--> statement-breakpoint
ALTER TABLE "form" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "form_draft" (
	"workspace_id" uuid NOT NULL,
	"form_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"definition" jsonb NOT NULL,
	"updated_by" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "form_draft_workspace_id_form_id_pk" PRIMARY KEY("workspace_id","form_id"),
	CONSTRAINT "form_draft_revision_positive" CHECK ("form_draft"."revision" > 0),
	CONSTRAINT "form_draft_definition_object" CHECK (jsonb_typeof("form_draft"."definition") = 'object' and coalesce("form_draft"."definition"->>'contractVersion', '') = '1')
);
--> statement-breakpoint
ALTER TABLE "form_draft" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "draft_operation" ADD CONSTRAINT "draft_operation_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "draft_operation" ADD CONSTRAINT "draft_operation_workspace_id_form_id_form_workspace_id_id_fk" FOREIGN KEY ("workspace_id","form_id") REFERENCES "public"."form"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form" ADD CONSTRAINT "form_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form" ADD CONSTRAINT "form_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_draft" ADD CONSTRAINT "form_draft_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_draft" ADD CONSTRAINT "form_draft_workspace_id_form_id_form_workspace_id_id_fk" FOREIGN KEY ("workspace_id","form_id") REFERENCES "public"."form"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "form_workspace_created_idx" ON "form" USING btree ("workspace_id","created_at","id");--> statement-breakpoint
CREATE POLICY "draft_operation_read" ON "draft_operation" AS PERMISSIVE FOR SELECT TO "snapform_runtime" USING ("draft_operation"."workspace_id"::text = current_setting('snapform.workspace_id', true)
    and exists (select 1 from public.membership m
      where m.workspace_id = "draft_operation"."workspace_id"
        and m.user_id = current_setting('snapform.user_id', true)
        and m.role in ('owner', 'editor')));--> statement-breakpoint
CREATE POLICY "draft_operation_create" ON "draft_operation" AS PERMISSIVE FOR INSERT TO "snapform_runtime" WITH CHECK ("draft_operation"."workspace_id"::text = current_setting('snapform.workspace_id', true)
    and exists (select 1 from public.membership m
      where m.workspace_id = "draft_operation"."workspace_id"
        and m.user_id = current_setting('snapform.user_id', true)
        and m.role in ('owner', 'editor')) and "draft_operation"."actor_id" = current_setting('snapform.user_id', true));--> statement-breakpoint
CREATE POLICY "form_read" ON "form" AS PERMISSIVE FOR SELECT TO "snapform_runtime" USING ("form"."workspace_id"::text = current_setting('snapform.workspace_id', true)
    and exists (select 1 from public.membership m
      where m.workspace_id = "form"."workspace_id"
        and m.user_id = current_setting('snapform.user_id', true)
        and true));--> statement-breakpoint
CREATE POLICY "form_create" ON "form" AS PERMISSIVE FOR INSERT TO "snapform_runtime" WITH CHECK ("form"."workspace_id"::text = current_setting('snapform.workspace_id', true)
    and exists (select 1 from public.membership m
      where m.workspace_id = "form"."workspace_id"
        and m.user_id = current_setting('snapform.user_id', true)
        and m.role in ('owner', 'editor')) and "form"."created_by" = current_setting('snapform.user_id', true));--> statement-breakpoint
CREATE POLICY "form_draft_read" ON "form_draft" AS PERMISSIVE FOR SELECT TO "snapform_runtime" USING ("form_draft"."workspace_id"::text = current_setting('snapform.workspace_id', true)
    and exists (select 1 from public.membership m
      where m.workspace_id = "form_draft"."workspace_id"
        and m.user_id = current_setting('snapform.user_id', true)
        and true));--> statement-breakpoint
CREATE POLICY "form_draft_create" ON "form_draft" AS PERMISSIVE FOR INSERT TO "snapform_runtime" WITH CHECK ("form_draft"."workspace_id"::text = current_setting('snapform.workspace_id', true)
    and exists (select 1 from public.membership m
      where m.workspace_id = "form_draft"."workspace_id"
        and m.user_id = current_setting('snapform.user_id', true)
        and m.role in ('owner', 'editor')) and "form_draft"."updated_by" = current_setting('snapform.user_id', true));--> statement-breakpoint
CREATE POLICY "form_draft_update" ON "form_draft" AS PERMISSIVE FOR UPDATE TO "snapform_runtime" USING ("form_draft"."workspace_id"::text = current_setting('snapform.workspace_id', true)
    and exists (select 1 from public.membership m
      where m.workspace_id = "form_draft"."workspace_id"
        and m.user_id = current_setting('snapform.user_id', true)
        and m.role in ('owner', 'editor'))) WITH CHECK ("form_draft"."workspace_id"::text = current_setting('snapform.workspace_id', true)
    and exists (select 1 from public.membership m
      where m.workspace_id = "form_draft"."workspace_id"
        and m.user_id = current_setting('snapform.user_id', true)
        and m.role in ('owner', 'editor')) and "form_draft"."updated_by" = current_setting('snapform.user_id', true));