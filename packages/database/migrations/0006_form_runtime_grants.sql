REVOKE ALL ON TABLE public.form, public.form_draft, public.draft_operation FROM PUBLIC;
--> statement-breakpoint
GRANT SELECT, INSERT ON TABLE public.form TO snapform_runtime;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON TABLE public.form_draft TO snapform_runtime;
--> statement-breakpoint
GRANT SELECT, INSERT ON TABLE public.draft_operation TO snapform_runtime;
