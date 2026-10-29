CREATE TABLE "form_publication" (
	"workspace_id" uuid NOT NULL,
	"form_id" uuid NOT NULL,
	"public_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"active" boolean DEFAULT false NOT NULL,
	"updated_by" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "form_publication_workspace_id_form_id_pk" PRIMARY KEY("workspace_id","form_id"),
	CONSTRAINT "form_publication_public_identity" UNIQUE("public_id")
);
--> statement-breakpoint
ALTER TABLE "form_publication" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "form_version" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"form_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"source_revision" integer NOT NULL,
	"definition" jsonb NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "form_version_tenant_identity" UNIQUE("workspace_id","form_id","id"),
	CONSTRAINT "form_version_number" UNIQUE("workspace_id","form_id","number"),
	CONSTRAINT "form_version_positive_revisions" CHECK ("form_version"."number" > 0 and "form_version"."source_revision" > 0),
	CONSTRAINT "form_version_definition_object" CHECK (jsonb_typeof("form_version"."definition") = 'object' and coalesce("form_version"."definition"->>'contractVersion', '') = '1')
);
--> statement-breakpoint
ALTER TABLE "form_version" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "form_publication" ADD CONSTRAINT "form_publication_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_publication" ADD CONSTRAINT "form_publication_workspace_id_form_id_form_workspace_id_id_fk" FOREIGN KEY ("workspace_id","form_id") REFERENCES "public"."form"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_publication" ADD CONSTRAINT "form_publication_workspace_id_form_id_version_id_form_version_workspace_id_form_id_id_fk" FOREIGN KEY ("workspace_id","form_id","version_id") REFERENCES "public"."form_version"("workspace_id","form_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_version" ADD CONSTRAINT "form_version_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_version" ADD CONSTRAINT "form_version_workspace_id_form_id_form_workspace_id_id_fk" FOREIGN KEY ("workspace_id","form_id") REFERENCES "public"."form"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "form_publication_read" ON "form_publication" AS PERMISSIVE FOR SELECT TO "snapform_runtime" USING ("form_publication"."workspace_id"::text = current_setting('snapform.workspace_id', true)
    and exists (select 1 from public.membership m
      where m.workspace_id = "form_publication"."workspace_id"
        and m.user_id = current_setting('snapform.user_id', true)
        and true));--> statement-breakpoint
CREATE POLICY "form_publication_create" ON "form_publication" AS PERMISSIVE FOR INSERT TO "snapform_runtime" WITH CHECK ("form_publication"."workspace_id"::text = current_setting('snapform.workspace_id', true)
    and exists (select 1 from public.membership m
      where m.workspace_id = "form_publication"."workspace_id"
        and m.user_id = current_setting('snapform.user_id', true)
        and m.role in ('owner', 'editor')) and "form_publication"."updated_by" = current_setting('snapform.user_id', true));--> statement-breakpoint
CREATE POLICY "form_publication_update" ON "form_publication" AS PERMISSIVE FOR UPDATE TO "snapform_runtime" USING ("form_publication"."workspace_id"::text = current_setting('snapform.workspace_id', true)
    and exists (select 1 from public.membership m
      where m.workspace_id = "form_publication"."workspace_id"
        and m.user_id = current_setting('snapform.user_id', true)
        and m.role in ('owner', 'editor'))) WITH CHECK ("form_publication"."workspace_id"::text = current_setting('snapform.workspace_id', true)
    and exists (select 1 from public.membership m
      where m.workspace_id = "form_publication"."workspace_id"
        and m.user_id = current_setting('snapform.user_id', true)
        and m.role in ('owner', 'editor')) and "form_publication"."updated_by" = current_setting('snapform.user_id', true));--> statement-breakpoint
CREATE POLICY "form_version_read" ON "form_version" AS PERMISSIVE FOR SELECT TO "snapform_runtime" USING ("form_version"."workspace_id"::text = current_setting('snapform.workspace_id', true)
    and exists (select 1 from public.membership m
      where m.workspace_id = "form_version"."workspace_id"
        and m.user_id = current_setting('snapform.user_id', true)
        and true));--> statement-breakpoint
CREATE POLICY "form_version_create" ON "form_version" AS PERMISSIVE FOR INSERT TO "snapform_runtime" WITH CHECK ("form_version"."workspace_id"::text = current_setting('snapform.workspace_id', true)
    and exists (select 1 from public.membership m
      where m.workspace_id = "form_version"."workspace_id"
        and m.user_id = current_setting('snapform.user_id', true)
        and m.role in ('owner', 'editor')) and "form_version"."created_by" = current_setting('snapform.user_id', true));