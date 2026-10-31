SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
CREATE FUNCTION public.pending_target_deletion(requested_workspace uuid,requested_response uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT EXISTS(SELECT 1 FROM public.deletion_request d
  WHERE d.workspace_id=requested_workspace AND d.cancelled_at IS NULL
   AND (d.kind='workspace' OR (d.kind='response' AND d.target_id=requested_response)))
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.pending_target_deletion(uuid,uuid) FROM PUBLIC,snapform_runtime,snapform_jobs;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.resolve_published_form(requested_public_id uuid)
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
    AND NOT public.pending_workspace_deletion(p.workspace_id)
$$;

--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.intake_session_access(requested_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog
AS $$
 SELECT EXISTS (SELECT 1 FROM public.response_session s
 JOIN public.form_publication p ON p.workspace_id=s.workspace_id AND p.form_id=s.form_id
 WHERE s.id=requested_id AND s.id::text=current_setting('snapform.intake_id',true)
 AND s.capability_hash=current_setting('snapform.intake_hash',true)
 AND p.public_id::text=current_setting('snapform.public_id',true)
 AND NOT public.pending_target_deletion(s.workspace_id,s.id)
 AND s.expires_at>now() AND (p.active OR s.status='submitted'))
$$;

--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.start_response_session(requested_public_id uuid, requested_id uuid, requested_hash text)
RETURNS uuid LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  creator text;
  target_workspace uuid;
  trial_started timestamp with time zone;
  used integer;
  reserved bigint;
  publication_record record;
  result_id uuid;
BEGIN
  IF requested_hash IS NULL OR requested_hash !~ '^[0-9a-f]{64}$' THEN RETURN NULL; END IF;
  -- Always lock workspace before quota, publication or response rows.
  SELECT w.id INTO target_workspace FROM public.workspace w
    JOIN public.form_publication p ON p.workspace_id=w.id
    WHERE p.public_id=requested_public_id FOR UPDATE OF w;
  IF NOT FOUND OR public.pending_target_deletion(target_workspace,requested_id) THEN RETURN NULL; END IF;
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
    VALUES (requested_id, publication_record.workspace_id, publication_record.form_id, publication_record.version_id, requested_hash, now() + interval '7 days')
    ON CONFLICT DO NOTHING RETURNING id INTO result_id;
  RETURN result_id;
END
$$;

--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.mutate_response_session(requested_id uuid, requested_operation uuid, requested_revision integer, requested_kind text, requested_answers jsonb, prepared_answers jsonb, prepared_ending uuid)
RETURNS TABLE (outcome text, revision integer, current_revision integer, status text)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog
AS $$
DECLARE
 creator text;
 target_workspace uuid;
 trial_started timestamptz;
 used integer;
 reserved bigint;
 current_session public.response_session%ROWTYPE;
 receipt public.intake_operation%ROWTYPE;
 request_hash text;
BEGIN
 outcome:='INTAKE_UNAVAILABLE';
 IF requested_operation IS NULL OR requested_revision IS NULL OR requested_revision NOT BETWEEN 1 AND 2147483646
 OR requested_kind NOT IN ('save','submit') OR requested_kind IS NULL
 OR jsonb_typeof(requested_answers) IS DISTINCT FROM 'object'
 OR jsonb_typeof(prepared_answers) IS DISTINCT FROM 'object'
 OR octet_length(requested_answers::text)>2097152 OR octet_length(prepared_answers::text)>2097152
 OR prepared_ending IS NULL THEN RETURN NEXT; RETURN; END IF;
 -- Authenticate before locking, then recheck after waiting for the workspace.
 SELECT s.workspace_id INTO target_workspace FROM public.response_session s
 WHERE s.id=requested_id AND public.intake_session_access(s.id);
 IF NOT FOUND THEN RETURN NEXT; RETURN; END IF;
 PERFORM 1 FROM public.workspace w WHERE w.id=target_workspace FOR UPDATE;
 IF NOT FOUND OR NOT public.intake_session_access(requested_id) THEN RETURN NEXT; RETURN; END IF;
 SELECT w.created_by,u.created_at INTO creator,trial_started FROM public.response_session s
 JOIN public.workspace w ON w.id=s.workspace_id JOIN public."user" u ON u.id=w.created_by
 WHERE s.id=requested_id AND u.email_verified AND public.intake_session_access(s.id);
 IF NOT FOUND THEN RETURN NEXT; RETURN; END IF;
 UPDATE public.trial_response_usage t SET updated_at=now() WHERE t.owner_id=creator RETURNING t.responses_used INTO used;
 IF NOT FOUND THEN RETURN NEXT; RETURN; END IF;
 PERFORM 1 FROM public.form_publication p JOIN public.response_session s ON s.workspace_id=p.workspace_id AND s.form_id=p.form_id
 WHERE s.id=requested_id AND public.intake_session_access(s.id) FOR SHARE OF p;
 IF NOT FOUND THEN RETURN NEXT; RETURN; END IF;
 SELECT s.* INTO current_session FROM public.response_session s WHERE s.id=requested_id AND public.intake_session_access(s.id) FOR UPDATE;
 IF NOT FOUND THEN RETURN NEXT; RETURN; END IF;
 request_hash:=encode(sha256(convert_to(jsonb_build_object('kind',requested_kind,'revision',requested_revision,'answers',requested_answers)::text,'UTF8')),'hex');
 SELECT o.* INTO receipt FROM public.intake_operation o WHERE o.session_id=requested_id AND o.id=requested_operation;
 IF FOUND THEN
  IF receipt.payload_hash<>request_hash THEN outcome:='INTAKE_OPERATION_CONFLICT'; RETURN NEXT; RETURN; END IF;
  outcome:='ok'; revision:=receipt.result_revision; current_revision:=current_session.revision;
  status:=CASE WHEN receipt.kind='submit' THEN 'submitted' ELSE 'collecting' END;
  RETURN NEXT; RETURN;
 END IF;
 IF current_session.status='submitted' THEN outcome:='INTAKE_ALREADY_SUBMITTED'; RETURN NEXT; RETURN; END IF;
 IF current_session.revision<>requested_revision THEN outcome:='INTAKE_CONFLICT'; RETURN NEXT; RETURN; END IF;
 IF current_session.reservation_until<=now() THEN
  IF trial_started+interval '14 days'<=now() THEN outcome:='INTAKE_QUOTA_UNAVAILABLE'; RETURN NEXT; RETURN; END IF;
  SELECT count(*) INTO reserved FROM public.response_session s JOIN public.workspace w ON w.id=s.workspace_id
  WHERE w.created_by=creator AND s.status='collecting' AND s.reservation_until>now() AND s.expires_at>now();
  IF used+reserved>=50 THEN outcome:='INTAKE_QUOTA_UNAVAILABLE'; RETURN NEXT; RETURN; END IF;
 END IF;
 IF requested_kind='submit' THEN
  IF used>=50 THEN outcome:='INTAKE_QUOTA_UNAVAILABLE'; RETURN NEXT; RETURN; END IF;
  UPDATE public.trial_response_usage t SET responses_used=t.responses_used+1,updated_at=now() WHERE t.owner_id=creator;
 END IF;
 UPDATE public.response_session s SET answers=prepared_answers,revision=requested_revision+1,updated_at=now(),
 status=CASE WHEN requested_kind='submit' THEN 'submitted' ELSE 'collecting' END,
 submitted_at=CASE WHEN requested_kind='submit' THEN now() ELSE NULL END,
 ending_id=CASE WHEN requested_kind='submit' THEN prepared_ending ELSE NULL END,
 reservation_until=CASE WHEN trial_started+interval '14 days'>now() THEN least(s.expires_at,now()+interval '15 minutes') ELSE s.reservation_until END
 WHERE s.id=requested_id;
 INSERT INTO public.intake_operation(session_id,id,kind,payload_hash,base_revision,result_revision)
 VALUES(requested_id,requested_operation,requested_kind,request_hash,requested_revision,requested_revision+1);
 outcome:='ok'; revision:=requested_revision+1; current_revision:=revision;
 status:=CASE WHEN requested_kind='submit' THEN 'submitted' ELSE 'collecting' END;
 RETURN NEXT;
END
$$;
