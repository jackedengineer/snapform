DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'snapform_runtime') THEN
    CREATE ROLE snapform_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  END IF;
END $$;
--> statement-breakpoint
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
--> statement-breakpoint
GRANT CONNECT ON DATABASE snapform TO snapform_runtime;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO snapform_runtime;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."user", public."session", public.account, public.verification TO snapform_runtime;
