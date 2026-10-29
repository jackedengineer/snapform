SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
CREATE FUNCTION public.can_retry_owner_email(requested_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT EXISTS(
  SELECT 1 FROM public.response_email_delivery e
  JOIN public.form_email_settings s ON s.workspace_id=e.workspace_id AND s.form_id=e.form_id AND s.enabled
  JOIN public.workspace w ON w.id=e.workspace_id AND w.created_by=e.recipient_user_id
  JOIN public."user" u ON u.id=e.recipient_user_id AND u.email=e.recipient_email AND u.email_verified
  WHERE e.id=requested_id AND e.workspace_id::text=current_setting('snapform.workspace_id',true)
   AND e.status='needs_action' AND e.reason IN('configuration','provider-rejected','recipient-unavailable')
   AND e.attempts<8 AND e.provider_id IS NULL AND e.accepted_at IS NULL
   AND (e.first_attempt_at IS NULL OR e.first_attempt_at>now()-interval '23 hours')
   AND EXISTS(SELECT 1 FROM public.membership m WHERE m.workspace_id=e.workspace_id AND m.user_id=current_setting('snapform.user_id',true) AND m.role IN('owner','editor'))
   AND EXISTS(SELECT 1 FROM public.membership m WHERE m.workspace_id=e.workspace_id AND m.user_id=e.recipient_user_id AND m.role='owner')
 );
$$;
--> statement-breakpoint
CREATE FUNCTION public.retry_owner_email(requested_workspace uuid,requested_form uuid,requested_id uuid,expected_attempts integer)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE item public.response_email_delivery;
BEGIN
 IF expected_attempts IS NULL OR expected_attempts NOT BETWEEN 0 AND 7 THEN RETURN false; END IF;
 PERFORM 1 FROM public.form_email_settings s WHERE s.workspace_id=requested_workspace AND s.form_id=requested_form AND s.enabled FOR SHARE;
 IF NOT FOUND THEN RETURN false; END IF;
 SELECT * INTO item FROM public.response_email_delivery e WHERE e.id=requested_id AND e.workspace_id=requested_workspace AND e.form_id=requested_form FOR UPDATE;
 IF NOT FOUND OR item.status<>'needs_action' OR item.attempts<>expected_attempts OR NOT public.can_retry_owner_email(requested_id) THEN RETURN false; END IF;
 UPDATE public.response_email_delivery SET status='pending',reason=NULL,available_at=now(),updated_at=now() WHERE id=requested_id;
 RETURN true;
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.can_retry_owner_email(uuid),public.retry_owner_email(uuid,uuid,uuid,integer) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.can_retry_owner_email(uuid),public.retry_owner_email(uuid,uuid,uuid,integer) TO snapform_runtime;
