ALTER TABLE "workspace_plan" DROP CONSTRAINT "workspace_plan_status";--> statement-breakpoint
ALTER TABLE "workspace_plan" ADD CONSTRAINT "workspace_plan_status" CHECK ("workspace_plan"."status" in ('none','created','active','pending','halted','cancelled','completed'));--> statement-breakpoint
-- 0047: a renewal whose charge failed stays Pro while Razorpay retries it
-- (subscription.pending), for at most 30 days past the paid period, and halted
-- ends Pro at once. Active, cancelled and completed keep the period already paid
-- for, as in 0041. Replacing these functions keeps their owner and grants.
CREATE OR REPLACE FUNCTION public.workspace_plan_limits(requested_workspace uuid)
RETURNS TABLE(plan text,live_forms integer,monthly_responses integer,seats integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT e.plan,CASE e.plan WHEN 'pro' THEN NULL ELSE 3 END,CASE e.plan WHEN 'pro' THEN 2000 ELSE 100 END,
  CASE e.plan WHEN 'pro' THEN 3 ELSE 1 END
 FROM (SELECT CASE WHEN EXISTS(SELECT 1 FROM public.workspace_plan p WHERE p.workspace_id=requested_workspace
  AND p.plan='pro' AND p.status<>'halted' AND (p.current_period_end>now()
   OR (p.status='pending' AND p.current_period_end>now()-interval '30 days'))) THEN 'pro' ELSE 'free' END AS plan) e
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.record_billing_subscription(requested_workspace uuid,requested_subscription text,
 requested_interval text,requested_currency text)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF requested_workspace::text IS DISTINCT FROM current_setting('snapform.workspace_id',true)
  OR NOT EXISTS(SELECT 1 FROM public.membership m WHERE m.workspace_id=requested_workspace
   AND m.user_id=current_setting('snapform.user_id',true) AND m.role='owner') THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
 PERFORM 1 FROM public.workspace w WHERE w.id=requested_workspace FOR UPDATE;
 -- A second subscription during retries would charge twice once a retry succeeds.
 IF EXISTS(SELECT 1 FROM public.workspace_plan p WHERE p.workspace_id=requested_workspace AND p.status='pending')
 THEN RAISE EXCEPTION 'BILLING_PAYMENT_PENDING'; END IF;
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
CREATE OR REPLACE FUNCTION public.apply_billing_event(requested_event text,requested_type text,requested_created timestamptz,
 requested_workspace uuid,requested_subscription text,requested_customer text,requested_interval text,
 requested_currency text,requested_start timestamptz,requested_end timestamptz)
RETURNS text LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE newer boolean;
BEGIN
 INSERT INTO public.billing_event(id,type,subscription_id,outcome)
 VALUES(requested_event,requested_type,requested_subscription,'ignored') ON CONFLICT(id) DO NOTHING;
 IF NOT FOUND THEN RETURN 'duplicate'; END IF;
 IF requested_type NOT IN ('subscription.activated','subscription.charged','subscription.pending',
  'subscription.halted','subscription.cancelled','subscription.completed') OR requested_created IS NULL OR requested_subscription IS NULL
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
  UPDATE public.workspace_plan p SET status=CASE requested_type WHEN 'subscription.pending' THEN 'pending'
    WHEN 'subscription.halted' THEN 'halted'
    WHEN 'subscription.cancelled' THEN 'cancelled' ELSE 'completed' END,
   last_event_at=requested_created,updated_at=now()
  WHERE p.workspace_id=requested_workspace AND p.razorpay_subscription_id=requested_subscription AND newer;
  IF NOT FOUND THEN RETURN 'ignored'; END IF;
 END IF;
 UPDATE public.billing_event e SET outcome='applied' WHERE e.id=requested_event;
 RETURN 'applied';
END $$;
