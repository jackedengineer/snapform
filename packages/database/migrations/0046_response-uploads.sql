SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
CREATE TABLE "response_file" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"form_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"object_key" text NOT NULL,
	"name" text NOT NULL,
	"content_type" text NOT NULL,
	"size" integer NOT NULL,
	"sha256" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "response_file_object_key_unique" UNIQUE("object_key"),
	CONSTRAINT "response_file_key" CHECK ("response_file"."object_key" = "response_file"."workspace_id"::text||'/'||"response_file"."form_id"::text||'/'||"response_file"."session_id"::text||'/'||right("response_file"."object_key",43) and right("response_file"."object_key",43) ~ '^[A-Za-z0-9_-]{43}$'),
	CONSTRAINT "response_file_name" CHECK (char_length("response_file"."name") between 1 and 200 and "response_file"."name" !~ '[[:cntrl:]/\\]'),
	CONSTRAINT "response_file_type" CHECK ("response_file"."content_type" in ('application/pdf','image/png','image/jpeg','image/webp','image/gif','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.openxmlformats-officedocument.presentationml.presentation','text/plain','text/csv')),
	CONSTRAINT "response_file_size" CHECK ("response_file"."size" between 1 and 26214400),
	CONSTRAINT "response_file_hash" CHECK ("response_file"."sha256" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
ALTER TABLE "response_file" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "response_file" ADD CONSTRAINT "response_file_session_fk" FOREIGN KEY ("workspace_id","form_id","version_id","session_id") REFERENCES "public"."response_session"("workspace_id","form_id","version_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "response_file_question_idx" ON "response_file" USING btree ("session_id","question_id");--> statement-breakpoint
CREATE POLICY "response_file_creator_read" ON "response_file" AS PERMISSIVE FOR SELECT TO "snapform_runtime" USING (("response_file"."workspace_id"::text = current_setting('snapform.workspace_id', true)
    and exists (select 1 from public.membership m
      where m.workspace_id = "response_file"."workspace_id"
        and m.user_id = current_setting('snapform.user_id', true)
        and true)) and exists (select 1 from public.response_session s where s.id = "response_file"."session_id" and s.status = 'submitted'));
--> statement-breakpoint
-- Members read rows of submitted responses through the policy above. Respondents
-- and Jobs use only the functions below; nothing writes the table directly.
REVOKE ALL ON TABLE public.response_file FROM PUBLIC,snapform_runtime,snapform_jobs;
--> statement-breakpoint
GRANT SELECT ON TABLE public.response_file TO snapform_runtime;
--> statement-breakpoint
-- Mirrors packages/contracts/src/plans.ts: uploads are a Pro feature.
CREATE FUNCTION public.workspace_uploads_allowed(requested_workspace uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT coalesce((SELECT l.plan='pro' FROM public.workspace_plan_limits(requested_workspace) l),false)
$$;
--> statement-breakpoint
-- File ids a session's current answers reference, per file question of its pinned version.
CREATE FUNCTION public.intake_file_references(requested_session uuid)
RETURNS TABLE(question_id uuid,file_id text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT (b->>'id')::uuid,ref.value FROM public.response_session s
 JOIN public.form_version v ON v.workspace_id=s.workspace_id AND v.form_id=s.form_id AND v.id=s.version_id
 CROSS JOIN LATERAL jsonb_path_query(v.definition,'$.pages[*].blocks[*] ? (@.type == "file")') b
 CROSS JOIN LATERAL jsonb_array_elements_text(CASE WHEN s.answers->(b->>'id')->>'state'='value'
  AND jsonb_typeof(s.answers->(b->>'id')->'value')='array' THEN s.answers->(b->>'id')->'value' ELSE '[]'::jsonb END) ref
 WHERE s.id=requested_session
$$;
--> statement-breakpoint
-- Whether one more file may be added to a collecting session's file question.
-- Callers have already scoped the capability with scope_intake_request.
CREATE FUNCTION public.intake_file_slot(requested_session uuid,requested_question uuid)
RETURNS TABLE(outcome text,file_workspace uuid,file_form uuid)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE current_session public.response_session%ROWTYPE; file_limit integer;
BEGIN
 outcome:='INTAKE_UNAVAILABLE';
 SELECT s.* INTO current_session FROM public.response_session s
 WHERE s.id=requested_session AND public.intake_session_access(s.id);
 IF NOT FOUND THEN RETURN NEXT; RETURN; END IF;
 IF current_session.status<>'collecting' THEN outcome:='INTAKE_ALREADY_SUBMITTED'; RETURN NEXT; RETURN; END IF;
 IF NOT public.workspace_uploads_allowed(current_session.workspace_id) THEN
  outcome:='UPLOADS_UNAVAILABLE'; RETURN NEXT; RETURN;
 END IF;
 SELECT (b->>'maxFiles')::integer INTO file_limit FROM public.form_version v
 CROSS JOIN LATERAL jsonb_path_query(v.definition,'$.pages[*].blocks[*] ? (@.type == "file")') b
 WHERE v.workspace_id=current_session.workspace_id AND v.form_id=current_session.form_id
  AND v.id=current_session.version_id AND b->>'id'=requested_question::text;
 IF file_limit IS NULL OR file_limit NOT BETWEEN 1 AND 3 THEN
  outcome:='FILE_QUESTION_UNAVAILABLE'; RETURN NEXT; RETURN;
 END IF;
 IF (SELECT count(*) FROM public.response_file f WHERE f.session_id=requested_session
  AND f.question_id=requested_question)>=file_limit THEN outcome:='FILE_LIMIT_REACHED'; RETURN NEXT; RETURN; END IF;
 outcome:='ok'; file_workspace:=current_session.workspace_id; file_form:=current_session.form_id;
 RETURN NEXT;
END $$;
--> statement-breakpoint
-- Checked before streaming, so a refused upload stores nothing. The key prefix
-- workspace/form/session comes from here, never from the request.
CREATE FUNCTION public.authorize_intake_file(requested_public uuid,requested_session uuid,requested_hash text,requested_question uuid)
RETURNS TABLE(outcome text,file_workspace uuid,file_form uuid)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 PERFORM public.scope_intake_request(requested_public,requested_session,requested_hash);
 RETURN QUERY SELECT * FROM public.intake_file_slot(requested_session,requested_question);
EXCEPTION WHEN SQLSTATE 'SF001' THEN
 RETURN QUERY SELECT 'INTAKE_UNAVAILABLE'::text,NULL::uuid,NULL::uuid;
END $$;
--> statement-breakpoint
-- Records a stored object after the API verified its bytes. The session row lock
-- serializes concurrent uploads and submission, so the file limit holds.
CREATE FUNCTION public.record_intake_file(requested_public uuid,requested_session uuid,requested_hash text,
 requested_file uuid,requested_question uuid,requested_key text,requested_name text,requested_type text,
 requested_size integer,requested_sha256 text)
RETURNS text LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE slot record;
BEGIN
 PERFORM public.scope_intake_request(requested_public,requested_session,requested_hash);
 PERFORM 1 FROM public.response_session s
 WHERE s.id=requested_session AND public.intake_session_access(s.id) FOR UPDATE;
 IF NOT FOUND THEN RETURN 'INTAKE_UNAVAILABLE'; END IF;
 SELECT * INTO slot FROM public.intake_file_slot(requested_session,requested_question);
 IF slot.outcome IS DISTINCT FROM 'ok' THEN RETURN coalesce(slot.outcome,'INTAKE_UNAVAILABLE'); END IF;
 INSERT INTO public.response_file(id,workspace_id,form_id,version_id,session_id,question_id,object_key,
  name,content_type,size,sha256)
 SELECT requested_file,s.workspace_id,s.form_id,s.version_id,s.id,requested_question,requested_key,
  requested_name,requested_type,requested_size,requested_sha256
 FROM public.response_session s WHERE s.id=requested_session;
 RETURN 'ok';
EXCEPTION
 WHEN SQLSTATE 'SF001' THEN RETURN 'INTAKE_UNAVAILABLE';
 WHEN check_violation OR unique_violation OR not_null_violation THEN RETURN 'INVALID_FILE';
END $$;
--> statement-breakpoint
-- The respondent's own files, so names show again after a reload. Raises when
-- the capability no longer opens the session.
CREATE FUNCTION public.list_intake_files(requested_public uuid,requested_session uuid,requested_hash text)
RETURNS TABLE(id uuid,question_id uuid,name text,content_type text,size integer)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 PERFORM public.scope_intake_request(requested_public,requested_session,requested_hash);
 IF NOT public.intake_session_access(requested_session) THEN
  RAISE EXCEPTION 'INTAKE_UNAVAILABLE' USING ERRCODE='SF004';
 END IF;
 RETURN QUERY SELECT f.id,f.question_id,f.name,f.content_type,f.size FROM public.response_file f
 WHERE f.session_id=requested_session ORDER BY f.created_at,f.id;
END $$;
--> statement-breakpoint
-- Removes one of a collecting session's files and returns its key for the API to
-- delete, or NULL when the file is not this session's.
CREATE FUNCTION public.remove_intake_file(requested_public uuid,requested_session uuid,requested_hash text,requested_file uuid)
RETURNS text LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE session_status text; removed text;
BEGIN
 PERFORM public.scope_intake_request(requested_public,requested_session,requested_hash);
 SELECT s.status INTO session_status FROM public.response_session s
 WHERE s.id=requested_session AND public.intake_session_access(s.id) FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'INTAKE_UNAVAILABLE' USING ERRCODE='SF004'; END IF;
 IF session_status<>'collecting' THEN RAISE EXCEPTION 'INTAKE_ALREADY_SUBMITTED' USING ERRCODE='SF004'; END IF;
 DELETE FROM public.response_file f WHERE f.id=requested_file AND f.session_id=requested_session
 RETURNING f.object_key INTO removed;
 RETURN removed;
END $$;
--> statement-breakpoint
-- After submission, files the final answers do not reference (removed from the
-- answer, or on a question the rules skipped) are dropped; the API deletes the keys.
CREATE FUNCTION public.discard_unreferenced_intake_files(requested_public uuid,requested_session uuid,requested_hash text)
RETURNS SETOF text LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE removed text;
BEGIN
 PERFORM public.scope_intake_request(requested_public,requested_session,requested_hash);
 FOR removed IN DELETE FROM public.response_file f USING public.response_session s
  WHERE s.id=requested_session AND f.session_id=s.id AND s.status='submitted'
   AND public.intake_session_access(s.id)
   AND NOT EXISTS(SELECT 1 FROM public.intake_file_references(s.id) r
    WHERE r.question_id=f.question_id AND r.file_id=f.id::text)
  RETURNING f.object_key
 LOOP RETURN NEXT removed; END LOOP;
END $$;
--> statement-breakpoint
-- 0035's body plus one rule: a submission may reference only files this session
-- uploaded to the same question. A refusal rolls the whole submission back.
CREATE OR REPLACE FUNCTION public.write_intake_session(requested_public uuid,requested_session uuid,requested_hash text,
 requested_operation uuid,requested_revision integer,requested_kind text,requested_answers jsonb,prepared_answers jsonb,prepared_ending uuid)
RETURNS TABLE(outcome text,revision integer,current_revision integer,status text)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE receipt record; failure text:='INTAKE_UNAVAILABLE';
BEGIN
 PERFORM public.scope_intake_request(requested_public,requested_session,requested_hash);
 SELECT * INTO receipt FROM public.mutate_response_session(requested_session,requested_operation,
  requested_revision,requested_kind,requested_answers,prepared_answers,prepared_ending);
 IF NOT FOUND OR receipt.outcome IS DISTINCT FROM 'ok' THEN
  failure:=coalesce(receipt.outcome,'INTAKE_UNAVAILABLE');
  RAISE EXCEPTION 'INTAKE_WRITE_REJECTED' USING ERRCODE='SF001';
 END IF;
 IF requested_kind='submit' AND EXISTS(SELECT 1 FROM public.intake_file_references(requested_session) r
  WHERE NOT EXISTS(SELECT 1 FROM public.response_file f WHERE f.session_id=requested_session
   AND f.question_id=r.question_id AND f.id::text=r.file_id)) THEN
  failure:='INTAKE_FILES_INVALID';
  RAISE EXCEPTION 'INTAKE_WRITE_REJECTED' USING ERRCODE='SF001';
 END IF;
 RETURN QUERY SELECT receipt.outcome::text,receipt.revision::integer,receipt.current_revision::integer,receipt.status::text;
EXCEPTION WHEN SQLSTATE 'SF001' THEN
 -- Variables survive the block rollback; quota/session/receipt/outbox changes do not.
 RETURN QUERY SELECT failure,NULL::integer,NULL::integer,NULL::text;
END $$;
--> statement-breakpoint
-- Jobs deletes every object under this prefix before finalizing a purge intent,
-- including objects an interrupted upload left without a row. NULL: nothing remains.
CREATE FUNCTION public.purge_file_prefix(requested_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT CASE WHEN p.kind='workspace' THEN p.workspace_id::text||'/'
  ELSE (SELECT s.workspace_id::text||'/'||s.form_id::text||'/'||s.id::text||'/' FROM public.response_session s
   WHERE s.id=p.target_id AND s.workspace_id=p.workspace_id) END
 FROM public.purge_intent p WHERE p.id=requested_id AND p.completed_at IS NULL
$$;
--> statement-breakpoint
-- File metadata for a leased webhook delivery: names, types and sizes, never keys.
CREATE FUNCTION public.webhook_delivery_files(requested_id uuid,requested_token uuid)
RETURNS TABLE(id uuid,question_id uuid,name text,content_type text,size integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT f.id,f.question_id,f.name,f.content_type,f.size FROM public.webhook_delivery d
 JOIN public.response_file f ON f.workspace_id=d.workspace_id AND f.form_id=d.form_id AND f.session_id=d.session_id
 WHERE d.id=requested_id AND d.status='sending' AND d.lease_token=requested_token AND d.lease_until>now()
 ORDER BY f.created_at,f.id
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.workspace_uploads_allowed(uuid),public.intake_file_references(uuid),
 public.intake_file_slot(uuid,uuid),public.authorize_intake_file(uuid,uuid,text,uuid),
 public.record_intake_file(uuid,uuid,text,uuid,uuid,text,text,text,integer,text),
 public.list_intake_files(uuid,uuid,text),public.remove_intake_file(uuid,uuid,text,uuid),
 public.discard_unreferenced_intake_files(uuid,uuid,text),public.purge_file_prefix(uuid),
 public.webhook_delivery_files(uuid,uuid)
 FROM PUBLIC,snapform_runtime,snapform_jobs;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.authorize_intake_file(uuid,uuid,text,uuid),
 public.record_intake_file(uuid,uuid,text,uuid,uuid,text,text,text,integer,text),
 public.list_intake_files(uuid,uuid,text),public.remove_intake_file(uuid,uuid,text,uuid),
 public.discard_unreferenced_intake_files(uuid,uuid,text) TO snapform_runtime;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.purge_file_prefix(uuid),public.webhook_delivery_files(uuid,uuid) TO snapform_jobs;
