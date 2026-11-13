import { useRef, useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Role } from '@snapform/contracts/workspace';
import { useAccountUser } from '../auth/AccountLayout';
import {
  changeRole,
  createInvite,
  expiryLabel,
  fetchInvites,
  fetchTeam,
  memberControls,
  removeMember,
  revokeInvite,
  roleHelp,
  seatNotice,
  TeamRequestError,
} from './api';
import { billingQueryKey, fetchBilling } from '../billing/api';
import './team.css';

const names: Record<Role, string> = {
  owner: 'Owner',
  editor: 'Editor',
  viewer: 'Viewer',
};
type Ask = {
  title: string;
  body: string;
  action: string;
  run: () => Promise<unknown>;
  leaving?: boolean;
};
type Ready = Awaited<ReturnType<typeof createInvite>>;
export function TeamPage({ workspaceId }: { workspaceId: string }) {
  const user = useAccountUser(),
    cache = useQueryClient(),
    navigate = useNavigate();
  const key = ['team', user.id, workspaceId];
  const team = useQuery({
    queryKey: key,
    queryFn: () => fetchTeam(workspaceId),
  });
  const owner = team.data?.role === 'owner';
  const invites = useQuery({
    queryKey: [...key, 'invites'],
    queryFn: () => fetchInvites(workspaceId),
    enabled: owner,
  });
  const refresh = () => cache.invalidateQueries({ queryKey: key });
  const dialog = useRef<HTMLDialogElement>(null),
    heading = useRef<HTMLHeadingElement>(null);
  const [asking, setAsking] = useState<Ask | null>(null);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'editor' | 'viewer'>('editor');
  // The one-time link lives only in this state and is never shown again.
  const [ready, setReady] = useState<Ready | null>(null);
  const [copied, setCopied] = useState('');
  const change = useMutation({
    mutationFn: (ask: Ask) => ask.run(),
    onSuccess: (_, ask) => (ask.leaving ? navigate({ to: '/app' }) : refresh()),
    onError: () => void refresh(),
  });
  const invite = useMutation({
    mutationFn: () => createInvite(workspaceId, email, role),
    gcTime: 0,
    onSuccess: (created) => {
      invite.reset();
      setEmail('');
      setCopied('');
      setReady(created);
      void refresh();
      requestAnimationFrame(() => heading.current?.focus());
    },
  });
  const full =
    invite.error instanceof TeamRequestError &&
    invite.error.code === 'SEAT_LIMIT_REACHED';
  // The plan is read only to explain a refused invite; the API enforces it.
  const billing = useQuery({
    queryKey: billingQueryKey(user.id, workspaceId),
    queryFn: ({ signal }) => fetchBilling(workspaceId, signal),
    enabled: full,
  });
  const seats = full ? seatNotice(billing.data) : null;
  function ask(next: Ask) {
    change.reset();
    setAsking(next);
    dialog.current?.showModal();
  }
  if (team.isPending)
    return (
      <div className="workspace-home">
        <p role="status">Loading your team…</p>
      </div>
    );
  if (team.isError)
    return (
      <div className="workspace-home">
        <p role="alert">{team.error.message}</p>
        <button className="text-button" onClick={() => void team.refetch()}>
          Try again
        </button>
      </div>
    );
  const owners = team.data.members.filter((m) => m.role === 'owner').length;
  return (
    <div className="workspace-home team-page">
      <Link
        className="back-link"
        to="/workspaces/$workspaceId"
        params={{ workspaceId }}
      >
        ← Back to forms
      </Link>
      <h1>Team</h1>
      {!owner && <p className="intro-copy">Only owners can change the team.</p>}
      {owner && (
        <section className="team-panel" aria-labelledby="invite-title">
          <h2 id="invite-title">Invite someone</h2>
          {ready && (
            <div className="invite-ready">
              <h3 ref={heading} tabIndex={-1}>
                Invite ready for {ready.email}
              </h3>
              <p>
                {ready.emailSent ? 'We emailed them. ' : 'Share this link. '}
                It works once, for that address, for 7 days. It won’t be shown
                again.
              </p>
              <label htmlFor="invite-link">Invite link</label>
              <input
                id="invite-link"
                readOnly
                value={ready.url}
                onFocus={(event) => event.currentTarget.select()}
              />
              <div className="team-actions">
                <button
                  type="button"
                  className="button primary compact-button"
                  onClick={() =>
                    navigator.clipboard.writeText(ready.url).then(
                      () => setCopied('Link copied.'),
                      () => setCopied('Select the link above and copy it.'),
                    )
                  }
                >
                  Copy link
                </button>
              </div>
              <p role="status" className="team-note">
                {copied}
              </p>
            </div>
          )}
          <form
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              if (!invite.isPending) invite.mutate();
            }}
          >
            <fieldset disabled={invite.isPending}>
              <div className="field">
                <label htmlFor="invite-email">Email address</label>
                <input
                  id="invite-email"
                  type="email"
                  autoComplete="off"
                  spellCheck={false}
                  maxLength={254}
                  required
                  value={email}
                  aria-invalid={invite.isError}
                  aria-describedby={invite.isError ? 'invite-error' : undefined}
                  onChange={(event) => {
                    setEmail(event.target.value);
                    invite.reset();
                  }}
                />
              </div>
              <fieldset className="invite-roles">
                <legend>Role</legend>
                {(['editor', 'viewer'] as const).map((value) => (
                  <label key={value} className="invite-role">
                    <input
                      type="radio"
                      name="invite-role"
                      checked={role === value}
                      onChange={() => setRole(value)}
                    />
                    <span>
                      <strong>{names[value]}</strong>
                      <span>{roleHelp[value]}</span>
                    </span>
                  </label>
                ))}
              </fieldset>
              <button type="submit" className="button primary compact-button">
                {invite.isPending ? 'Sending invite…' : 'Send invite'}
              </button>
            </fieldset>
            {invite.isError && (
              <p id="invite-error" role="alert" className="request-error">
                {seats ? (
                  <>
                    {seats.text}{' '}
                    {seats.upgrade && (
                      <Link
                        to="/workspaces/$workspaceId/billing"
                        params={{ workspaceId }}
                      >
                        Upgrade to invite more.
                      </Link>
                    )}
                  </>
                ) : (
                  invite.error.message
                )}
              </p>
            )}
          </form>
        </section>
      )}
      {change.isError && (
        <p role="alert" className="request-error">
          {change.error.message}
        </p>
      )}
      <section className="team-panel" aria-labelledby="members-title">
        <h2 id="members-title">Members</h2>
        <table className="team-table">
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Role</th>
              {owner && (
                <th scope="col">
                  <span className="visually-hidden">Actions</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {team.data.members.map((member) => {
              const you = member.userId === user.id,
                name = member.name.trim() || member.email,
                controls = memberControls(team.data.role, member, owners);
              return (
                <tr key={member.userId}>
                  <td>
                    <span className="member-name">
                      {name}
                      {you && ' (you)'}
                    </span>
                    <span className="team-note">{member.email}</span>
                  </td>
                  <td>
                    {controls.manage && !controls.lastOwner ? (
                      <select
                        aria-label={`Role for ${name}`}
                        value={member.role}
                        disabled={change.isPending}
                        onChange={(event) => {
                          const next = event.target.value as Role;
                          ask({
                            title: `Make ${you ? 'yourself' : name} ${next === 'viewer' ? 'a' : 'an'} ${next}?`,
                            body:
                              roleHelp[next] +
                              (you && next !== 'owner'
                                ? ' You can’t manage the team after this.'
                                : ''),
                            action: 'Change role',
                            run: () =>
                              changeRole(workspaceId, member.userId, next),
                          });
                        }}
                      >
                        {(['owner', 'editor', 'viewer'] as const).map((r) => (
                          <option key={r} value={r}>
                            {names[r]}
                          </option>
                        ))}
                      </select>
                    ) : (
                      names[member.role]
                    )}
                    {controls.lastOwner && (
                      <span className="team-note">The only owner</span>
                    )}
                  </td>
                  {owner && (
                    <td>
                      {!controls.lastOwner && (
                        <button
                          type="button"
                          className="text-button danger-text"
                          disabled={change.isPending}
                          aria-label={you ? undefined : `Remove ${name}`}
                          onClick={() =>
                            ask({
                              title: you
                                ? 'Leave this workspace?'
                                : `Remove ${name}?`,
                              body: 'Access to this workspace ends straight away.',
                              action: you ? 'Leave' : 'Remove',
                              run: () =>
                                removeMember(workspaceId, member.userId),
                              leaving: you,
                            })
                          }
                        >
                          {you ? 'Leave' : 'Remove'}
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
      {owner && (
        <section className="team-panel" aria-labelledby="invites-title">
          <h2 id="invites-title">Pending invites</h2>
          {invites.isError ? (
            <p role="alert">{invites.error.message}</p>
          ) : !invites.data ? (
            <p role="status">Loading invites…</p>
          ) : invites.data.length === 0 ? (
            <p className="team-note">No invites are waiting.</p>
          ) : (
            <ul className="invite-list">
              {invites.data.map((invitation) => (
                <li key={invitation.id}>
                  <span>
                    <span className="member-name">{invitation.email}</span>
                    <span className="team-note">
                      {names[invitation.role]} ·{' '}
                      {expiryLabel(invitation.expiresAt)}
                    </span>
                  </span>
                  <button
                    type="button"
                    className="text-button danger-text"
                    disabled={change.isPending}
                    aria-label={`Revoke the invite for ${invitation.email}`}
                    onClick={() =>
                      ask({
                        title: `Revoke the invite for ${invitation.email}?`,
                        body: 'The link stops working straight away.',
                        action: 'Revoke invite',
                        run: () => revokeInvite(workspaceId, invitation.id),
                      })
                    }
                  >
                    Revoke
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
      <dialog
        ref={dialog}
        className="settings-dialog"
        aria-labelledby="team-confirm"
        onClose={() => setAsking(null)}
      >
        <h2 id="team-confirm">{asking?.title}</h2>
        <p>{asking?.body}</p>
        <div className="settings-actions">
          <button
            type="button"
            className="text-button"
            onClick={() => dialog.current?.close()}
          >
            Cancel
          </button>
          <button
            type="button"
            className="button primary compact-button"
            onClick={() => {
              if (asking) change.mutate(asking);
              dialog.current?.close();
            }}
          >
            {asking?.action}
          </button>
        </div>
      </dialog>
    </div>
  );
}
