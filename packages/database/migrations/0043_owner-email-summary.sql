SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
-- Jobs may read only the bounded fields an owner email shows, only for a delivery it currently holds.
-- The name-like rule mirrors the inbox: the first answered short text whose label contains the word "name".
CREATE OR REPLACE FUNCTION public.owner_email_summary(requested_id uuid,requested_token uuid)
RETURNS TABLE(form_title text,submitted_at timestamptz,respondent_name text,respondent_email text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT left(coalesce(v.definition->>'title',''),120),r.submitted_at,
  (SELECT left(btrim(r.answers->(q.block->>'id')->>'value'),200)
   FROM jsonb_path_query(v.definition,'$.pages[*].blocks[*] ? (@.type == "short-text")') WITH ORDINALITY q(block,position)
   WHERE q.block->>'label' ~* '\mname\M' AND r.answers->(q.block->>'id')->>'state'='value'
    AND jsonb_typeof(r.answers->(q.block->>'id')->'value')='string' AND btrim(r.answers->(q.block->>'id')->>'value')<>''
   ORDER BY q.position LIMIT 1),
  (SELECT btrim(r.answers->(q.block->>'id')->>'value')
   FROM jsonb_path_query(v.definition,'$.pages[*].blocks[*] ? (@.type == "email")') WITH ORDINALITY q(block,position)
   WHERE r.answers->(q.block->>'id')->>'state'='value' AND jsonb_typeof(r.answers->(q.block->>'id')->'value')='string'
    AND length(btrim(r.answers->(q.block->>'id')->>'value')) BETWEEN 3 AND 254
   ORDER BY q.position LIMIT 1)
 FROM public.response_email_delivery e
 JOIN public.form_email_settings s ON s.workspace_id=e.workspace_id AND s.form_id=e.form_id AND s.enabled
 JOIN public.response_session r ON r.id=e.session_id AND r.workspace_id=e.workspace_id AND r.form_id=e.form_id AND r.status='submitted'
 JOIN public.form_version v ON v.workspace_id=r.workspace_id AND v.form_id=r.form_id AND v.id=r.version_id
 WHERE e.id=requested_id AND e.status='sending' AND e.lease_token=requested_token AND e.lease_until>clock_timestamp()
  AND NOT public.pending_target_deletion(e.workspace_id,e.session_id)
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.owner_email_summary(uuid,uuid) FROM PUBLIC,snapform_runtime,snapform_jobs;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.owner_email_summary(uuid,uuid) TO snapform_jobs;
