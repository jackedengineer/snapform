CREATE FUNCTION public.resolve_published_form(requested_public_id uuid)
RETURNS TABLE (public_id uuid, version_id uuid, definition jsonb)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT p.public_id, v.id, v.definition
  FROM public.form_publication p
  JOIN public.form_version v
    ON v.workspace_id = p.workspace_id
    AND v.form_id = p.form_id
    AND v.id = p.version_id
  WHERE p.public_id = requested_public_id AND p.active = true
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.resolve_published_form(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.resolve_published_form(uuid) TO snapform_runtime;
