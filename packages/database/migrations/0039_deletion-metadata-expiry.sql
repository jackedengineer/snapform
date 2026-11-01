SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
CREATE FUNCTION public.prune_deletion_metadata(requested_limit integer)
RETURNS TABLE(requests_deleted integer,intents_deleted integer)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 requests_deleted:=0; intents_deleted:=0;
 IF requested_limit IS NULL OR requested_limit NOT BETWEEN 1 AND 100 THEN RETURN NEXT; RETURN; END IF;
 WITH eligible AS (
  SELECT d.id FROM public.deletion_request d LEFT JOIN public.purge_intent p ON p.id=d.purge_id
  WHERE d.cancelled_at<clock_timestamp()-interval '90 days'
   OR (p.completed_at<clock_timestamp()-interval '90 days'
    AND NOT EXISTS(SELECT 1 FROM public.workspace w WHERE p.kind='workspace' AND w.id=p.target_id)
    AND NOT EXISTS(SELECT 1 FROM public.response_session r WHERE p.kind='response' AND r.id=p.target_id))
  ORDER BY coalesce(d.cancelled_at,p.completed_at),d.id LIMIT requested_limit FOR UPDATE OF d SKIP LOCKED
 ) DELETE FROM public.deletion_request d USING eligible e WHERE d.id=e.id;
 GET DIAGNOSTICS requests_deleted=ROW_COUNT;
 WITH eligible AS (
  SELECT p.id FROM public.purge_intent p
  WHERE p.completed_at<clock_timestamp()-interval '90 days'
   AND NOT EXISTS(SELECT 1 FROM public.deletion_request d WHERE d.purge_id=p.id)
   AND NOT EXISTS(SELECT 1 FROM public.workspace w WHERE p.kind='workspace' AND w.id=p.target_id)
   AND NOT EXISTS(SELECT 1 FROM public.response_session r WHERE p.kind='response' AND r.id=p.target_id)
  ORDER BY p.completed_at,p.id LIMIT requested_limit FOR UPDATE OF p SKIP LOCKED
 ) DELETE FROM public.purge_intent p USING eligible e WHERE p.id=e.id;
 GET DIAGNOSTICS intents_deleted=ROW_COUNT;
 RETURN NEXT;
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.prune_deletion_metadata(integer) FROM PUBLIC,snapform_runtime,snapform_jobs;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.prune_deletion_metadata(integer) TO snapform_jobs;
