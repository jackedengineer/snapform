SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
CREATE TABLE "deletion_request" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"target_id" uuid NOT NULL,
	"requested_by" text NOT NULL,
	"requested_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"not_before" timestamp with time zone NOT NULL,
	"cancelled_at" timestamp with time zone,
	"cancelled_by" text,
	"purge_id" uuid,
	"revision" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "deletion_request_kind" CHECK ("deletion_request"."kind" in ('response','workspace')),
	CONSTRAINT "deletion_request_workspace_target" CHECK ("deletion_request"."kind"='response' or "deletion_request"."target_id"="deletion_request"."workspace_id"),
	CONSTRAINT "deletion_request_deadline" CHECK ("deletion_request"."not_before"="deletion_request"."requested_at"+interval '24 hours'),
	CONSTRAINT "deletion_request_cancellation" CHECK (("deletion_request"."cancelled_at" is null and "deletion_request"."cancelled_by" is null) or ("deletion_request"."cancelled_at" is not null and "deletion_request"."cancelled_by" is not null and "deletion_request"."cancelled_at">="deletion_request"."requested_at" and "deletion_request"."cancelled_at"<"deletion_request"."not_before" and "deletion_request"."purge_id" is null)),
	CONSTRAINT "deletion_request_revision" CHECK ("deletion_request"."revision">0)
);
--> statement-breakpoint
ALTER TABLE "deletion_request" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE UNIQUE INDEX "deletion_request_active_target" ON "deletion_request" USING btree ("kind","target_id") WHERE "deletion_request"."cancelled_at" is null;--> statement-breakpoint
CREATE INDEX "deletion_request_due" ON "deletion_request" USING btree ("not_before","id") WHERE "deletion_request"."cancelled_at" is null and "deletion_request"."purge_id" is null;--> statement-breakpoint
CREATE INDEX "deletion_request_workspace_target" ON "deletion_request" USING btree ("workspace_id","kind","target_id","requested_at");
--> statement-breakpoint
ALTER TABLE public.deletion_request FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON TABLE public.deletion_request FROM PUBLIC,snapform_runtime,snapform_jobs;
--> statement-breakpoint
CREATE FUNCTION public.deletion_receipt(requested_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('id',d.id,'workspaceId',d.workspace_id,'kind',d.kind,'targetId',d.target_id,
  'requestedAt',d.requested_at,'notBefore',d.not_before,'cancelledAt',d.cancelled_at,
  'deletedAt',p.completed_at,'revision',d.revision,
  'state',CASE WHEN d.cancelled_at IS NOT NULL THEN 'cancelled' WHEN p.completed_at IS NOT NULL THEN 'deleted'
   WHEN d.purge_id IS NOT NULL THEN 'purging' ELSE 'scheduled' END)
 FROM public.deletion_request d LEFT JOIN public.purge_intent p ON p.id=d.purge_id WHERE d.id=requested_id
$$;
--> statement-breakpoint
CREATE FUNCTION public.pending_workspace_deletion(requested_workspace uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT EXISTS(SELECT 1 FROM public.deletion_request d WHERE d.kind='workspace'
  AND d.target_id=requested_workspace AND d.cancelled_at IS NULL)
$$;
--> statement-breakpoint
CREATE FUNCTION public.schedule_deletion(requested_id uuid,requested_workspace uuid,requested_kind text,requested_target uuid,confirmation text,acknowledged boolean)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE member_role text; workspace_name text; existing public.deletion_request;
BEGIN
 IF requested_workspace::text IS DISTINCT FROM current_setting('snapform.workspace_id',true) THEN RAISE EXCEPTION 'WORKSPACE_NOT_FOUND'; END IF;
 SELECT m.role,w.name INTO member_role,workspace_name FROM public.workspace w JOIN public.membership m ON m.workspace_id=w.id
  WHERE w.id=requested_workspace AND m.user_id=current_setting('snapform.user_id',true) FOR UPDATE OF w;
 IF NOT FOUND THEN RAISE EXCEPTION 'WORKSPACE_NOT_FOUND'; END IF;
 IF member_role<>'owner' THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
 IF acknowledged IS DISTINCT FROM true OR requested_kind IS NULL OR requested_kind NOT IN('response','workspace')
  OR confirmation IS NULL OR confirmation<>(CASE WHEN requested_kind='response' THEN 'DELETE' ELSE workspace_name END)
  OR (requested_kind='workspace' AND requested_target IS DISTINCT FROM requested_workspace)
 THEN RAISE EXCEPTION 'INVALID_DELETION_CONFIRMATION'; END IF;
 SELECT * INTO existing FROM public.deletion_request d WHERE d.id=requested_id;
 IF FOUND THEN
  IF existing.workspace_id<>requested_workspace OR existing.kind<>requested_kind OR existing.target_id<>requested_target THEN RAISE EXCEPTION 'DELETION_CONFLICT'; END IF;
  RETURN public.deletion_receipt(existing.id);
 END IF;
 IF public.pending_workspace_deletion(requested_workspace) THEN RAISE EXCEPTION 'WORKSPACE_DELETION_PENDING'; END IF;
 IF requested_kind='response' THEN
  PERFORM 1 FROM public.response_session r WHERE r.id=requested_target AND r.workspace_id=requested_workspace FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'RESPONSE_NOT_FOUND'; END IF;
 END IF;
 IF EXISTS(SELECT 1 FROM public.purge_intent p WHERE p.kind=requested_kind AND p.target_id=requested_target)
  OR EXISTS(SELECT 1 FROM public.deletion_request d WHERE d.kind=requested_kind AND d.target_id=requested_target AND d.cancelled_at IS NULL)
 THEN RAISE EXCEPTION 'DELETION_CONFLICT'; END IF;
 INSERT INTO public.deletion_request(id,workspace_id,kind,target_id,requested_by,not_before)
  VALUES(requested_id,requested_workspace,requested_kind,requested_target,current_setting('snapform.user_id',true),statement_timestamp()+interval '24 hours');
 UPDATE public.response_outbox e SET completed_at=coalesce(e.completed_at,statement_timestamp()),lease_token=NULL,lease_until=NULL
  WHERE e.workspace_id=requested_workspace AND (requested_kind='workspace' OR e.session_id=requested_target);
 UPDATE public.response_email_delivery e SET status='cancelled',reason='disabled',lease_token=NULL,lease_until=NULL,updated_at=statement_timestamp()
  WHERE e.workspace_id=requested_workspace AND (requested_kind='workspace' OR e.session_id=requested_target) AND e.status IN('pending','sending','needs_action');
 UPDATE public.webhook_delivery d SET status='cancelled',reason='disabled',lease_token=NULL,lease_until=NULL,updated_at=statement_timestamp()
  WHERE d.workspace_id=requested_workspace AND (requested_kind='workspace' OR d.session_id=requested_target) AND d.status IN('pending','sending','needs_action','unknown');
 RETURN public.deletion_receipt(requested_id);
EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'DELETION_CONFLICT';
END $$;
--> statement-breakpoint
CREATE FUNCTION public.read_deletion(requested_workspace uuid,requested_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE member_role text;
BEGIN
 IF requested_workspace::text IS DISTINCT FROM current_setting('snapform.workspace_id',true) THEN RAISE EXCEPTION 'WORKSPACE_NOT_FOUND'; END IF;
 SELECT m.role INTO member_role FROM public.membership m WHERE m.workspace_id=requested_workspace AND m.user_id=current_setting('snapform.user_id',true);
 IF NOT FOUND THEN RAISE EXCEPTION 'WORKSPACE_NOT_FOUND'; END IF;
 IF member_role<>'owner' THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
 PERFORM 1 FROM public.deletion_request d WHERE d.id=requested_id AND d.workspace_id=requested_workspace;
 IF NOT FOUND THEN RAISE EXCEPTION 'DELETION_NOT_FOUND'; END IF;
 RETURN public.deletion_receipt(requested_id);
END $$;
--> statement-breakpoint
CREATE FUNCTION public.cancel_deletion(requested_workspace uuid,requested_id uuid,expected_revision integer)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE member_role text; item public.deletion_request; decision_time timestamptz;
BEGIN
 IF requested_workspace::text IS DISTINCT FROM current_setting('snapform.workspace_id',true) THEN RAISE EXCEPTION 'WORKSPACE_NOT_FOUND'; END IF;
 PERFORM 1 FROM public.workspace w WHERE w.id=requested_workspace FOR UPDATE;
 SELECT m.role INTO member_role FROM public.membership m WHERE m.workspace_id=requested_workspace AND m.user_id=current_setting('snapform.user_id',true);
 IF NOT FOUND THEN RAISE EXCEPTION 'WORKSPACE_NOT_FOUND'; END IF;
 IF member_role<>'owner' THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
 SELECT * INTO item FROM public.deletion_request d WHERE d.id=requested_id AND d.workspace_id=requested_workspace FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'DELETION_NOT_FOUND'; END IF;
 IF item.cancelled_at IS NOT NULL THEN RETURN public.deletion_receipt(requested_id); END IF;
 decision_time:=clock_timestamp();
 IF expected_revision IS NULL OR item.revision<>expected_revision OR item.purge_id IS NOT NULL OR decision_time>=item.not_before
 THEN RAISE EXCEPTION 'DELETION_CONFLICT'; END IF;
 UPDATE public.deletion_request SET cancelled_at=decision_time,cancelled_by=current_setting('snapform.user_id',true),revision=revision+1 WHERE id=requested_id;
 RETURN public.deletion_receipt(requested_id);
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.deletion_receipt(uuid),public.pending_workspace_deletion(uuid),public.schedule_deletion(uuid,uuid,text,uuid,text,boolean),public.read_deletion(uuid,uuid),public.cancel_deletion(uuid,uuid,integer) FROM PUBLIC,snapform_runtime,snapform_jobs;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.schedule_deletion(uuid,uuid,text,uuid,text,boolean),public.read_deletion(uuid,uuid),public.cancel_deletion(uuid,uuid,integer) TO snapform_runtime;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.pending_workspace_deletion(uuid) TO snapform_jobs;
