SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
-- Public forms name the business behind them: the workspace name, trimmed and
-- bounded to 80 characters. A new result column needs DROP + CREATE in this
-- transaction. Callers select named columns, so code that does not read
-- business_name keeps working. Grants match 0009: no PUBLIC, runtime only.
DROP FUNCTION public.resolve_published_form(uuid);
--> statement-breakpoint
CREATE FUNCTION public.resolve_published_form(requested_public_id uuid)
RETURNS TABLE (public_id uuid, version_id uuid, definition jsonb, business_name text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT p.public_id, v.id, v.definition, nullif(left(btrim(w.name), 80), '')
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
