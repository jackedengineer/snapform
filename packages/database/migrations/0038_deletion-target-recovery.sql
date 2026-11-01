SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.read_deletion(requested_workspace uuid,requested_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE member_role text;
BEGIN
 IF requested_workspace::text IS DISTINCT FROM current_setting('snapform.workspace_id',true) THEN RAISE EXCEPTION 'WORKSPACE_NOT_FOUND'; END IF;
 SELECT m.role INTO member_role FROM public.membership m WHERE m.workspace_id=requested_workspace AND m.user_id=current_setting('snapform.user_id',true);
 IF NOT FOUND THEN
  -- After a whole-workspace purge, its initiating owner can still read the
  -- content-free completion receipt. This never permits cancellation or writes.
  IF EXISTS(SELECT 1 FROM public.workspace w WHERE w.id=requested_workspace)
   OR NOT EXISTS(SELECT 1 FROM public.deletion_request d JOIN public.purge_intent p ON p.id=d.purge_id
    WHERE d.id=requested_id AND d.workspace_id=requested_workspace AND d.kind='workspace'
     AND d.requested_by=current_setting('snapform.user_id',true) AND p.completed_at IS NOT NULL)
  THEN RAISE EXCEPTION 'WORKSPACE_NOT_FOUND'; END IF;
 ELSIF member_role<>'owner' THEN RAISE EXCEPTION 'FORBIDDEN';
 END IF;
 PERFORM 1 FROM public.deletion_request d WHERE d.id=requested_id AND d.workspace_id=requested_workspace;
 IF NOT FOUND THEN RAISE EXCEPTION 'DELETION_NOT_FOUND'; END IF;
 RETURN public.deletion_receipt(requested_id);
END $$;
--> statement-breakpoint
CREATE FUNCTION public.find_deletion(requested_workspace uuid,requested_kind text,requested_target uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE request_id uuid; member_role text;
BEGIN
 IF requested_workspace::text IS DISTINCT FROM current_setting('snapform.workspace_id',true) THEN RAISE EXCEPTION 'WORKSPACE_NOT_FOUND'; END IF;
 IF requested_kind IS NULL OR requested_kind NOT IN('response','workspace') OR requested_target IS NULL
  OR (requested_kind='workspace' AND requested_target IS DISTINCT FROM requested_workspace)
 THEN RAISE EXCEPTION 'INVALID_DELETION_TARGET'; END IF;
 SELECT d.id INTO request_id FROM public.deletion_request d
  WHERE d.workspace_id=requested_workspace AND d.kind=requested_kind AND d.target_id=requested_target
  ORDER BY d.requested_at DESC,d.id DESC LIMIT 1;
 IF FOUND THEN RETURN public.read_deletion(requested_workspace,request_id); END IF;
 -- Do not let an absent target bypass the same owner authorization.
 SELECT m.role INTO member_role FROM public.membership m
  WHERE m.workspace_id=requested_workspace AND m.user_id=current_setting('snapform.user_id',true);
 IF NOT FOUND THEN RAISE EXCEPTION 'WORKSPACE_NOT_FOUND'; END IF;
 IF member_role<>'owner' THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
 RAISE EXCEPTION 'DELETION_NOT_FOUND';
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.find_deletion(uuid,text,uuid) FROM PUBLIC,snapform_runtime,snapform_jobs;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.find_deletion(uuid,text,uuid) TO snapform_runtime;
