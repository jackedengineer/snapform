SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
CREATE FUNCTION public.scope_intake_request(requested_public uuid,requested_session uuid,requested_hash text)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF requested_public IS NULL OR requested_session IS NULL OR requested_hash IS NULL
  OR requested_hash !~ '^[0-9a-f]{64}$' THEN
  RAISE EXCEPTION 'INTAKE_UNAVAILABLE' USING ERRCODE='SF001';
 END IF;
 PERFORM set_config('snapform.user_id','',true),set_config('snapform.workspace_id','',true),set_config('snapform.role','',true),
  set_config('snapform.public_id',requested_public::text,true),set_config('snapform.intake_id',requested_session::text,true),
  set_config('snapform.intake_hash',requested_hash,true);
END $$;
--> statement-breakpoint
CREATE FUNCTION public.open_intake_session(requested_public uuid,requested_session uuid,requested_hash text)
RETURNS TABLE(id uuid,public_id uuid,version_id uuid,definition jsonb,revision integer,answers jsonb,expires_at timestamptz,status text)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 PERFORM public.scope_intake_request(requested_public,requested_session,requested_hash);
 IF public.start_response_session(requested_public,requested_session,requested_hash) IS DISTINCT FROM requested_session THEN
  RAISE EXCEPTION 'INTAKE_UNAVAILABLE' USING ERRCODE='SF001';
 END IF;
 RETURN QUERY SELECT * FROM public.read_response_session(requested_session);
 IF NOT FOUND THEN RAISE EXCEPTION 'INTAKE_UNAVAILABLE' USING ERRCODE='SF001'; END IF;
EXCEPTION WHEN SQLSTATE 'SF001' THEN
 -- Roll back failed admission/context effects while keeping an outer fixture usable.
 RETURN;
END $$;
--> statement-breakpoint
CREATE FUNCTION public.resume_intake_session(requested_public uuid,requested_session uuid,requested_hash text)
RETURNS TABLE(id uuid,public_id uuid,version_id uuid,definition jsonb,revision integer,answers jsonb,expires_at timestamptz,status text)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 PERFORM public.scope_intake_request(requested_public,requested_session,requested_hash);
 RETURN QUERY SELECT * FROM public.read_response_session(requested_session);
 IF NOT FOUND THEN RAISE EXCEPTION 'INTAKE_UNAVAILABLE' USING ERRCODE='SF001'; END IF;
EXCEPTION WHEN SQLSTATE 'SF001' THEN RETURN;
END $$;
--> statement-breakpoint
CREATE FUNCTION public.write_intake_session(requested_public uuid,requested_session uuid,requested_hash text,
 requested_operation uuid,requested_revision integer,requested_kind text,requested_answers jsonb,prepared_answers jsonb,prepared_ending uuid)
RETURNS TABLE(outcome text,revision integer,current_revision integer,status text)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE receipt record; failure text:='INTAKE_UNAVAILABLE';
BEGIN
 PERFORM public.scope_intake_request(requested_public,requested_session,requested_hash);
 SELECT * INTO receipt FROM public.mutate_response_session(requested_session,requested_operation,
  requested_revision,requested_kind,requested_answers,prepared_answers,prepared_ending);
 IF NOT FOUND OR receipt.outcome IS DISTINCT FROM 'ok' THEN
  failure:=coalesce(receipt.outcome,'INTAKE_UNAVAILABLE');
  RAISE EXCEPTION 'INTAKE_WRITE_REJECTED' USING ERRCODE='SF001';
 END IF;
 RETURN QUERY SELECT receipt.outcome::text,receipt.revision::integer,receipt.current_revision::integer,receipt.status::text;
EXCEPTION WHEN SQLSTATE 'SF001' THEN
 -- Variables survive the block rollback; quota/session/receipt/outbox changes do not.
 RETURN QUERY SELECT failure,NULL::integer,NULL::integer,NULL::text;
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.scope_intake_request(uuid,uuid,text),public.open_intake_session(uuid,uuid,text),
 public.resume_intake_session(uuid,uuid,text),public.write_intake_session(uuid,uuid,text,uuid,integer,text,jsonb,jsonb,uuid)
 FROM PUBLIC,snapform_runtime,snapform_jobs;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.open_intake_session(uuid,uuid,text),public.resume_intake_session(uuid,uuid,text),
 public.write_intake_session(uuid,uuid,text,uuid,integer,text,jsonb,jsonb,uuid) TO snapform_runtime;
