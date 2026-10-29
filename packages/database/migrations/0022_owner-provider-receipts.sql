SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
CREATE FUNCTION public.record_owner_provider_status(requested_id uuid,provider uuid,recipient text,incoming text)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF incoming IS NULL OR incoming NOT IN('accepted','delivered','bounced','complained','failed','suppressed')
  OR provider IS NULL OR recipient IS NULL THEN RETURN false; END IF;
 UPDATE public.response_email_delivery e SET status=incoming,reason=NULL,provider_id=provider,
  accepted_at=coalesce(e.accepted_at,now()),lease_token=NULL,lease_until=NULL,updated_at=now()
 WHERE e.id=requested_id AND e.recipient_email=recipient AND e.first_attempt_at IS NOT NULL
  AND (e.provider_id IS NULL OR e.provider_id=provider)
  AND CASE incoming WHEN 'complained' THEN 6 WHEN 'bounced' THEN 5 WHEN 'failed' THEN 5 WHEN 'suppressed' THEN 5 WHEN 'delivered' THEN 4 WHEN 'accepted' THEN 3 ELSE 0 END
   > CASE e.status WHEN 'complained' THEN 6 WHEN 'bounced' THEN 5 WHEN 'failed' THEN 5 WHEN 'suppressed' THEN 5 WHEN 'delivered' THEN 4 WHEN 'accepted' THEN 3 ELSE 0 END;
 RETURN FOUND;
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.record_owner_provider_status(uuid,uuid,text,text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.record_owner_provider_status(uuid,uuid,text,text) TO snapform_jobs;
