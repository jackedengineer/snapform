SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.pending_target_deletion(requested_workspace uuid,requested_response uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT EXISTS(SELECT 1 FROM public.deletion_request d
  WHERE d.workspace_id=requested_workspace AND d.cancelled_at IS NULL
   AND (d.kind='workspace' OR (d.kind='response' AND d.target_id=requested_response)))
 OR EXISTS(SELECT 1 FROM public.purge_intent p WHERE p.workspace_id=requested_workspace
  AND (p.kind='workspace' OR (p.kind='response' AND p.target_id=requested_response)))
$$;
--> statement-breakpoint
CREATE FUNCTION public.prepare_owner_email(requested_id uuid,requested_token uuid)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE target_workspace uuid; item public.response_email_delivery; problem text;
BEGIN
 SELECT e.workspace_id INTO target_workspace FROM public.response_email_delivery e WHERE e.id=requested_id;
 IF NOT FOUND THEN RETURN false; END IF;
 -- Match deletion/settings lock order; never hold this lock across provider HTTP.
 PERFORM 1 FROM public.workspace w WHERE w.id=target_workspace FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;
 SELECT * INTO item FROM public.response_email_delivery e WHERE e.id=requested_id AND e.workspace_id=target_workspace
  AND e.status='sending' AND e.lease_token=requested_token AND e.lease_until>clock_timestamp() FOR UPDATE;
 IF NOT FOUND OR item.status<>'sending' OR item.lease_token IS DISTINCT FROM requested_token
  OR item.lease_until<=clock_timestamp() THEN RETURN false; END IF;
 problem:=CASE
  WHEN public.pending_target_deletion(item.workspace_id,item.session_id)
   OR NOT EXISTS(SELECT 1 FROM public.form_email_settings s WHERE s.workspace_id=item.workspace_id AND s.form_id=item.form_id AND s.enabled)
   OR NOT EXISTS(SELECT 1 FROM public.response_session r WHERE r.id=item.session_id AND r.workspace_id=item.workspace_id AND r.form_id=item.form_id AND r.status='submitted') THEN 'disabled'
  WHEN NOT EXISTS(SELECT 1 FROM public.workspace w JOIN public."user" u ON u.id=w.created_by
   JOIN public.membership m ON m.workspace_id=w.id AND m.user_id=u.id AND m.role='owner'
   WHERE w.id=item.workspace_id AND u.id=item.recipient_user_id AND u.email=item.recipient_email AND u.email_verified) THEN 'recipient-unavailable'
  WHEN item.first_attempt_at<=clock_timestamp()-interval '23 hours' THEN 'idempotency-expired'
  ELSE NULL END;
 IF problem IS NOT NULL THEN
  UPDATE public.response_email_delivery SET status=CASE WHEN problem='disabled' THEN 'cancelled' ELSE 'needs_action' END,
   reason=problem,lease_token=NULL,lease_until=NULL,updated_at=clock_timestamp() WHERE id=item.id;
  RETURN false;
 END IF;
 RETURN item.lease_until>clock_timestamp();
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.prepare_owner_email(uuid,uuid) FROM PUBLIC,snapform_runtime,snapform_jobs;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.prepare_owner_email(uuid,uuid) TO snapform_jobs;
