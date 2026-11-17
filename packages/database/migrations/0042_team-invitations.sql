SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
CREATE TABLE "workspace_invitation" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"email" text NOT NULL,
	"role" "workspace_role" NOT NULL,
	"token_hash" text NOT NULL,
	"invited_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "workspace_invitation_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "workspace_invitation_email" CHECK ("workspace_invitation"."email"=lower("workspace_invitation"."email") and length("workspace_invitation"."email") between 3 and 254 and "workspace_invitation"."email" ~ '^[^[:space:]@]+@[^[:space:]@]+$'),
	CONSTRAINT "workspace_invitation_role" CHECK ("workspace_invitation"."role" in ('editor','viewer')),
	CONSTRAINT "workspace_invitation_hash" CHECK ("workspace_invitation"."token_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "workspace_invitation_expiry" CHECK ("workspace_invitation"."expires_at"="workspace_invitation"."created_at"+interval '7 days'),
	CONSTRAINT "workspace_invitation_outcome" CHECK ("workspace_invitation"."accepted_at" is null or "workspace_invitation"."revoked_at" is null)
);
--> statement-breakpoint
ALTER TABLE "workspace_invitation" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "workspace_invitation" ADD CONSTRAINT "workspace_invitation_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_invitation" ADD CONSTRAINT "workspace_invitation_invited_by_user_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_invitation_pending" ON "workspace_invitation" USING btree ("workspace_id","email") WHERE "workspace_invitation"."accepted_at" is null and "workspace_invitation"."revoked_at" is null;--> statement-breakpoint
CREATE INDEX "workspace_invitation_recent" ON "workspace_invitation" USING btree ("workspace_id","created_at");
--> statement-breakpoint
ALTER TABLE public.workspace_invitation FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
-- Invitations are reached only through the functions below; the runtime gets no table access.
REVOKE ALL ON TABLE public.workspace_invitation FROM PUBLIC,snapform_runtime,snapform_jobs;
--> statement-breakpoint
-- Role changes and removals must pass the last-owner check below, so the
-- runtime may no longer update or delete membership rows directly.
REVOKE UPDATE,DELETE ON TABLE public.membership FROM snapform_runtime;
--> statement-breakpoint
-- Authorize first, lock the tenant, then refresh the role that was waited on.
-- Role GUCs grant nothing: the caller's membership row is the authority.
CREATE FUNCTION public.lock_workspace_owner(requested_workspace uuid)
RETURNS text LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor text:=nullif(current_setting('snapform.user_id',true),''); actor_role text; workspace_name text;
BEGIN
 IF actor IS NULL OR requested_workspace IS NULL
  OR requested_workspace::text IS DISTINCT FROM current_setting('snapform.workspace_id',true) THEN RAISE EXCEPTION 'WORKSPACE_NOT_FOUND'; END IF;
 PERFORM 1 FROM public.membership m WHERE m.workspace_id=requested_workspace AND m.user_id=actor;
 IF NOT FOUND THEN RAISE EXCEPTION 'WORKSPACE_NOT_FOUND'; END IF;
 SELECT w.name INTO workspace_name FROM public.workspace w WHERE w.id=requested_workspace FOR UPDATE;
 SELECT m.role INTO actor_role FROM public.membership m WHERE m.workspace_id=requested_workspace AND m.user_id=actor;
 IF NOT FOUND THEN RAISE EXCEPTION 'WORKSPACE_NOT_FOUND'; END IF;
 IF actor_role<>'owner' THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
 IF public.pending_workspace_deletion(requested_workspace) THEN RAISE EXCEPTION 'WORKSPACE_DELETION_PENDING'; END IF;
 RETURN workspace_name;
END $$;
--> statement-breakpoint
-- A NULL seat limit means no limit; billing supplies the plan's seat count.
-- Members plus live pending invitations count as used seats.
CREATE FUNCTION public.create_workspace_invitation(requested_workspace uuid,requested_email text,requested_role text,requested_hash text,requested_seat_limit integer)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE workspace_name text; created public.workspace_invitation;
BEGIN
 workspace_name:=public.lock_workspace_owner(requested_workspace);
 IF requested_email IS NULL OR requested_email<>lower(btrim(requested_email)) OR length(requested_email) NOT BETWEEN 3 AND 254
  OR requested_email!~'^[^[:space:]@]+@[^[:space:]@]+$' OR requested_role IS NULL OR requested_role NOT IN('editor','viewer')
  OR requested_hash IS NULL OR requested_hash!~'^[0-9a-f]{64}$' OR requested_seat_limit<1
 THEN RAISE EXCEPTION 'INVALID_INVITATION'; END IF;
 IF EXISTS(SELECT 1 FROM public.membership m JOIN public."user" u ON u.id=m.user_id
  WHERE m.workspace_id=requested_workspace AND lower(u.email)=requested_email) THEN RAISE EXCEPTION 'ALREADY_MEMBER'; END IF;
 IF (SELECT count(*) FROM public.workspace_invitation i
  WHERE i.workspace_id=requested_workspace AND i.created_at>statement_timestamp()-interval '24 hours')>=25
 THEN RAISE EXCEPTION 'INVITATION_RATE_LIMITED'; END IF;
 -- Inviting an address again replaces its earlier link.
 UPDATE public.workspace_invitation i SET revoked_at=statement_timestamp()
  WHERE i.workspace_id=requested_workspace AND i.email=requested_email AND i.accepted_at IS NULL AND i.revoked_at IS NULL;
 IF requested_seat_limit IS NOT NULL AND
  (SELECT count(*) FROM public.membership m WHERE m.workspace_id=requested_workspace)
  +(SELECT count(*) FROM public.workspace_invitation i WHERE i.workspace_id=requested_workspace
   AND i.accepted_at IS NULL AND i.revoked_at IS NULL AND i.expires_at>statement_timestamp())>=requested_seat_limit
 THEN RAISE EXCEPTION 'SEAT_LIMIT_REACHED'; END IF;
 INSERT INTO public.workspace_invitation(id,workspace_id,email,role,token_hash,invited_by,created_at,expires_at)
  VALUES(gen_random_uuid(),requested_workspace,requested_email,requested_role::public.workspace_role,requested_hash,
   current_setting('snapform.user_id',true),statement_timestamp(),statement_timestamp()+interval '7 days')
  RETURNING * INTO created;
 RETURN jsonb_build_object('id',created.id,'email',created.email,'role',created.role,'createdAt',created.created_at,
  'expiresAt',created.expires_at,'workspaceName',workspace_name);
EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'INVITATION_CONFLICT';
END $$;
--> statement-breakpoint
-- Owners see unanswered invitations, including expired ones they may replace.
CREATE FUNCTION public.list_workspace_invitations(requested_workspace uuid)
RETURNS TABLE(invitation_id uuid,invited_email text,invited_role text,invited_at timestamptz,expires timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor text:=nullif(current_setting('snapform.user_id',true),''); actor_role text;
BEGIN
 IF actor IS NULL OR requested_workspace IS NULL
  OR requested_workspace::text IS DISTINCT FROM current_setting('snapform.workspace_id',true) THEN RAISE EXCEPTION 'WORKSPACE_NOT_FOUND'; END IF;
 SELECT m.role INTO actor_role FROM public.membership m WHERE m.workspace_id=requested_workspace AND m.user_id=actor;
 IF NOT FOUND THEN RAISE EXCEPTION 'WORKSPACE_NOT_FOUND'; END IF;
 IF actor_role<>'owner' THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
 RETURN QUERY SELECT i.id,i.email,i.role::text,i.created_at,i.expires_at FROM public.workspace_invitation i
  WHERE i.workspace_id=requested_workspace AND i.accepted_at IS NULL AND i.revoked_at IS NULL
  ORDER BY i.created_at DESC,i.id DESC LIMIT 200;
END $$;
--> statement-breakpoint
CREATE FUNCTION public.revoke_workspace_invitation(requested_workspace uuid,requested_invitation uuid)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE found_invitation public.workspace_invitation;
BEGIN
 PERFORM public.lock_workspace_owner(requested_workspace);
 SELECT * INTO found_invitation FROM public.workspace_invitation i
  WHERE i.id=requested_invitation AND i.workspace_id=requested_workspace FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'INVITATION_NOT_FOUND'; END IF;
 IF found_invitation.accepted_at IS NOT NULL THEN RAISE EXCEPTION 'INVITATION_USED'; END IF;
 UPDATE public.workspace_invitation i SET revoked_at=coalesce(i.revoked_at,statement_timestamp()) WHERE i.id=requested_invitation;
END $$;
--> statement-breakpoint
-- The accepting account must be verified and own the invited address. A
-- forwarded link therefore cannot join as another identity, and every link
-- works once, within seven days, unless revoked first.
CREATE FUNCTION public.accept_workspace_invitation(requested_hash text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor text:=nullif(current_setting('snapform.user_id',true),''); actor_email text; actor_verified boolean;
 found_invitation public.workspace_invitation; workspace_name text; member_role text;
BEGIN
 IF actor IS NULL OR requested_hash IS NULL OR requested_hash!~'^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'INVITATION_NOT_FOUND'; END IF;
 SELECT lower(u.email),u.email_verified INTO actor_email,actor_verified FROM public."user" u WHERE u.id=actor;
 IF NOT FOUND OR actor_verified IS NOT TRUE THEN RAISE EXCEPTION 'EMAIL_NOT_VERIFIED'; END IF;
 SELECT * INTO found_invitation FROM public.workspace_invitation i WHERE i.token_hash=requested_hash;
 IF NOT FOUND THEN RAISE EXCEPTION 'INVITATION_NOT_FOUND'; END IF;
 -- Same lock order as creation and revocation: workspace, then invitation.
 SELECT w.name INTO workspace_name FROM public.workspace w WHERE w.id=found_invitation.workspace_id FOR UPDATE;
 SELECT * INTO found_invitation FROM public.workspace_invitation i WHERE i.id=found_invitation.id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'INVITATION_NOT_FOUND'; END IF;
 IF found_invitation.email<>actor_email THEN RAISE EXCEPTION 'INVITATION_EMAIL_MISMATCH'; END IF;
 IF found_invitation.revoked_at IS NOT NULL THEN RAISE EXCEPTION 'INVITATION_REVOKED'; END IF;
 IF found_invitation.accepted_at IS NOT NULL THEN RAISE EXCEPTION 'INVITATION_USED'; END IF;
 IF found_invitation.expires_at<=statement_timestamp() THEN RAISE EXCEPTION 'INVITATION_EXPIRED'; END IF;
 IF public.pending_workspace_deletion(found_invitation.workspace_id) THEN RAISE EXCEPTION 'WORKSPACE_DELETION_PENDING'; END IF;
 SELECT m.role INTO member_role FROM public.membership m WHERE m.workspace_id=found_invitation.workspace_id AND m.user_id=actor;
 -- An existing member keeps their role; the link is still spent.
 IF NOT FOUND THEN
  INSERT INTO public.membership(workspace_id,user_id,role) VALUES(found_invitation.workspace_id,actor,found_invitation.role);
  member_role:=found_invitation.role::text;
 END IF;
 UPDATE public.workspace_invitation i SET accepted_at=statement_timestamp() WHERE i.id=found_invitation.id;
 RETURN jsonb_build_object('id',found_invitation.workspace_id,'name',workspace_name,'role',member_role);
END $$;
--> statement-breakpoint
-- The workspace lock serializes owner changes, so the owner count cannot race.
CREATE FUNCTION public.change_workspace_member_role(requested_workspace uuid,requested_user text,requested_role text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE target_role text;
BEGIN
 PERFORM public.lock_workspace_owner(requested_workspace);
 IF requested_role IS NULL OR requested_role NOT IN('owner','editor','viewer') THEN RAISE EXCEPTION 'INVALID_ROLE'; END IF;
 SELECT m.role INTO target_role FROM public.membership m
  WHERE m.workspace_id=requested_workspace AND m.user_id=requested_user FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'MEMBER_NOT_FOUND'; END IF;
 IF target_role='owner' AND requested_role<>'owner'
  AND (SELECT count(*) FROM public.membership m WHERE m.workspace_id=requested_workspace AND m.role='owner')<=1
 THEN RAISE EXCEPTION 'LAST_OWNER'; END IF;
 UPDATE public.membership m SET role=requested_role::public.workspace_role
  WHERE m.workspace_id=requested_workspace AND m.user_id=requested_user;
 RETURN jsonb_build_object('userId',requested_user,'role',requested_role);
END $$;
--> statement-breakpoint
CREATE FUNCTION public.remove_workspace_member(requested_workspace uuid,requested_user text)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE target_role text;
BEGIN
 PERFORM public.lock_workspace_owner(requested_workspace);
 SELECT m.role INTO target_role FROM public.membership m
  WHERE m.workspace_id=requested_workspace AND m.user_id=requested_user FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'MEMBER_NOT_FOUND'; END IF;
 IF target_role='owner'
  AND (SELECT count(*) FROM public.membership m WHERE m.workspace_id=requested_workspace AND m.role='owner')<=1
 THEN RAISE EXCEPTION 'LAST_OWNER'; END IF;
 DELETE FROM public.membership m WHERE m.workspace_id=requested_workspace AND m.user_id=requested_user;
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.lock_workspace_owner(uuid),public.create_workspace_invitation(uuid,text,text,text,integer),
 public.list_workspace_invitations(uuid),public.revoke_workspace_invitation(uuid,uuid),public.accept_workspace_invitation(text),
 public.change_workspace_member_role(uuid,text,text),public.remove_workspace_member(uuid,text) FROM PUBLIC,snapform_runtime,snapform_jobs;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.create_workspace_invitation(uuid,text,text,text,integer),public.list_workspace_invitations(uuid),
 public.revoke_workspace_invitation(uuid,uuid),public.accept_workspace_invitation(text),
 public.change_workspace_member_role(uuid,text,text),public.remove_workspace_member(uuid,text) TO snapform_runtime;
