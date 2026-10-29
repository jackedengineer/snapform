SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
ALTER TABLE "response_email_delivery" DROP CONSTRAINT "response_email_state";--> statement-breakpoint
ALTER TABLE "response_email_delivery" ADD COLUMN "attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "response_email_delivery" ADD COLUMN "first_attempt_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "response_email_delivery" ADD COLUMN "available_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "response_email_delivery" ADD COLUMN "lease_token" uuid;--> statement-breakpoint
ALTER TABLE "response_email_delivery" ADD COLUMN "lease_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "response_email_delivery" ADD COLUMN "provider_id" uuid;--> statement-breakpoint
ALTER TABLE "response_email_delivery" ADD COLUMN "accepted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "response_email_delivery" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "response_email_delivery" ADD CONSTRAINT "response_email_provider" UNIQUE("provider_id");--> statement-breakpoint
ALTER TABLE "response_email_delivery" ADD CONSTRAINT "response_email_attempts" CHECK ("response_email_delivery"."attempts" between 0 and 8);--> statement-breakpoint
ALTER TABLE "response_email_delivery" ADD CONSTRAINT "response_email_lease" CHECK (("response_email_delivery"."status"='sending' and "response_email_delivery"."lease_token" is not null and "response_email_delivery"."lease_until" is not null and "response_email_delivery"."first_attempt_at" is not null) or ("response_email_delivery"."status"<>'sending' and "response_email_delivery"."lease_token" is null and "response_email_delivery"."lease_until" is null));--> statement-breakpoint
ALTER TABLE "response_email_delivery" ADD CONSTRAINT "response_email_state" CHECK (("response_email_delivery"."status" in ('pending','sending','accepted','delivered','bounced','complained','failed','suppressed') and "response_email_delivery"."reason" is null) or ("response_email_delivery"."status"='cancelled' and "response_email_delivery"."reason" is not distinct from 'disabled') or ("response_email_delivery"."status"='needs_action' and coalesce("response_email_delivery"."reason",'') in ('recipient-unavailable','configuration','provider-rejected','idempotency-expired','attempts-exhausted')));
--> statement-breakpoint
CREATE FUNCTION public.claim_owner_emails(requested_limit integer,requested_id uuid DEFAULT NULL)
RETURNS TABLE(id uuid,lease_token uuid,workspace_id uuid,form_id uuid,session_id uuid,recipient text,first_attempt_at timestamptz)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE item record; stop_reason text;
BEGIN
 IF requested_limit IS NULL OR requested_limit NOT BETWEEN 1 AND 5 THEN RETURN; END IF;
 FOR item IN
  SELECT e.*,coalesce(s.enabled,false) AS enabled,
   coalesce(u.email_verified AND u.email=e.recipient_email AND w.created_by=e.recipient_user_id
    AND EXISTS(SELECT 1 FROM public.membership m WHERE m.workspace_id=e.workspace_id AND m.user_id=e.recipient_user_id AND m.role='owner'),false) AS eligible
  FROM public.response_email_delivery e
  LEFT JOIN public.form_email_settings s ON s.workspace_id=e.workspace_id AND s.form_id=e.form_id
  LEFT JOIN public.workspace w ON w.id=e.workspace_id
  LEFT JOIN public."user" u ON u.id=e.recipient_user_id
  WHERE (e.status='pending' OR (e.status='sending' AND e.lease_until<=now()))
   AND e.available_at<=now() AND (requested_id IS NULL OR e.id=requested_id)
  ORDER BY e.available_at,e.created_at,e.id LIMIT requested_limit FOR UPDATE OF e SKIP LOCKED
 LOOP
  stop_reason:=CASE WHEN NOT item.enabled THEN 'disabled'
   WHEN NOT item.eligible THEN 'recipient-unavailable'
   WHEN item.first_attempt_at<=now()-interval '23 hours' THEN 'idempotency-expired'
   WHEN item.attempts>=8 THEN 'attempts-exhausted' ELSE NULL END;
  IF stop_reason IS NOT NULL THEN
   UPDATE public.response_email_delivery e SET
    status=CASE WHEN stop_reason='disabled' THEN 'cancelled' ELSE 'needs_action' END,
    reason=stop_reason,lease_token=NULL,lease_until=NULL,updated_at=now() WHERE e.id=item.id;
  ELSE
   RETURN QUERY UPDATE public.response_email_delivery e SET status='sending',reason=NULL,
    attempts=e.attempts+1,first_attempt_at=coalesce(e.first_attempt_at,now()),
    lease_token=gen_random_uuid(),lease_until=now()+interval '2 minutes',updated_at=now()
    WHERE e.id=item.id RETURNING e.id,e.lease_token,e.workspace_id,e.form_id,e.session_id,e.recipient_email,e.first_attempt_at;
  END IF;
 END LOOP;
END $$;
--> statement-breakpoint
CREATE FUNCTION public.record_owner_email(requested_id uuid,requested_token uuid,outcome text,provider uuid,problem text,retry_seconds integer)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF NOT ((outcome='accepted' AND provider IS NOT NULL AND problem IS NULL)
  OR (outcome='retry' AND provider IS NULL AND problem IS NOT DISTINCT FROM 'provider-unavailable' AND retry_seconds BETWEEN 60 AND 3600)
  OR (outcome='needs_action' AND provider IS NULL AND coalesce(problem,'') IN('configuration','provider-rejected','idempotency-expired')))
  OR outcome IS NULL THEN RETURN false; END IF;
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
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.claim_owner_emails(integer,uuid) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.record_owner_email(uuid,uuid,text,uuid,text,integer) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.claim_owner_emails(integer,uuid) TO snapform_jobs;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.record_owner_email(uuid,uuid,text,uuid,text,integer) TO snapform_jobs;
