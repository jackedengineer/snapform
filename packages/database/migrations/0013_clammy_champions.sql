CREATE TABLE "intake_operation" (
	"session_id" uuid NOT NULL,
	"id" uuid NOT NULL,
	"kind" text NOT NULL,
	"payload_hash" text NOT NULL,
	"base_revision" integer NOT NULL,
	"result_revision" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "intake_operation_session_id_id_pk" PRIMARY KEY("session_id","id"),
	CONSTRAINT "intake_operation_kind" CHECK ("intake_operation"."kind" in ('save','submit')),
	CONSTRAINT "intake_operation_hash" CHECK ("intake_operation"."payload_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "intake_operation_revisions" CHECK ("intake_operation"."base_revision" > 0 and "intake_operation"."result_revision" = "intake_operation"."base_revision" + 1)
);
--> statement-breakpoint
ALTER TABLE "intake_operation" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "response_session" ADD COLUMN "submitted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "response_session" ADD COLUMN "ending_id" uuid;--> statement-breakpoint
ALTER TABLE "intake_operation" ADD CONSTRAINT "intake_operation_session_id_response_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."response_session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "response_session" ADD CONSTRAINT "response_session_submission" CHECK (("response_session"."status" = 'collecting' and "response_session"."submitted_at" is null and "response_session"."ending_id" is null) or ("response_session"."status" = 'submitted' and "response_session"."submitted_at" is not null and "response_session"."ending_id" is not null));--> statement-breakpoint
CREATE POLICY "intake_operation_read" ON "intake_operation" AS PERMISSIVE FOR SELECT TO "snapform_runtime" USING (public.intake_session_access("intake_operation"."session_id"));--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.intake_session_access(requested_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog
AS $$
 SELECT EXISTS (SELECT 1 FROM public.response_session s
 JOIN public.form_publication p ON p.workspace_id=s.workspace_id AND p.form_id=s.form_id
 WHERE s.id=requested_id AND s.id::text=current_setting('snapform.intake_id',true)
 AND s.capability_hash=current_setting('snapform.intake_hash',true)
 AND p.public_id::text=current_setting('snapform.public_id',true)
 AND s.expires_at>now() AND (p.active OR s.status='submitted'))
$$;
--> statement-breakpoint
REVOKE UPDATE (answers,revision,updated_at) ON public.response_session FROM snapform_runtime;
--> statement-breakpoint
REVOKE ALL ON public.intake_operation FROM PUBLIC;
--> statement-breakpoint
GRANT SELECT ON public.intake_operation TO snapform_runtime;
--> statement-breakpoint
CREATE FUNCTION public.mutate_response_session(requested_id uuid, requested_operation uuid, requested_revision integer, requested_kind text, requested_answers jsonb, prepared_answers jsonb, prepared_ending uuid)
RETURNS TABLE (outcome text, revision integer, current_revision integer, status text)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog
AS $$
DECLARE
 creator text;
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
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.mutate_response_session(uuid,uuid,integer,text,jsonb,jsonb,uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.mutate_response_session(uuid,uuid,integer,text,jsonb,jsonb,uuid) TO snapform_runtime;
