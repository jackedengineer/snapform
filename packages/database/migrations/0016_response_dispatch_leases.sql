CREATE ROLE snapform_jobs NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
--> statement-breakpoint
GRANT CONNECT ON DATABASE snapform TO snapform_jobs;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO snapform_jobs;
--> statement-breakpoint
CREATE FUNCTION public.claim_response_events(requested_limit integer, requested_event uuid DEFAULT NULL)
RETURNS TABLE(event_id uuid, lease_token uuid)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog
AS $$
BEGIN
 IF requested_limit IS NULL OR requested_limit NOT BETWEEN 1 AND 20 THEN RETURN; END IF;
 RETURN QUERY
 WITH due AS (
  SELECT e.id FROM public.response_outbox e
  WHERE e.completed_at IS NULL AND e.available_at<=now()
  AND (e.lease_until IS NULL OR e.lease_until<=now())
  AND (requested_event IS NULL OR e.id=requested_event)
  ORDER BY e.available_at,e.created_at,e.id
  LIMIT requested_limit FOR UPDATE SKIP LOCKED
 )
 UPDATE public.response_outbox e SET lease_token=gen_random_uuid(),
 lease_until=now()+interval '2 minutes',attempts=least(e.attempts::bigint+1,2147483647)::integer
 FROM due WHERE e.id=due.id RETURNING e.id,e.lease_token;
END
$$;
--> statement-breakpoint
CREATE FUNCTION public.record_response_dispatch(requested_id uuid, requested_token uuid, queued boolean)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog
AS $$
BEGIN
 IF queued IS NULL THEN RETURN false; END IF;
 UPDATE public.response_outbox e SET
 dispatched_at=CASE WHEN queued THEN now() ELSE e.dispatched_at END,
 available_at=now()+CASE WHEN queued THEN interval '1 hour'
 ELSE interval '1 minute'*least(60,power(2,least(e.attempts,6))::integer) END,
 lease_token=NULL,lease_until=NULL
 WHERE e.id=requested_id AND e.lease_token=requested_token
 AND e.lease_until>now() AND e.completed_at IS NULL;
 RETURN FOUND;
END
$$;
--> statement-breakpoint
CREATE FUNCTION public.acknowledge_response_event(requested_id uuid)
RETURNS text LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog
AS $$
BEGIN
 UPDATE public.response_outbox e SET completed_at=now(),lease_token=NULL,lease_until=NULL
 WHERE e.id=requested_id AND e.completed_at IS NULL;
 IF FOUND THEN RETURN 'completed'; END IF;
 IF EXISTS(SELECT 1 FROM public.response_outbox e WHERE e.id=requested_id AND e.completed_at IS NOT NULL)
 THEN RETURN 'already_completed'; END IF;
 RETURN 'missing';
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.claim_response_events(integer,uuid) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.record_response_dispatch(uuid,uuid,boolean) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.acknowledge_response_event(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.claim_response_events(integer,uuid) TO snapform_jobs;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.record_response_dispatch(uuid,uuid,boolean) TO snapform_jobs;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.acknowledge_response_event(uuid) TO snapform_jobs;
