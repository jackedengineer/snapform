SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
ALTER TABLE "response_email_delivery" DROP CONSTRAINT "response_email_state";--> statement-breakpoint
ALTER TABLE "response_email_delivery" ADD CONSTRAINT "response_email_state" CHECK (("response_email_delivery"."status"='pending' and "response_email_delivery"."reason" is null) or ("response_email_delivery"."status"='cancelled' and "response_email_delivery"."reason" is not distinct from 'disabled') or ("response_email_delivery"."status"='needs_action' and "response_email_delivery"."reason" is not distinct from 'recipient-unavailable'));
