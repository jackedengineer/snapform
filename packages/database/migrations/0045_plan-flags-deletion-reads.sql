SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
-- Public forms also report the publishing workspace's effective plan, 'free'
-- or 'pro', from workspace_plan_limits (0041). The API turns it into the
-- respondent-facing badge and embed flags with the shared contracts rules.
-- A new result column needs DROP + CREATE in this transaction. Callers select
-- named columns, so code that does not read plan keeps working. Grants match
-- 0044: no PUBLIC, runtime only. The body is otherwise 0044's.
DROP FUNCTION public.resolve_published_form(uuid);
--> statement-breakpoint
CREATE FUNCTION public.resolve_published_form(requested_public_id uuid)
RETURNS TABLE (public_id uuid, version_id uuid, definition jsonb, business_name text, plan text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT p.public_id, v.id, v.definition, nullif(left(btrim(w.name), 80), ''),
    (SELECT l.plan FROM public.workspace_plan_limits(p.workspace_id) l)
  FROM public.form_publication p
  JOIN public.form_version v
    ON v.workspace_id = p.workspace_id
    AND v.form_id = p.form_id
    AND v.id = p.version_id
  JOIN public.workspace w ON w.id = p.workspace_id
  WHERE p.public_id = requested_public_id AND p.active = true
    AND NOT public.pending_workspace_deletion(p.workspace_id)
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.resolve_published_form(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.resolve_published_form(uuid) TO snapform_runtime;
--> statement-breakpoint
-- Whether a response, or its whole workspace, is awaiting deletion. The runtime
-- cannot call pending_target_deletion (0034), so inbox lists and CSV exports
-- used to include responses scheduled for deletion. This answers only for a
-- member of the workspace scope_workspace set for this transaction. Any other
-- caller gets true, so a NOT filter returns nothing rather than leaking rows
-- or revealing another workspace's deletion requests.
CREATE FUNCTION public.response_deletion_pending(requested_workspace uuid, requested_response uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT CASE WHEN requested_workspace::text = current_setting('snapform.workspace_id', true)
   AND EXISTS(SELECT 1 FROM public.membership m WHERE m.workspace_id = requested_workspace
    AND m.user_id = current_setting('snapform.user_id', true))
  THEN public.pending_target_deletion(requested_workspace, requested_response)
  ELSE true END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.response_deletion_pending(uuid,uuid) FROM PUBLIC,snapform_runtime,snapform_jobs;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.response_deletion_pending(uuid,uuid) TO snapform_runtime;
