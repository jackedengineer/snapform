SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.prepare_webhook_payload(requested_id uuid,requested_token uuid,requested_body text)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE target_workspace uuid; item public.webhook_delivery; candidate text; document jsonb;
BEGIN
 IF requested_body IS NOT NULL AND octet_length(requested_body)>3145728 THEN RETURN false; END IF;
 SELECT d.workspace_id INTO target_workspace FROM public.webhook_delivery d WHERE d.id=requested_id;
 IF NOT FOUND THEN RETURN false; END IF;
 PERFORM 1 FROM public.workspace w WHERE w.id=target_workspace FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;
 SELECT * INTO item FROM public.webhook_delivery d WHERE d.id=requested_id AND d.status='sending' AND d.lease_token=requested_token AND d.lease_until>clock_timestamp() AND d.workspace_id=target_workspace FOR UPDATE;
 IF NOT FOUND OR item.status<>'sending' OR item.lease_token IS DISTINCT FROM requested_token
  OR item.lease_until<=clock_timestamp() THEN RETURN false; END IF;
 IF public.pending_target_deletion(item.workspace_id,item.session_id) THEN
  UPDATE public.webhook_delivery SET status='cancelled',reason='disabled',lease_token=NULL,lease_until=NULL,updated_at=clock_timestamp() WHERE id=item.id;
  RETURN false;
 END IF;
 IF item.payload IS NOT NULL AND requested_body IS NOT NULL AND convert_to(item.payload,'UTF8')<>convert_to(requested_body,'UTF8') THEN RETURN false; END IF;
 candidate:=coalesce(item.payload,requested_body);
 IF candidate IS NULL OR octet_length(candidate) NOT BETWEEN 2 AND 3145728 THEN RETURN false; END IF;
 BEGIN document:=candidate::jsonb; EXCEPTION WHEN data_exception THEN RETURN false; END;
 IF jsonb_typeof(document) IS DISTINCT FROM 'object' OR jsonb_typeof(document->'data') IS DISTINCT FROM 'object' OR jsonb_typeof(document#>'{data,answers}') IS DISTINCT FROM 'array' THEN RETURN false; END IF;
 IF (document->'specVersion'='1'::jsonb AND document->>'id'=item.id::text
  AND document->>'createdAt'=to_char(item.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  AND document->>'type'=CASE WHEN item.kind='test' THEN 'webhook.test' ELSE 'response.submitted' END
  AND jsonb_typeof(document->'test')='boolean' AND document->>'test'=CASE WHEN item.kind='test' THEN 'true' ELSE 'false' END
  AND document#>>'{data,formId}'=item.form_id::text AND document#>>'{data,formVersionId}'=item.version_id::text
  AND (item.kind='test' OR document#>>'{data,responseId}'=item.session_id::text)
  AND jsonb_array_length(document#>'{data,answers}')<=50
  AND document#>'{data,formVersion}'=to_jsonb((SELECT v.number FROM public.form_version v WHERE v.workspace_id=item.workspace_id AND v.form_id=item.form_id AND v.id=item.version_id))) IS NOT TRUE THEN RETURN false; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.form_webhook_settings s JOIN public.webhook_configuration c ON c.id=s.configuration_id AND c.workspace_id=s.workspace_id AND c.form_id=s.form_id
  WHERE s.workspace_id=item.workspace_id AND s.form_id=item.form_id AND s.configuration_id=item.configuration_id AND (item.kind='test' OR (s.enabled AND c.verified_at IS NOT NULL))) THEN RETURN false; END IF;
 IF item.payload IS NULL THEN UPDATE public.webhook_delivery SET payload=candidate,updated_at=now() WHERE id=requested_id; END IF;
 RETURN item.lease_until>clock_timestamp();
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.record_webhook_attempt(requested_id uuid,requested_token uuid,outcome text,http integer,problem text,retry_seconds integer)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE target_workspace uuid; item public.webhook_delivery;
BEGIN
 IF ((outcome='acknowledged' AND http BETWEEN 200 AND 299 AND problem IS NULL AND retry_seconds=0)
  OR (outcome='unknown' AND (http IS NULL OR http=408) AND problem IS NOT DISTINCT FROM 'receiver-unconfirmed' AND retry_seconds=0)
  OR (outcome='retry' AND ((http=429 AND problem IS NOT DISTINCT FROM 'rate-limited') OR (http BETWEEN 500 AND 599 AND problem IS NOT DISTINCT FROM 'receiver-unavailable')) AND retry_seconds BETWEEN 60 AND 86400)
  OR (outcome='needs_action' AND coalesce(problem,'') IN('configuration','redirect-blocked','authorization','receiver-rejected','retry-later','attempts-exhausted','payload-invalid') AND (http IS NULL OR http BETWEEN 100 AND 599) AND retry_seconds=0)) IS NOT TRUE THEN RETURN false; END IF;
 SELECT d.workspace_id INTO target_workspace FROM public.webhook_delivery d WHERE d.id=requested_id;
 IF NOT FOUND THEN RETURN false; END IF;
 PERFORM 1 FROM public.workspace w WHERE w.id=target_workspace FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;
 SELECT * INTO item FROM public.webhook_delivery d WHERE d.id=requested_id AND d.workspace_id=target_workspace FOR UPDATE;
 IF NOT FOUND OR item.status<>'sending' OR item.lease_token IS DISTINCT FROM requested_token
  OR item.lease_until<=clock_timestamp() OR public.pending_target_deletion(item.workspace_id,item.session_id) THEN RETURN false; END IF;
 UPDATE public.webhook_delivery d SET
  status=CASE WHEN outcome='retry' THEN CASE WHEN d.attempts>=8 THEN 'needs_action' ELSE 'pending' END ELSE outcome END,
  reason=CASE WHEN outcome='retry' AND d.attempts>=8 THEN 'attempts-exhausted' ELSE problem END,
  http_status=http,available_at=CASE WHEN outcome='retry' THEN now()+make_interval(secs=>retry_seconds) ELSE d.available_at END,
  acknowledged_at=CASE WHEN outcome='acknowledged' THEN now() ELSE NULL END,lease_token=NULL,lease_until=NULL,updated_at=now()
 WHERE d.id=requested_id AND d.status='sending' AND d.lease_token=requested_token AND d.lease_until>clock_timestamp() AND (outcome<>'acknowledged' OR d.payload IS NOT NULL)
 RETURNING d.* INTO item;
 IF NOT FOUND THEN RETURN false; END IF;
 IF outcome='acknowledged' AND item.kind='test' THEN
  UPDATE public.webhook_configuration c SET verified_at=now() WHERE c.id=item.configuration_id AND c.workspace_id=item.workspace_id AND c.form_id=item.form_id
   AND EXISTS(SELECT 1 FROM public.form_webhook_settings s WHERE s.workspace_id=item.workspace_id AND s.form_id=item.form_id AND s.configuration_id=item.configuration_id);
 END IF;
 RETURN true;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.queue_webhook(requested_workspace uuid,requested_form uuid,requested_id uuid,requested_configuration uuid,expected_revision integer,expected_attempts integer,allow_unknown boolean)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE item public.webhook_delivery; settings record;
BEGIN
 IF expected_revision IS NULL OR expected_revision<1 OR expected_attempts IS NULL OR expected_attempts NOT BETWEEN 0 AND 7 OR allow_unknown IS NULL
  OR requested_workspace::text IS DISTINCT FROM current_setting('snapform.workspace_id',true)
  OR NOT EXISTS(SELECT 1 FROM public.membership m WHERE m.workspace_id=requested_workspace AND m.user_id=current_setting('snapform.user_id',true) AND m.role IN('owner','editor')) THEN RETURN false; END IF;
 PERFORM 1 FROM public.workspace w WHERE w.id=requested_workspace FOR UPDATE;
 IF NOT FOUND OR public.pending_target_deletion(requested_workspace,NULL)
  OR NOT EXISTS(SELECT 1 FROM public.membership m WHERE m.workspace_id=requested_workspace AND m.user_id=current_setting('snapform.user_id',true) AND m.role IN('owner','editor')) THEN RETURN false; END IF;
 SELECT s.enabled,c.verified_at INTO settings FROM public.form_webhook_settings s
 JOIN public.webhook_configuration c ON c.id=s.configuration_id AND c.workspace_id=s.workspace_id AND c.form_id=s.form_id
 WHERE s.workspace_id=requested_workspace AND s.form_id=requested_form AND s.configuration_id=requested_configuration AND s.revision=expected_revision FOR SHARE OF s;
 IF NOT FOUND THEN RETURN false; END IF;
 SELECT * INTO item FROM public.webhook_delivery d WHERE d.id=requested_id AND d.workspace_id=requested_workspace AND d.form_id=requested_form AND d.configuration_id=requested_configuration FOR UPDATE;
 IF NOT FOUND OR public.pending_target_deletion(item.workspace_id,item.session_id) OR item.attempts<>expected_attempts THEN RETURN false; END IF;
 IF item.kind='response.submitted' THEN
  IF NOT settings.enabled OR settings.verified_at IS NULL THEN RETURN false; END IF;
 ELSE
  IF NOT EXISTS(SELECT 1 FROM public.form_publication p WHERE p.workspace_id=requested_workspace AND p.form_id=requested_form AND p.active AND p.version_id=item.version_id) THEN RETURN false; END IF;
 END IF;
 IF item.status='preview' THEN
  IF item.kind<>'test' OR item.attempts<>0 OR item.created_at<now()-interval '15 minutes' THEN RETURN false; END IF;
 ELSIF item.status='unknown' THEN
  IF NOT allow_unknown THEN RETURN false; END IF;
 ELSIF item.status='needs_action' THEN
  IF item.reason NOT IN('configuration','redirect-blocked','authorization','receiver-rejected','retry-later') THEN RETURN false; END IF;
 ELSE RETURN false;
 END IF;
 UPDATE public.webhook_delivery SET status='pending',reason=NULL,available_at=now(),updated_at=now() WHERE id=requested_id;
 RETURN true;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.can_retry_owner_email(requested_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT EXISTS(
  SELECT 1 FROM public.response_email_delivery e
  JOIN public.form_email_settings s ON s.workspace_id=e.workspace_id AND s.form_id=e.form_id AND s.enabled
  JOIN public.workspace w ON w.id=e.workspace_id AND w.created_by=e.recipient_user_id
  JOIN public."user" u ON u.id=e.recipient_user_id AND u.email=e.recipient_email AND u.email_verified
  WHERE e.id=requested_id AND e.workspace_id::text=current_setting('snapform.workspace_id',true)
   AND NOT public.pending_target_deletion(e.workspace_id,e.session_id)
   AND e.status='needs_action' AND e.reason IN('configuration','provider-rejected','recipient-unavailable')
   AND e.attempts<8 AND e.provider_id IS NULL AND e.accepted_at IS NULL
   AND (e.first_attempt_at IS NULL OR e.first_attempt_at>now()-interval '23 hours')
   AND EXISTS(SELECT 1 FROM public.membership m WHERE m.workspace_id=e.workspace_id AND m.user_id=current_setting('snapform.user_id',true) AND m.role IN('owner','editor'))
   AND EXISTS(SELECT 1 FROM public.membership m WHERE m.workspace_id=e.workspace_id AND m.user_id=e.recipient_user_id AND m.role='owner')
 );
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.retry_owner_email(requested_workspace uuid,requested_form uuid,requested_id uuid,expected_attempts integer)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE item public.response_email_delivery;
BEGIN
 IF expected_attempts IS NULL OR expected_attempts NOT BETWEEN 0 AND 7 THEN RETURN false; END IF;
 IF requested_workspace::text IS DISTINCT FROM current_setting('snapform.workspace_id',true)
  OR NOT EXISTS(SELECT 1 FROM public.membership m WHERE m.workspace_id=requested_workspace AND m.user_id=current_setting('snapform.user_id',true) AND m.role IN('owner','editor')) THEN RETURN false; END IF;
 PERFORM 1 FROM public.workspace w WHERE w.id=requested_workspace FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;
 PERFORM 1 FROM public.form_email_settings s WHERE s.workspace_id=requested_workspace AND s.form_id=requested_form AND s.enabled FOR SHARE;
 IF NOT FOUND THEN RETURN false; END IF;
 SELECT * INTO item FROM public.response_email_delivery e WHERE e.id=requested_id AND e.workspace_id=requested_workspace AND e.form_id=requested_form FOR UPDATE;
 IF NOT FOUND OR item.status<>'needs_action' OR item.attempts<>expected_attempts OR NOT public.can_retry_owner_email(requested_id) THEN RETURN false; END IF;
 UPDATE public.response_email_delivery SET status='pending',reason=NULL,available_at=now(),updated_at=now() WHERE id=requested_id;
 RETURN true;
END $$;
