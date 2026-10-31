SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
CREATE TABLE "purge_intent" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"target_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "purge_intent_target" UNIQUE("kind","target_id"),
	CONSTRAINT "purge_intent_kind" CHECK ("purge_intent"."kind" in ('response','workspace')),
	CONSTRAINT "purge_intent_reason" CHECK ("purge_intent"."reason" in ('expired','owner')),
	CONSTRAINT "purge_intent_workspace_target" CHECK ("purge_intent"."kind"='response' or ("purge_intent"."target_id"="purge_intent"."workspace_id" and "purge_intent"."reason"='owner')),
	CONSTRAINT "purge_intent_completion" CHECK ("purge_intent"."completed_at" is null or "purge_intent"."completed_at">="purge_intent"."created_at")
);
--> statement-breakpoint
ALTER TABLE "purge_intent" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "purge_intent_pending_idx" ON "purge_intent" USING btree ("created_at","id") WHERE "purge_intent"."completed_at" is null;
--> statement-breakpoint
ALTER TABLE public.purge_intent FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON TABLE public.purge_intent FROM PUBLIC,snapform_runtime,snapform_jobs;
--> statement-breakpoint
CREATE FUNCTION public.claim_expired_responses(requested_limit integer,requested_workspace uuid DEFAULT NULL)
RETURNS SETOF public.purge_intent LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE item record; slots integer;
BEGIN
 IF requested_limit IS NULL OR requested_limit NOT BETWEEN 1 AND 20 THEN RETURN; END IF;
 SELECT requested_limit-count(*)::integer INTO slots FROM (
  SELECT 1 FROM public.purge_intent p WHERE p.kind='response' AND p.completed_at IS NULL
   AND (requested_workspace IS NULL OR p.workspace_id=requested_workspace) LIMIT requested_limit
 ) pending;
 IF slots>0 THEN
  FOR item IN
   SELECT r.id,r.workspace_id FROM public.response_session r
   LEFT JOIN public.workspace_retention policy ON policy.workspace_id=r.workspace_id
   WHERE (requested_workspace IS NULL OR r.workspace_id=requested_workspace)
    AND ((r.status='collecting' AND r.expires_at<=now()) OR
     (r.status='submitted' AND r.submitted_at<=now()-coalesce(policy.days,90)*interval '24 hours'))
    AND NOT EXISTS(SELECT 1 FROM public.purge_intent p WHERE p.kind='response' AND p.target_id=r.id)
   ORDER BY r.expires_at,r.id LIMIT slots FOR UPDATE OF r SKIP LOCKED
  LOOP
   INSERT INTO public.purge_intent(workspace_id,kind,target_id,reason)
    VALUES(item.workspace_id,'response',item.id,'expired') ON CONFLICT(kind,target_id) DO NOTHING;
   UPDATE public.response_outbox e SET completed_at=coalesce(e.completed_at,now()),lease_token=NULL,lease_until=NULL
    WHERE e.session_id=item.id;
   UPDATE public.response_email_delivery e SET status='cancelled',reason='disabled',lease_token=NULL,lease_until=NULL,updated_at=now()
    WHERE e.session_id=item.id AND e.status IN('pending','sending','needs_action');
   UPDATE public.webhook_delivery d SET status='cancelled',reason='disabled',lease_token=NULL,lease_until=NULL,updated_at=now()
    WHERE d.session_id=item.id AND d.status IN('pending','sending','needs_action','unknown');
  END LOOP;
 END IF;
 RETURN QUERY SELECT p.* FROM public.purge_intent p WHERE p.kind='response' AND p.completed_at IS NULL
  AND (requested_workspace IS NULL OR p.workspace_id=requested_workspace)
  ORDER BY p.created_at,p.id LIMIT requested_limit;
END $$;
--> statement-breakpoint
CREATE FUNCTION public.finalize_response_purge(requested_id uuid)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE item public.purge_intent;
BEGIN
 SELECT p.* INTO item FROM public.purge_intent p WHERE p.id=requested_id AND p.kind='response' FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;
 IF item.completed_at IS NOT NULL THEN RETURN true; END IF;
 DELETE FROM public.response_session r WHERE r.id=item.target_id AND r.workspace_id=item.workspace_id;
 UPDATE public.purge_intent SET completed_at=now() WHERE id=item.id;
 RETURN true;
END $$;
--> statement-breakpoint
CREATE FUNCTION public.guard_purged_response()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.purge_intent p WHERE p.kind='response' AND p.target_id=NEW.id) THEN
  RAISE EXCEPTION 'PURGE_INTENT_EXISTS' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER response_purge_guard BEFORE INSERT OR UPDATE ON public.response_session
FOR EACH ROW EXECUTE FUNCTION public.guard_purged_response();
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.claim_expired_responses(integer,uuid),public.finalize_response_purge(uuid),public.guard_purged_response() FROM PUBLIC,snapform_runtime,snapform_jobs;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.claim_expired_responses(integer,uuid),public.finalize_response_purge(uuid) TO snapform_jobs;
