SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
CREATE TABLE "jobs_heartbeat" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"succeeded_at" timestamp with time zone NOT NULL,
	CONSTRAINT "jobs_heartbeat_singleton" CHECK ("jobs_heartbeat"."id"=1)
);
--> statement-breakpoint
ALTER TABLE "jobs_heartbeat" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.jobs_heartbeat FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON TABLE public.jobs_heartbeat FROM PUBLIC,snapform_runtime,snapform_jobs;
--> statement-breakpoint
CREATE FUNCTION public.record_jobs_success()
RETURNS boolean LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
 INSERT INTO public.jobs_heartbeat(id,succeeded_at) VALUES(1,clock_timestamp())
 ON CONFLICT(id) DO UPDATE SET succeeded_at=excluded.succeeded_at RETURNING true
$$;
--> statement-breakpoint
CREATE FUNCTION public.operational_readiness()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT EXISTS(SELECT 1 FROM public.jobs_heartbeat WHERE id=1
  AND succeeded_at>=now()-interval '5 minutes' AND succeeded_at<=now()+interval '1 minute')
 AND NOT EXISTS(SELECT 1 FROM public.response_outbox WHERE completed_at IS NULL
  AND created_at<now()-interval '10 minutes')
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.record_jobs_success(),public.operational_readiness() FROM PUBLIC,snapform_runtime,snapform_jobs;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.record_jobs_success() TO snapform_jobs;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.operational_readiness() TO snapform_runtime;
