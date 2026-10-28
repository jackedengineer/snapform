CREATE TYPE "public"."workspace_role" AS ENUM('owner', 'editor', 'viewer');--> statement-breakpoint
CREATE TABLE "membership" (
	"workspace_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"role" "workspace_role" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "membership_workspace_id_user_id_pk" PRIMARY KEY("workspace_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "membership" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "workspace" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"segment" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_name_length" CHECK (length(trim("workspace"."name")) between 2 and 80),
	CONSTRAINT "workspace_segment" CHECK ("workspace"."segment" in ('agency', 'coach', 'consultant', 'startup'))
);
--> statement-breakpoint
ALTER TABLE "workspace" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "membership" ADD CONSTRAINT "membership_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership" ADD CONSTRAINT "membership_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace" ADD CONSTRAINT "workspace_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "membership_user_workspace_idx" ON "membership" USING btree ("user_id","workspace_id");--> statement-breakpoint
CREATE POLICY "membership_read" ON "membership" AS PERMISSIVE FOR SELECT TO "snapform_runtime" USING ("membership"."user_id" = current_setting('snapform.user_id', true) or "membership"."workspace_id"::text = current_setting('snapform.workspace_id', true));--> statement-breakpoint
CREATE POLICY "membership_create" ON "membership" AS PERMISSIVE FOR INSERT TO "snapform_runtime" WITH CHECK ("membership"."workspace_id"::text = current_setting('snapform.workspace_id', true) and current_setting('snapform.role', true) = 'owner');--> statement-breakpoint
CREATE POLICY "membership_update" ON "membership" AS PERMISSIVE FOR UPDATE TO "snapform_runtime" USING ("membership"."workspace_id"::text = current_setting('snapform.workspace_id', true) and current_setting('snapform.role', true) = 'owner') WITH CHECK ("membership"."workspace_id"::text = current_setting('snapform.workspace_id', true) and current_setting('snapform.role', true) = 'owner');--> statement-breakpoint
CREATE POLICY "membership_delete" ON "membership" AS PERMISSIVE FOR DELETE TO "snapform_runtime" USING ("membership"."workspace_id"::text = current_setting('snapform.workspace_id', true) and current_setting('snapform.role', true) = 'owner');--> statement-breakpoint
CREATE POLICY "workspace_read" ON "workspace" AS PERMISSIVE FOR SELECT TO "snapform_runtime" USING (exists (select 1 from public.membership m where m.workspace_id = "workspace"."id" and m.user_id = current_setting('snapform.user_id', true)));--> statement-breakpoint
CREATE POLICY "workspace_create" ON "workspace" AS PERMISSIVE FOR INSERT TO "snapform_runtime" WITH CHECK ("workspace"."id"::text = current_setting('snapform.workspace_id', true) and "workspace"."created_by" = current_setting('snapform.user_id', true));--> statement-breakpoint
CREATE POLICY "workspace_update" ON "workspace" AS PERMISSIVE FOR UPDATE TO "snapform_runtime" USING ("workspace"."id"::text = current_setting('snapform.workspace_id', true) and current_setting('snapform.role', true) = 'owner') WITH CHECK ("workspace"."id"::text = current_setting('snapform.workspace_id', true) and current_setting('snapform.role', true) = 'owner');