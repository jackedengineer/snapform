REVOKE ALL ON TABLE public.form_version, public.form_publication FROM PUBLIC;
--> statement-breakpoint
GRANT SELECT, INSERT ON TABLE public.form_version TO snapform_runtime;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON TABLE public.form_publication TO snapform_runtime;
