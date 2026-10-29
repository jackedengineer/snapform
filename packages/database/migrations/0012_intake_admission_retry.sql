CREATE OR REPLACE FUNCTION public.start_response_session(requested_public_id uuid, requested_id uuid, requested_hash text)
RETURNS uuid LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  creator text;
  trial_started timestamp with time zone;
  used integer;
  reserved bigint;
  publication_record record;
  result_id uuid;
BEGIN
  IF requested_hash IS NULL OR requested_hash !~ '^[0-9a-f]{64}$' THEN RETURN NULL; END IF;
  IF public.intake_session_access(requested_id)
    AND requested_hash = current_setting('snapform.intake_hash', true)
    AND requested_public_id::text = current_setting('snapform.public_id', true)
  THEN RETURN requested_id; END IF;
  SELECT w.created_by INTO creator
    FROM public.form_publication p JOIN public.workspace w ON w.id = p.workspace_id
    WHERE p.public_id = requested_public_id AND p.active = true;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT u.created_at INTO trial_started FROM public."user" u WHERE u.id = creator AND u.email_verified = true;
  IF NOT FOUND OR trial_started + interval '14 days' <= now() THEN RETURN NULL; END IF;
  INSERT INTO public.trial_response_usage (owner_id) VALUES (creator) ON CONFLICT DO NOTHING;
  -- The counter update serializes reservations, including under stronger isolation levels.
  UPDATE public.trial_response_usage SET updated_at = now() WHERE owner_id = creator RETURNING responses_used INTO used;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF public.intake_session_access(requested_id)
    AND requested_hash = current_setting('snapform.intake_hash', true)
    AND requested_public_id::text = current_setting('snapform.public_id', true)
  THEN RETURN requested_id; END IF;
  SELECT count(*) INTO reserved
    FROM public.response_session s JOIN public.workspace w ON w.id = s.workspace_id
    WHERE w.created_by = creator AND s.status = 'collecting'
      AND s.reservation_until > now() AND s.expires_at > now();
  IF used + reserved >= 50 THEN RETURN NULL; END IF;
  SELECT p.* INTO publication_record
    FROM public.form_publication p JOIN public.workspace w ON w.id = p.workspace_id
    WHERE p.public_id = requested_public_id AND p.active = true AND w.created_by = creator
    FOR SHARE OF p;
  IF NOT FOUND THEN RETURN NULL; END IF;
  INSERT INTO public.response_session (id, workspace_id, form_id, version_id, capability_hash, expires_at)
    VALUES (requested_id, publication_record.workspace_id, publication_record.form_id, publication_record.version_id, requested_hash, now() + interval '24 hours')
    ON CONFLICT DO NOTHING RETURNING id INTO result_id;
  RETURN result_id;
END
$$;
