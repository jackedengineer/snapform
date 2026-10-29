SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
CREATE FUNCTION public.seed_response_webhook()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE target_configuration uuid;
BEGIN
 SELECT s.configuration_id INTO target_configuration
 FROM public.form_webhook_settings s
 JOIN public.webhook_configuration c ON c.workspace_id=s.workspace_id AND c.form_id=s.form_id AND c.id=s.configuration_id
 WHERE s.workspace_id=NEW.workspace_id AND s.form_id=NEW.form_id AND s.enabled AND c.verified_at IS NOT NULL
 FOR SHARE OF s;
 IF NOT FOUND THEN RETURN NEW; END IF;
 INSERT INTO public.webhook_delivery(workspace_id,form_id,configuration_id,version_id,event_id,session_id,kind,status,created_at)
 VALUES(NEW.workspace_id,NEW.form_id,target_configuration,NEW.version_id,NEW.id,NEW.session_id,'response.submitted','pending',NEW.created_at)
 ON CONFLICT(event_id) DO NOTHING;
 RETURN NEW;
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.seed_response_webhook() FROM PUBLIC;
--> statement-breakpoint
CREATE TRIGGER response_webhook_delivery AFTER INSERT ON public.response_outbox
FOR EACH ROW WHEN(NEW.kind='response.submitted') EXECUTE FUNCTION public.seed_response_webhook();
--> statement-breakpoint
CREATE FUNCTION public.cancel_form_webhooks()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 UPDATE public.webhook_delivery SET status='cancelled',
  reason=CASE WHEN OLD.configuration_id IS DISTINCT FROM NEW.configuration_id THEN 'configuration-changed' ELSE 'disabled' END,
  lease_token=NULL,lease_until=NULL,updated_at=now()
 WHERE workspace_id=NEW.workspace_id AND form_id=NEW.form_id AND configuration_id=OLD.configuration_id
  AND status IN('preview','pending','sending','unknown','needs_action');
 RETURN NEW;
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.cancel_form_webhooks() FROM PUBLIC;
--> statement-breakpoint
CREATE TRIGGER form_webhook_stop AFTER UPDATE OF enabled,configuration_id ON public.form_webhook_settings
FOR EACH ROW WHEN(OLD.configuration_id IS DISTINCT FROM NEW.configuration_id OR (OLD.enabled AND NOT NEW.enabled))
EXECUTE FUNCTION public.cancel_form_webhooks();
