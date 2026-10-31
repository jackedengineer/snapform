SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
CREATE FUNCTION public.scope_workspace(requested_actor text,requested_workspace uuid,requested_write boolean)
RETURNS TABLE(role text,deletion_pending boolean) LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actual_role text;
BEGIN
 IF requested_write IS NULL THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
 SELECT m.role INTO actual_role FROM public.membership m
  WHERE m.workspace_id=requested_workspace AND m.user_id=requested_actor;
 IF NOT FOUND THEN RAISE EXCEPTION 'WORKSPACE_NOT_FOUND'; END IF;
 IF requested_write THEN
  IF actual_role='viewer' THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  -- Authorize before taking a tenant lock, then refresh membership after waiting.
  PERFORM 1 FROM public.workspace w WHERE w.id=requested_workspace FOR UPDATE;
  SELECT m.role INTO actual_role FROM public.membership m
   WHERE m.workspace_id=requested_workspace AND m.user_id=requested_actor;
  IF NOT FOUND THEN RAISE EXCEPTION 'WORKSPACE_NOT_FOUND'; END IF;

 END IF;
 PERFORM set_config('snapform.user_id',requested_actor,true),
  set_config('snapform.workspace_id',requested_workspace::text,true),set_config('snapform.role',actual_role,true),
  set_config('snapform.public_id','',true),set_config('snapform.intake_id','',true),set_config('snapform.intake_hash','',true);
 RETURN QUERY SELECT actual_role,requested_write AND public.pending_workspace_deletion(requested_workspace);
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.scope_workspace(text,uuid,boolean) FROM PUBLIC,snapform_runtime,snapform_jobs;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.scope_workspace(text,uuid,boolean) TO snapform_runtime;
