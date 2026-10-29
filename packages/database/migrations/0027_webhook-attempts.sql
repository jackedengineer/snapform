SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
CREATE FUNCTION public.claim_webhooks(requested_limit integer,requested_id uuid DEFAULT NULL)
RETURNS TABLE(id uuid,lease_token uuid,workspace_id uuid,form_id uuid,configuration_id uuid,version_id uuid,session_id uuid,kind text,payload text,sealed_destination text,attempts integer,created_at timestamptz,definition jsonb,answers jsonb,version_number integer,submitted_at timestamptz)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE item record; problem text; next_token uuid;
BEGIN
 IF requested_limit IS NULL OR requested_limit NOT BETWEEN 1 AND 5 THEN RETURN; END IF;
 FOR item IN
  SELECT d.*,s.configuration_id AS current_configuration,s.enabled,c.verified_at,c.sealed_destination,
   CASE WHEN d.payload IS NULL THEN v.definition ELSE NULL END AS definition,
   CASE WHEN d.payload IS NULL THEN r.answers ELSE NULL END AS answers,v.number AS version_number,r.submitted_at,r.status AS response_status
  FROM public.webhook_delivery d
  JOIN public.webhook_configuration c ON c.workspace_id=d.workspace_id AND c.form_id=d.form_id AND c.id=d.configuration_id
  JOIN public.form_version v ON v.workspace_id=d.workspace_id AND v.form_id=d.form_id AND v.id=d.version_id
  LEFT JOIN public.form_webhook_settings s ON s.workspace_id=d.workspace_id AND s.form_id=d.form_id
  LEFT JOIN public.response_session r ON r.workspace_id=d.workspace_id AND r.form_id=d.form_id AND r.version_id=d.version_id AND r.id=d.session_id
  WHERE ((d.status='pending' AND d.available_at<=now()) OR (d.status='sending' AND d.lease_until<=now()))
   AND (requested_id IS NULL OR d.id=requested_id)
  ORDER BY d.available_at,d.created_at,d.id LIMIT requested_limit FOR UPDATE OF d SKIP LOCKED
 LOOP
  problem:=CASE WHEN item.current_configuration IS DISTINCT FROM item.configuration_id THEN 'configuration-changed'
   WHEN item.kind='response.submitted' AND NOT coalesce(item.enabled,false) THEN 'disabled'
   WHEN item.status='sending' THEN 'receiver-unconfirmed'
   WHEN item.attempts>=8 THEN 'attempts-exhausted'
   WHEN item.kind='response.submitted' AND item.verified_at IS NULL THEN 'configuration'
   WHEN item.kind='response.submitted' AND item.response_status IS DISTINCT FROM 'submitted' THEN 'payload-invalid' ELSE NULL END;
  IF problem IS NOT NULL THEN
   UPDATE public.webhook_delivery d SET status=CASE WHEN problem IN('disabled','configuration-changed') THEN 'cancelled' WHEN problem='receiver-unconfirmed' THEN 'unknown' ELSE 'needs_action' END,
    reason=problem,lease_token=NULL,lease_until=NULL,updated_at=now() WHERE d.id=item.id;
  ELSE
   next_token:=gen_random_uuid();
   UPDATE public.webhook_delivery d SET status='sending',reason=NULL,attempts=d.attempts+1,
    first_attempt_at=coalesce(d.first_attempt_at,now()),lease_token=next_token,lease_until=now()+interval '2 minutes',updated_at=now() WHERE d.id=item.id;
   RETURN QUERY SELECT item.id,next_token,item.workspace_id,item.form_id,item.configuration_id,item.version_id,item.session_id,item.kind,item.payload,item.sealed_destination,item.attempts+1,item.created_at,item.definition,item.answers,item.version_number,item.submitted_at;
  END IF;
 END LOOP;
END $$;
--> statement-breakpoint
CREATE FUNCTION public.prepare_webhook_payload(requested_id uuid,requested_token uuid,requested_body text)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE item public.webhook_delivery; candidate text; document jsonb;
BEGIN
 IF requested_body IS NOT NULL AND octet_length(requested_body)>3145728 THEN RETURN false; END IF;
 SELECT * INTO item FROM public.webhook_delivery d WHERE d.id=requested_id AND d.status='sending' AND d.lease_token=requested_token AND d.lease_until>now() FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;
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
 RETURN true;
END $$;
--> statement-breakpoint
CREATE FUNCTION public.record_webhook_attempt(requested_id uuid,requested_token uuid,outcome text,http integer,problem text,retry_seconds integer)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE item public.webhook_delivery;
BEGIN
 IF ((outcome='acknowledged' AND http BETWEEN 200 AND 299 AND problem IS NULL AND retry_seconds=0)
  OR (outcome='unknown' AND (http IS NULL OR http=408) AND problem IS NOT DISTINCT FROM 'receiver-unconfirmed' AND retry_seconds=0)
  OR (outcome='retry' AND ((http=429 AND problem IS NOT DISTINCT FROM 'rate-limited') OR (http BETWEEN 500 AND 599 AND problem IS NOT DISTINCT FROM 'receiver-unavailable')) AND retry_seconds BETWEEN 60 AND 86400)
  OR (outcome='needs_action' AND coalesce(problem,'') IN('configuration','redirect-blocked','authorization','receiver-rejected','retry-later','attempts-exhausted','payload-invalid') AND (http IS NULL OR http BETWEEN 100 AND 599) AND retry_seconds=0)) IS NOT TRUE THEN RETURN false; END IF;
 UPDATE public.webhook_delivery d SET
  status=CASE WHEN outcome='retry' THEN CASE WHEN d.attempts>=8 THEN 'needs_action' ELSE 'pending' END ELSE outcome END,
  reason=CASE WHEN outcome='retry' AND d.attempts>=8 THEN 'attempts-exhausted' ELSE problem END,
  http_status=http,available_at=CASE WHEN outcome='retry' THEN now()+make_interval(secs=>retry_seconds) ELSE d.available_at END,
  acknowledged_at=CASE WHEN outcome='acknowledged' THEN now() ELSE NULL END,lease_token=NULL,lease_until=NULL,updated_at=now()
 WHERE d.id=requested_id AND d.status='sending' AND d.lease_token=requested_token AND d.lease_until>now() AND (outcome<>'acknowledged' OR d.payload IS NOT NULL)
 RETURNING d.* INTO item;
 IF NOT FOUND THEN RETURN false; END IF;
 IF outcome='acknowledged' AND item.kind='test' THEN
  UPDATE public.webhook_configuration c SET verified_at=now() WHERE c.id=item.configuration_id AND c.workspace_id=item.workspace_id AND c.form_id=item.form_id
   AND EXISTS(SELECT 1 FROM public.form_webhook_settings s WHERE s.workspace_id=item.workspace_id AND s.form_id=item.form_id AND s.configuration_id=item.configuration_id);
 END IF;
 RETURN true;
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.claim_webhooks(integer,uuid),public.prepare_webhook_payload(uuid,uuid,text),public.record_webhook_attempt(uuid,uuid,text,integer,text,integer) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.claim_webhooks(integer,uuid),public.prepare_webhook_payload(uuid,uuid,text),public.record_webhook_attempt(uuid,uuid,text,integer,text,integer) TO snapform_jobs;
