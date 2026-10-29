SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
CREATE FUNCTION public.queue_webhook(requested_workspace uuid,requested_form uuid,requested_id uuid,requested_configuration uuid,expected_revision integer,expected_attempts integer,allow_unknown boolean)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE item public.webhook_delivery; settings record;
BEGIN
 IF expected_revision IS NULL OR expected_revision<1 OR expected_attempts IS NULL OR expected_attempts NOT BETWEEN 0 AND 7 OR allow_unknown IS NULL
  OR requested_workspace::text IS DISTINCT FROM current_setting('snapform.workspace_id',true)
  OR NOT EXISTS(SELECT 1 FROM public.membership m WHERE m.workspace_id=requested_workspace AND m.user_id=current_setting('snapform.user_id',true) AND m.role IN('owner','editor')) THEN RETURN false; END IF;
 SELECT s.enabled,c.verified_at INTO settings FROM public.form_webhook_settings s
 JOIN public.webhook_configuration c ON c.id=s.configuration_id AND c.workspace_id=s.workspace_id AND c.form_id=s.form_id
 WHERE s.workspace_id=requested_workspace AND s.form_id=requested_form AND s.configuration_id=requested_configuration AND s.revision=expected_revision FOR SHARE OF s;
 IF NOT FOUND THEN RETURN false; END IF;
 SELECT * INTO item FROM public.webhook_delivery d WHERE d.id=requested_id AND d.workspace_id=requested_workspace AND d.form_id=requested_form AND d.configuration_id=requested_configuration FOR UPDATE;
 IF NOT FOUND OR item.attempts<>expected_attempts THEN RETURN false; END IF;
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
REVOKE ALL ON FUNCTION public.queue_webhook(uuid,uuid,uuid,uuid,integer,integer,boolean) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.queue_webhook(uuid,uuid,uuid,uuid,integer,integer,boolean) TO snapform_runtime;
