SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
CREATE TABLE "billing_event" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"subscription_id" text,
	"outcome" text NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "billing_event_id" CHECK ("billing_event"."id" ~ '^[A-Za-z0-9_-]{1,64}$'),
	CONSTRAINT "billing_event_type" CHECK ("billing_event"."type" ~ '^[a-z_.]{1,64}$'),
	CONSTRAINT "billing_event_outcome" CHECK ("billing_event"."outcome" in ('applied','ignored'))
);
--> statement-breakpoint
ALTER TABLE "billing_event" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "workspace_plan" (
	"workspace_id" uuid PRIMARY KEY NOT NULL,
	"plan" text DEFAULT 'free' NOT NULL,
	"status" text DEFAULT 'none' NOT NULL,
	"billing_interval" text,
	"currency" text,
	"current_period_start" timestamp with time zone,
	"current_period_end" timestamp with time zone,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"razorpay_subscription_id" text,
	"razorpay_customer_id" text,
	"last_event_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_plan_razorpay_subscription_id_unique" UNIQUE("razorpay_subscription_id"),
	CONSTRAINT "workspace_plan_plan" CHECK ("workspace_plan"."plan" in ('free','pro')),
	CONSTRAINT "workspace_plan_status" CHECK ("workspace_plan"."status" in ('none','created','active','halted','cancelled','completed')),
	CONSTRAINT "workspace_plan_interval" CHECK ("workspace_plan"."billing_interval" is null or "workspace_plan"."billing_interval" in ('monthly','annual')),
	CONSTRAINT "workspace_plan_currency" CHECK ("workspace_plan"."currency" is null or "workspace_plan"."currency" in ('INR','USD')),
	CONSTRAINT "workspace_plan_period" CHECK ("workspace_plan"."current_period_end" is null or "workspace_plan"."current_period_start" is null or "workspace_plan"."current_period_end">"workspace_plan"."current_period_start"),
	CONSTRAINT "workspace_plan_provider_ids" CHECK (("workspace_plan"."razorpay_subscription_id" is null or "workspace_plan"."razorpay_subscription_id" ~ '^sub_[A-Za-z0-9]{1,40}$') and ("workspace_plan"."razorpay_customer_id" is null or "workspace_plan"."razorpay_customer_id" ~ '^cust_[A-Za-z0-9]{1,40}$'))
);
--> statement-breakpoint
ALTER TABLE "workspace_plan" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "workspace_response_usage" (
	"workspace_id" uuid NOT NULL,
	"period_start" date NOT NULL,
	"responses_used" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_response_usage_workspace_id_period_start_pk" PRIMARY KEY("workspace_id","period_start"),
	CONSTRAINT "workspace_response_usage_bounds" CHECK ("workspace_response_usage"."responses_used" >= 0),
	CONSTRAINT "workspace_response_usage_month" CHECK (extract(day from "workspace_response_usage"."period_start") = 1)
);
--> statement-breakpoint
ALTER TABLE "workspace_response_usage" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "workspace_plan" ADD CONSTRAINT "workspace_plan_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_response_usage" ADD CONSTRAINT "workspace_response_usage_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE public.workspace_plan FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.workspace_response_usage FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.billing_event FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON TABLE public.workspace_plan,public.workspace_response_usage,public.billing_event FROM PUBLIC,snapform_runtime,snapform_jobs;
--> statement-breakpoint
-- Limits mirror packages/contracts/src/plans.ts. A missing plan row is Free, and
-- Pro lasts only while its paid period has not ended, so a lapse needs no job.
CREATE FUNCTION public.workspace_plan_limits(requested_workspace uuid)
RETURNS TABLE(plan text,live_forms integer,monthly_responses integer,seats integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT e.plan,CASE e.plan WHEN 'pro' THEN NULL ELSE 3 END,CASE e.plan WHEN 'pro' THEN 2000 ELSE 100 END,
  CASE e.plan WHEN 'pro' THEN 3 ELSE 1 END
 FROM (SELECT CASE WHEN EXISTS(SELECT 1 FROM public.workspace_plan p WHERE p.workspace_id=requested_workspace
  AND p.plan='pro' AND p.current_period_end>now()) THEN 'pro' ELSE 'free' END AS plan) e
$$;
--> statement-breakpoint
-- Usage resets at 00:00 UTC on the first day of each calendar month.
CREATE FUNCTION public.usage_period_start()
RETURNS date LANGUAGE sql STABLE SET search_path=pg_catalog AS $$
 SELECT (date_trunc('month',now() AT TIME ZONE 'UTC'))::date
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.start_response_session(requested_public_id uuid, requested_id uuid, requested_hash text)
RETURNS uuid LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  target_workspace uuid;
  usage_month date;
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
  -- The creator must still be verified; the old creator trial clock no longer applies.
  PERFORM 1 FROM public.form_publication p JOIN public.workspace w ON w.id=p.workspace_id
    JOIN public."user" u ON u.id=w.created_by
    WHERE p.public_id=requested_public_id AND p.active AND u.email_verified;
  IF NOT FOUND THEN RETURN NULL; END IF;
  usage_month:=public.usage_period_start();
  INSERT INTO public.workspace_response_usage(workspace_id,period_start) VALUES(target_workspace,usage_month) ON CONFLICT DO NOTHING;
  -- The counter update serializes reservations, including under stronger isolation levels.
  UPDATE public.workspace_response_usage u SET updated_at=now()
    WHERE u.workspace_id=target_workspace AND u.period_start=usage_month RETURNING u.responses_used INTO used;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF public.intake_session_access(requested_id)
    AND requested_hash = current_setting('snapform.intake_hash', true)
    AND requested_public_id::text = current_setting('snapform.public_id', true)
  THEN RETURN requested_id; END IF;
  SELECT count(*) INTO reserved FROM public.response_session s
    WHERE s.workspace_id=target_workspace AND s.status='collecting'
      AND s.reservation_until>now() AND s.expires_at>now();
  IF used+reserved>=(SELECT l.monthly_responses FROM public.workspace_plan_limits(target_workspace) l) THEN
    RAISE EXCEPTION 'FORM_NOT_ACCEPTING' USING ERRCODE='SF002';
  END IF;
  SELECT p.* INTO publication_record FROM public.form_publication p
    WHERE p.public_id=requested_public_id AND p.active=true AND p.workspace_id=target_workspace
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
 target_workspace uuid;
 usage_month date;
 response_limit integer;
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
 PERFORM 1 FROM public.workspace w JOIN public."user" u ON u.id=w.created_by
 WHERE w.id=target_workspace AND u.email_verified;
 IF NOT FOUND THEN RETURN NEXT; RETURN; END IF;
 usage_month:=public.usage_period_start();
 INSERT INTO public.workspace_response_usage(workspace_id,period_start) VALUES(target_workspace,usage_month) ON CONFLICT DO NOTHING;
 UPDATE public.workspace_response_usage u SET updated_at=now()
 WHERE u.workspace_id=target_workspace AND u.period_start=usage_month RETURNING u.responses_used INTO used;
 IF NOT FOUND THEN RETURN NEXT; RETURN; END IF;
 SELECT l.monthly_responses INTO response_limit FROM public.workspace_plan_limits(target_workspace) l;
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
  SELECT count(*) INTO reserved FROM public.response_session s
  WHERE s.workspace_id=target_workspace AND s.status='collecting' AND s.reservation_until>now() AND s.expires_at>now();
  IF used+reserved>=response_limit THEN outcome:='FORM_NOT_ACCEPTING'; RETURN NEXT; RETURN; END IF;
 END IF;
 IF requested_kind='submit' THEN
  IF used>=response_limit THEN outcome:='FORM_NOT_ACCEPTING'; RETURN NEXT; RETURN; END IF;
  UPDATE public.workspace_response_usage u SET responses_used=u.responses_used+1,updated_at=now()
  WHERE u.workspace_id=target_workspace AND u.period_start=usage_month;
 END IF;
 UPDATE public.response_session s SET answers=prepared_answers,revision=requested_revision+1,updated_at=now(),
 status=CASE WHEN requested_kind='submit' THEN 'submitted' ELSE 'collecting' END,
 submitted_at=CASE WHEN requested_kind='submit' THEN now() ELSE NULL END,
 ending_id=CASE WHEN requested_kind='submit' THEN prepared_ending ELSE NULL END,
 reservation_until=least(s.expires_at,now()+interval '15 minutes')
 WHERE s.id=requested_id;
 INSERT INTO public.intake_operation(session_id,id,kind,payload_hash,base_revision,result_revision)
 VALUES(requested_id,requested_operation,requested_kind,request_hash,requested_revision,requested_revision+1);
 outcome:='ok'; revision:=requested_revision+1; current_revision:=revision;
 status:=CASE WHEN requested_kind='submit' THEN 'submitted' ELSE 'collecting' END;
 RETURN NEXT;
END
$$;
--> statement-breakpoint
-- Activating a form beyond the plan's live-form limit fails. Already live forms
-- stay live and updatable after a downgrade; nothing is unpublished here.
CREATE FUNCTION public.enforce_live_form_limit()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE live_limit integer;
BEGIN
 -- Same lock order as scope_workspace and intake: workspace before publication rows.
 PERFORM 1 FROM public.workspace w WHERE w.id=NEW.workspace_id FOR UPDATE;
 IF EXISTS(SELECT 1 FROM public.form_publication p
  WHERE p.workspace_id=NEW.workspace_id AND p.form_id=NEW.form_id AND p.active) THEN RETURN NEW; END IF;
 SELECT l.live_forms INTO live_limit FROM public.workspace_plan_limits(NEW.workspace_id) l;
 IF live_limit IS NOT NULL AND (SELECT count(*) FROM public.form_publication p
  WHERE p.workspace_id=NEW.workspace_id AND p.active)>=live_limit THEN
  RAISE EXCEPTION 'LIVE_FORM_LIMIT' USING ERRCODE='SF003';
 END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER form_publication_live_limit BEFORE INSERT OR UPDATE OF active ON public.form_publication
FOR EACH ROW WHEN (NEW.active) EXECUTE FUNCTION public.enforce_live_form_limit();
--> statement-breakpoint
-- Any member may read plan, limits and usage. Only an owner also gets the subscription
-- ID, which the API uses to reopen checkout or cancel and never sends to browsers.
CREATE FUNCTION public.workspace_billing(requested_workspace uuid)
RETURNS TABLE(plan text,status text,billing_interval text,currency text,current_period_end timestamptz,
 cancel_at_period_end boolean,subscription_id text,responses_used integer,responses_reserved integer,
 response_limit integer,live_forms integer,live_form_limit integer,seats_used integer,seat_limit integer,resets_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT l.plan,coalesce(p.status,'none'),p.billing_interval,p.currency,p.current_period_end,
  coalesce(p.cancel_at_period_end,false),
  CASE WHEN EXISTS(SELECT 1 FROM public.membership m WHERE m.workspace_id=requested_workspace
   AND m.user_id=current_setting('snapform.user_id',true) AND m.role='owner') THEN p.razorpay_subscription_id END,
  coalesce((SELECT u.responses_used FROM public.workspace_response_usage u
   WHERE u.workspace_id=requested_workspace AND u.period_start=public.usage_period_start()),0),
  (SELECT count(*)::integer FROM public.response_session s WHERE s.workspace_id=requested_workspace
   AND s.status='collecting' AND s.reservation_until>now() AND s.expires_at>now()),
  l.monthly_responses,
  (SELECT count(*)::integer FROM public.form_publication f WHERE f.workspace_id=requested_workspace AND f.active),
  l.live_forms,
  (SELECT count(*)::integer FROM public.membership m WHERE m.workspace_id=requested_workspace),
  l.seats,
  (public.usage_period_start()+interval '1 month') AT TIME ZONE 'UTC'
 FROM public.workspace_plan_limits(requested_workspace) l
 LEFT JOIN public.workspace_plan p ON p.workspace_id=requested_workspace
 WHERE requested_workspace::text=current_setting('snapform.workspace_id',true)
  AND EXISTS(SELECT 1 FROM public.membership m WHERE m.workspace_id=requested_workspace
   AND m.user_id=current_setting('snapform.user_id',true))
$$;
--> statement-breakpoint
-- Records a subscription the API just created with Razorpay for this workspace's owner.
CREATE FUNCTION public.record_billing_subscription(requested_workspace uuid,requested_subscription text,
 requested_interval text,requested_currency text)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF requested_workspace::text IS DISTINCT FROM current_setting('snapform.workspace_id',true)
  OR NOT EXISTS(SELECT 1 FROM public.membership m WHERE m.workspace_id=requested_workspace
   AND m.user_id=current_setting('snapform.user_id',true) AND m.role='owner') THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
 PERFORM 1 FROM public.workspace w WHERE w.id=requested_workspace FOR UPDATE;
 IF EXISTS(SELECT 1 FROM public.workspace_plan p WHERE p.workspace_id=requested_workspace AND p.status='active'
  AND NOT p.cancel_at_period_end AND p.current_period_end>now()) THEN RAISE EXCEPTION 'BILLING_ALREADY_ACTIVE'; END IF;
 INSERT INTO public.workspace_plan(workspace_id,status,billing_interval,currency,razorpay_subscription_id)
 VALUES(requested_workspace,'created',requested_interval,requested_currency,requested_subscription)
 ON CONFLICT(workspace_id) DO UPDATE SET status='created',billing_interval=excluded.billing_interval,
  currency=excluded.currency,razorpay_subscription_id=excluded.razorpay_subscription_id,
  cancel_at_period_end=false,updated_at=now();
 RETURN true;
END $$;
--> statement-breakpoint
-- Records that Razorpay accepted cancel_at_cycle_end. Pro stays until the paid period ends.
CREATE FUNCTION public.mark_billing_cancellation(requested_workspace uuid,requested_subscription text)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF requested_workspace::text IS DISTINCT FROM current_setting('snapform.workspace_id',true)
  OR NOT EXISTS(SELECT 1 FROM public.membership m WHERE m.workspace_id=requested_workspace
   AND m.user_id=current_setting('snapform.user_id',true) AND m.role='owner') THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
 UPDATE public.workspace_plan p SET cancel_at_period_end=true,updated_at=now()
 WHERE p.workspace_id=requested_workspace AND p.razorpay_subscription_id=requested_subscription AND p.status='active';
 RETURN FOUND;
END $$;
--> statement-breakpoint
-- The API calls this only after verifying X-Razorpay-Signature over the raw body.
-- Event IDs dedupe retries. Events can arrive out of order, so paid periods only
-- grow and status follows the newest event. Nothing here deletes or unpublishes data.
CREATE FUNCTION public.apply_billing_event(requested_event text,requested_type text,requested_created timestamptz,
 requested_workspace uuid,requested_subscription text,requested_customer text,requested_interval text,
 requested_currency text,requested_start timestamptz,requested_end timestamptz)
RETURNS text LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE newer boolean;
BEGIN
 INSERT INTO public.billing_event(id,type,subscription_id,outcome)
 VALUES(requested_event,requested_type,requested_subscription,'ignored') ON CONFLICT(id) DO NOTHING;
 IF NOT FOUND THEN RETURN 'duplicate'; END IF;
 IF requested_type NOT IN ('subscription.activated','subscription.charged','subscription.halted',
  'subscription.cancelled','subscription.completed') OR requested_created IS NULL OR requested_subscription IS NULL
 THEN RETURN 'ignored'; END IF;
 PERFORM 1 FROM public.workspace w WHERE w.id=requested_workspace FOR UPDATE;
 IF NOT FOUND THEN RETURN 'ignored'; END IF;
 SELECT p.last_event_at IS NULL OR p.last_event_at<=requested_created INTO newer
 FROM public.workspace_plan p WHERE p.workspace_id=requested_workspace;
 newer:=coalesce(newer,true);
 IF requested_type IN ('subscription.activated','subscription.charged') THEN
  -- Only Snapform's configured Pro plans grant Pro; the API passes NULL for any other plan.
  IF requested_start IS NULL OR requested_end IS NULL OR requested_end<=requested_start
   OR requested_interval IS NULL OR requested_currency IS NULL THEN RETURN 'ignored'; END IF;
  INSERT INTO public.workspace_plan(workspace_id) VALUES(requested_workspace) ON CONFLICT DO NOTHING;
  UPDATE public.workspace_plan p SET plan='pro',
   current_period_start=CASE WHEN p.current_period_end IS NULL OR requested_end>p.current_period_end
    THEN requested_start ELSE p.current_period_start END,
   current_period_end=greatest(p.current_period_end,requested_end),
   status=CASE WHEN newer THEN 'active' ELSE p.status END,
   cancel_at_period_end=CASE WHEN newer AND p.razorpay_subscription_id IS DISTINCT FROM requested_subscription
    THEN false ELSE p.cancel_at_period_end END,
   billing_interval=CASE WHEN newer THEN requested_interval ELSE p.billing_interval END,
   currency=CASE WHEN newer THEN requested_currency ELSE p.currency END,
   razorpay_subscription_id=CASE WHEN newer THEN requested_subscription ELSE p.razorpay_subscription_id END,
   razorpay_customer_id=CASE WHEN newer THEN coalesce(requested_customer,p.razorpay_customer_id)
    ELSE p.razorpay_customer_id END,
   last_event_at=greatest(p.last_event_at,requested_created),updated_at=now()
  WHERE p.workspace_id=requested_workspace;
 ELSE
  UPDATE public.workspace_plan p SET status=CASE requested_type WHEN 'subscription.halted' THEN 'halted'
    WHEN 'subscription.cancelled' THEN 'cancelled' ELSE 'completed' END,
   last_event_at=requested_created,updated_at=now()
  WHERE p.workspace_id=requested_workspace AND p.razorpay_subscription_id=requested_subscription AND newer;
  IF NOT FOUND THEN RETURN 'ignored'; END IF;
 END IF;
 UPDATE public.billing_event e SET outcome='applied' WHERE e.id=requested_event;
 RETURN 'applied';
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.workspace_plan_limits(uuid),public.usage_period_start(),public.enforce_live_form_limit(),
 public.workspace_billing(uuid),public.record_billing_subscription(uuid,text,text,text),
 public.mark_billing_cancellation(uuid,text),
 public.apply_billing_event(text,text,timestamptz,uuid,text,text,text,text,timestamptz,timestamptz)
 FROM PUBLIC,snapform_runtime,snapform_jobs;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.workspace_billing(uuid),public.record_billing_subscription(uuid,text,text,text),
 public.mark_billing_cancellation(uuid,text),
 public.apply_billing_event(text,text,timestamptz,uuid,text,text,text,text,timestamptz,timestamptz)
 TO snapform_runtime;
