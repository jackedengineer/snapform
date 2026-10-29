SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.record_owner_email(requested_id uuid,requested_token uuid,outcome text,provider uuid,problem text,retry_seconds integer)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF COALESCE(((outcome='accepted' AND provider IS NOT NULL AND problem IS NULL)
  OR (outcome='retry' AND provider IS NULL AND problem IS NOT DISTINCT FROM 'provider-unavailable' AND retry_seconds BETWEEN 60 AND 3600)
  OR (outcome='needs_action' AND provider IS NULL AND coalesce(problem,'') IN('configuration','provider-rejected','idempotency-expired')))
  ,false) IS NOT TRUE THEN RETURN false; END IF;
 UPDATE public.response_email_delivery e SET
  status=CASE WHEN outcome='retry' THEN CASE WHEN e.attempts>=8 THEN 'needs_action' ELSE 'pending' END ELSE outcome END,
  reason=CASE WHEN outcome='retry' AND e.attempts>=8 THEN 'attempts-exhausted' WHEN outcome='needs_action' THEN problem ELSE NULL END,
  provider_id=CASE WHEN outcome='accepted' THEN provider ELSE e.provider_id END,
  accepted_at=CASE WHEN outcome='accepted' THEN now() ELSE e.accepted_at END,
  available_at=CASE WHEN outcome='retry' THEN now()+make_interval(secs=>retry_seconds) ELSE e.available_at END,
  lease_token=NULL,lease_until=NULL,updated_at=now()
 WHERE e.id=requested_id AND e.lease_token=requested_token AND e.lease_until>now() AND e.status='sending';
 RETURN FOUND;
END $$;
