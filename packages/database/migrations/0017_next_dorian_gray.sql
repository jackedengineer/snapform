SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
CREATE INDEX "response_session_inbox_idx" ON "response_session" USING btree ("workspace_id","form_id","submitted_at" DESC NULLS LAST,"id" DESC NULLS LAST) WHERE "response_session"."status" = 'submitted';--> statement-breakpoint
CREATE POLICY "response_session_creator_read" ON "response_session" AS PERMISSIVE FOR SELECT TO "snapform_runtime" USING ("response_session"."status" = 'submitted' and ("response_session"."workspace_id"::text = current_setting('snapform.workspace_id', true)
    and exists (select 1 from public.membership m
      where m.workspace_id = "response_session"."workspace_id"
        and m.user_id = current_setting('snapform.user_id', true)
        and true)));
