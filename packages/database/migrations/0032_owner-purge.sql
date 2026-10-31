SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
CREATE FUNCTION public.claim_owner_deletions(requested_limit integer,requested_workspace uuid DEFAULT NULL)
RETURNS SETOF public.purge_intent LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE candidate record; item public.deletion_request; intent_id uuid; slots integer;
BEGIN
 IF requested_limit IS NULL OR requested_limit NOT BETWEEN 1 AND 20 THEN RETURN; END IF;
 SELECT requested_limit-count(*)::integer INTO slots FROM (
  SELECT 1 FROM public.purge_intent p WHERE p.reason='owner' AND p.completed_at IS NULL
   AND (requested_workspace IS NULL OR p.workspace_id=requested_workspace) LIMIT requested_limit
 ) pending;
 IF slots>0 THEN
  FOR candidate IN
   SELECT d.id,d.workspace_id FROM public.deletion_request d JOIN public.workspace w ON w.id=d.workspace_id
   WHERE d.cancelled_at IS NULL AND d.purge_id IS NULL AND d.not_before<=clock_timestamp()
    AND (requested_workspace IS NULL OR d.workspace_id=requested_workspace)
   ORDER BY CASE WHEN d.kind='workspace' THEN 0 ELSE 1 END,d.not_before,d.id
   LIMIT slots FOR UPDATE OF w SKIP LOCKED
  LOOP
   SELECT * INTO item FROM public.deletion_request d WHERE d.id=candidate.id FOR UPDATE;
   IF item.cancelled_at IS NOT NULL OR item.purge_id IS NOT NULL THEN CONTINUE; END IF;
   INSERT INTO public.purge_intent(workspace_id,kind,target_id,reason)
    VALUES(item.workspace_id,item.kind,item.target_id,'owner') RETURNING id INTO intent_id;
   UPDATE public.deletion_request SET purge_id=intent_id,revision=revision+1 WHERE id=item.id;
   IF item.kind='workspace' THEN
    UPDATE public.deletion_request SET purge_id=intent_id,revision=revision+1
     WHERE workspace_id=item.workspace_id AND cancelled_at IS NULL AND purge_id IS NULL;
   END IF;
  END LOOP;
 END IF;
 RETURN QUERY SELECT p.* FROM public.purge_intent p WHERE p.reason='owner' AND p.completed_at IS NULL
  AND (requested_workspace IS NULL OR p.workspace_id=requested_workspace)
  ORDER BY p.created_at,p.id LIMIT requested_limit;
END $$;
--> statement-breakpoint
CREATE FUNCTION public.finalize_workspace_purge(requested_id uuid)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE item public.purge_intent;
BEGIN
 SELECT p.* INTO item FROM public.purge_intent p WHERE p.id=requested_id AND p.kind='workspace';
 IF NOT FOUND THEN RETURN false; END IF;
 PERFORM 1 FROM public.workspace w WHERE w.id=item.workspace_id FOR UPDATE;
 SELECT p.* INTO item FROM public.purge_intent p WHERE p.id=requested_id FOR UPDATE;
 IF item.completed_at IS NOT NULL THEN RETURN true; END IF;
 DELETE FROM public.response_session r WHERE r.workspace_id=item.workspace_id;
 DELETE FROM public.form_publication f WHERE f.workspace_id=item.workspace_id;
 DELETE FROM public.workspace w WHERE w.id=item.workspace_id;
 -- The acknowledged whole-workspace tombstone covers earlier response intents.
 UPDATE public.purge_intent SET completed_at=clock_timestamp()
  WHERE workspace_id=item.workspace_id AND completed_at IS NULL;
 RETURN true;
END $$;
--> statement-breakpoint
CREATE FUNCTION public.guard_purged_workspace()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.purge_intent p WHERE p.kind='workspace' AND p.target_id=NEW.id) THEN
  RAISE EXCEPTION 'PURGE_INTENT_EXISTS' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER workspace_purge_guard BEFORE INSERT OR UPDATE ON public.workspace
FOR EACH ROW EXECUTE FUNCTION public.guard_purged_workspace();
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.claim_owner_deletions(integer,uuid),public.finalize_workspace_purge(uuid),public.guard_purged_workspace() FROM PUBLIC,snapform_runtime,snapform_jobs;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.claim_owner_deletions(integer,uuid),public.finalize_workspace_purge(uuid) TO snapform_jobs;

--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.claim_expired_responses(requested_limit integer,requested_workspace uuid DEFAULT NULL)
RETURNS SETOF public.purge_intent LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE candidate record; item record; slots integer;
BEGIN
 IF requested_limit IS NULL OR requested_limit NOT BETWEEN 1 AND 20 THEN RETURN; END IF;
 SELECT requested_limit-count(*)::integer INTO slots FROM (
  SELECT 1 FROM public.purge_intent p WHERE p.reason='expired' AND p.completed_at IS NULL
   AND (requested_workspace IS NULL OR p.workspace_id=requested_workspace) LIMIT requested_limit
 ) pending;
 IF slots>0 THEN
  FOR candidate IN
   SELECT w.id FROM public.workspace w
   WHERE (requested_workspace IS NULL OR w.id=requested_workspace)
    AND NOT public.pending_workspace_deletion(w.id)
    AND EXISTS(SELECT 1 FROM public.response_session r
     LEFT JOIN public.workspace_retention policy ON policy.workspace_id=r.workspace_id
     WHERE r.workspace_id=w.id
      AND ((r.status='collecting' AND r.expires_at<=clock_timestamp()) OR
       (r.status='submitted' AND r.submitted_at<=clock_timestamp()-coalesce(policy.days,90)*interval '24 hours'))
      AND NOT EXISTS(SELECT 1 FROM public.purge_intent p WHERE p.kind='response' AND p.target_id=r.id)
      AND NOT EXISTS(SELECT 1 FROM public.deletion_request d WHERE d.kind='response' AND d.target_id=r.id AND d.cancelled_at IS NULL))
   ORDER BY w.created_at,w.id LIMIT slots FOR UPDATE OF w SKIP LOCKED
  LOOP
   -- Recheck after the workspace lock; scheduling may have committed since selection.
   IF public.pending_workspace_deletion(candidate.id) THEN CONTINUE; END IF;
   FOR item IN
    SELECT r.id,r.workspace_id FROM public.response_session r
    LEFT JOIN public.workspace_retention policy ON policy.workspace_id=r.workspace_id
    WHERE r.workspace_id=candidate.id
     AND ((r.status='collecting' AND r.expires_at<=clock_timestamp()) OR
      (r.status='submitted' AND r.submitted_at<=clock_timestamp()-coalesce(policy.days,90)*interval '24 hours'))
     AND NOT EXISTS(SELECT 1 FROM public.purge_intent p WHERE p.kind='response' AND p.target_id=r.id)
     AND NOT EXISTS(SELECT 1 FROM public.deletion_request d WHERE d.kind='response' AND d.target_id=r.id AND d.cancelled_at IS NULL)
    ORDER BY r.expires_at,r.id LIMIT slots FOR UPDATE OF r SKIP LOCKED
   LOOP
    INSERT INTO public.purge_intent(workspace_id,kind,target_id,reason)
     VALUES(item.workspace_id,'response',item.id,'expired');
    UPDATE public.response_outbox e SET completed_at=coalesce(e.completed_at,clock_timestamp()),lease_token=NULL,lease_until=NULL WHERE e.session_id=item.id;
    UPDATE public.response_email_delivery e SET status='cancelled',reason='disabled',lease_token=NULL,lease_until=NULL,updated_at=clock_timestamp()
     WHERE e.session_id=item.id AND e.status IN('pending','sending','needs_action');
    UPDATE public.webhook_delivery d SET status='cancelled',reason='disabled',lease_token=NULL,lease_until=NULL,updated_at=clock_timestamp()
     WHERE d.session_id=item.id AND d.status IN('pending','sending','needs_action','unknown');
    slots:=slots-1;
   END LOOP;
   EXIT WHEN slots=0;
  END LOOP;
 END IF;
 RETURN QUERY SELECT p.* FROM public.purge_intent p WHERE p.reason='expired' AND p.completed_at IS NULL
  AND (requested_workspace IS NULL OR p.workspace_id=requested_workspace)
  ORDER BY p.created_at,p.id LIMIT requested_limit;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.finalize_response_purge(requested_id uuid)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE item public.purge_intent;
BEGIN
 SELECT p.* INTO item FROM public.purge_intent p WHERE p.id=requested_id AND p.kind='response';
 IF NOT FOUND THEN RETURN false; END IF;
 PERFORM 1 FROM public.workspace w WHERE w.id=item.workspace_id FOR UPDATE;
 SELECT p.* INTO item FROM public.purge_intent p WHERE p.id=requested_id FOR UPDATE;
 IF item.completed_at IS NOT NULL THEN RETURN true; END IF;
 DELETE FROM public.response_session r WHERE r.id=item.target_id AND r.workspace_id=item.workspace_id;
 UPDATE public.purge_intent SET completed_at=clock_timestamp() WHERE id=item.id;
 RETURN true;
END $$;
