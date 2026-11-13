// Pending until migration 0042 is applied to the shared database.
import { expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { openDatabase } from '../src/client.ts';
import type { Transaction } from '../src/client.ts';
import { user } from '../src/schema.ts';
import { membership } from '../src/workspace-schema.ts';
import { createWorkspace, inWorkspace } from '../src/workspaces.ts';
import { scheduleDeletion } from '../src/deletion.ts';
import { applyBillingEvent } from '../src/billing.ts';
import {
  acceptInvitation,
  changeMemberRole,
  createInvitation,
  listInvitations,
  listTeam,
  noSeatLimit,
  planSeatLimit,
  removeMember,
  revokeInvitation,
} from '../src/team.ts';

const configured = process.env.DATABASE_URL;
if (!configured) throw new Error('Runtime database configuration is required.');
const connection = configured;
type People = Record<
  'owner' | 'editor' | 'viewer' | 'outsider' | 'invitee' | 'unverified',
  string
>;
const hash = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
const email = (id: string) => `${id}@example.invalid`;
async function fixture(
  run: (tx: Transaction, people: People, workspaceId: string) => Promise<void>,
) {
  const { db, close } = await openDatabase(connection);
  const rollback = new Error('Rollback team fixtures');
  try {
    await expect(
      db.transaction(async (tx) => {
        const people = Object.fromEntries(
          [
            'owner',
            'editor',
            'viewer',
            'outsider',
            'invitee',
            'unverified',
          ].map((name) => [name, crypto.randomUUID()]),
        ) as People;
        await tx.insert(user).values(
          Object.entries(people).map(([name, id]) => ({
            id,
            name: 'Team QA',
            // Account addresses keep their casing; invitations match without it.
            email: name === 'invitee' ? `${id}@Example.INVALID` : email(id),
            emailVerified: name !== 'unverified',
          })),
        );
        const workspaceId = crypto.randomUUID();
        await createWorkspace(tx, people.owner, {
          id: workspaceId,
          name: 'Team QA',
          segment: 'agency',
        });
        await tx.insert(membership).values([
          { workspaceId, userId: people.editor, role: 'editor' },
          { workspaceId, userId: people.viewer, role: 'viewer' },
        ]);
        await run(tx, people, workspaceId);
        throw rollback;
      }),
    ).rejects.toBe(rollback);
  } finally {
    await close();
  }
}
const denied = (tx: Transaction, query: ReturnType<typeof sql>) =>
  expect(
    tx.transaction(async (savepoint) => savepoint.execute(query)),
  ).rejects.toMatchObject({ cause: { code: '42501' } });

it('lets only owners invite, list and revoke, and keeps the table private', () =>
  fixture(async (tx, people, workspaceId) => {
    const first = hash();
    const { invitation, workspaceName } = await createInvitation(
      tx,
      people.owner,
      workspaceId,
      { email: email(people.invitee).toUpperCase(), role: 'viewer' },
      first,
      noSeatLimit,
    );
    expect(workspaceName).toBe('Team QA');
    expect(invitation).toMatchObject({
      email: email(people.invitee).toLowerCase(),
      role: 'viewer',
    });
    expect(
      Date.parse(invitation.expiresAt) - Date.parse(invitation.createdAt),
    ).toBe(7 * 24 * 3600 * 1000);
    expect(await listInvitations(tx, people.owner, workspaceId)).toEqual({
      invitations: [invitation],
    });
    for (const actor of [people.editor, people.viewer]) {
      await expect(
        createInvitation(
          tx,
          actor,
          workspaceId,
          { email: email(people.outsider), role: 'viewer' },
          hash(),
          noSeatLimit,
        ),
      ).rejects.toThrow('FORBIDDEN');
      await expect(listInvitations(tx, actor, workspaceId)).rejects.toThrow(
        'FORBIDDEN',
      );
      await expect(
        revokeInvitation(tx, actor, workspaceId, invitation.id),
      ).rejects.toThrow('FORBIDDEN');
    }
    await expect(
      listInvitations(tx, people.outsider, workspaceId),
    ).rejects.toThrow('WORKSPACE_NOT_FOUND');
    await expect(
      createInvitation(
        tx,
        people.owner,
        workspaceId,
        { email: email(people.editor), role: 'viewer' },
        hash(),
        noSeatLimit,
      ),
    ).rejects.toThrow('ALREADY_MEMBER');
    // Inviting the same address again replaces the earlier link.
    const second = await createInvitation(
      tx,
      people.owner,
      workspaceId,
      { email: email(people.invitee), role: 'editor' },
      hash(),
      noSeatLimit,
    );
    expect(
      (await listInvitations(tx, people.owner, workspaceId)).invitations,
    ).toEqual([second.invitation]);
    await expect(acceptInvitation(tx, people.invitee, first)).rejects.toThrow(
      'INVITATION_REVOKED',
    );
    await revokeInvitation(tx, people.owner, workspaceId, second.invitation.id);
    await revokeInvitation(tx, people.owner, workspaceId, second.invitation.id);
    expect(await listInvitations(tx, people.owner, workspaceId)).toEqual({
      invitations: [],
    });
    await expect(
      revokeInvitation(tx, people.owner, workspaceId, crypto.randomUUID()),
    ).rejects.toThrow('INVITATION_NOT_FOUND');
    await denied(tx, sql`select * from public.workspace_invitation`);
    expect(
      (
        await tx.execute(
          sql`select has_table_privilege('snapform_runtime','public.workspace_invitation','SELECT') as runtime_read,has_function_privilege('snapform_runtime','public.lock_workspace_owner(uuid)','EXECUTE') as runtime_lock,has_function_privilege('snapform_jobs','public.accept_workspace_invitation(text)','EXECUTE') as jobs_accept,has_table_privilege('snapform_runtime','public.membership','UPDATE') as runtime_update,has_table_privilege('snapform_runtime','public.membership','DELETE') as runtime_delete`,
        )
      ).rows,
    ).toEqual([
      {
        runtime_read: false,
        runtime_lock: false,
        jobs_accept: false,
        runtime_update: false,
        runtime_delete: false,
      },
    ]);
  }));

it('counts members and live invitations against a seat limit', () =>
  fixture(async (tx, people, workspaceId) => {
    const invite = (address: string, limit: number | null) =>
      createInvitation(
        tx,
        people.owner,
        workspaceId,
        { email: address, role: 'viewer' },
        hash(),
        async (_tx, id) => (id === workspaceId ? limit : 0),
      );
    await expect(invite(email(people.invitee), 3)).rejects.toThrow(
      'SEAT_LIMIT_REACHED',
    );
    await invite(email(people.invitee), 4);
    await expect(invite(email(people.outsider), 4)).rejects.toThrow(
      'SEAT_LIMIT_REACHED',
    );
    // Replacing a pending link for the same address does not take a new seat.
    await invite(email(people.invitee), 4);
    await invite(email(people.outsider), null);
  }));

it('gives Free one seat and Pro three, counting members and live invitations', () =>
  fixture(async (tx, people, workspaceId) => {
    const invite = (address: string) =>
      createInvitation(
        tx,
        people.owner,
        workspaceId,
        { email: address, role: 'viewer' },
        hash(),
        planSeatLimit,
      );
    await removeMember(tx, people.owner, workspaceId, people.editor);
    await removeMember(tx, people.owner, workspaceId, people.viewer);
    // Free: the owner already uses the only seat.
    await expect(invite(email(people.invitee))).rejects.toThrow(
      'SEAT_LIMIT_REACHED',
    );
    expect(
      await applyBillingEvent(tx, {
        id: 'evt_' + crypto.randomUUID().replaceAll('-', ''),
        type: 'subscription.activated',
        createdAt: new Date(Date.now() - 60000),
        workspaceId,
        subscriptionId:
          'sub_QA' + crypto.randomUUID().replaceAll('-', '').slice(0, 12),
        customerId: 'cust_QA0000000001',
        interval: 'monthly',
        currency: 'INR',
        periodStart: new Date(Date.now() - 86400000),
        periodEnd: new Date(Date.now() + 29 * 86400000),
      }),
    ).toBe('applied');
    await invite(email(people.invitee));
    await invite(email(people.outsider));
    // Owner plus two pending invites fill Pro's three seats.
    await expect(invite(email(people.unverified))).rejects.toThrow(
      'SEAT_LIMIT_REACHED',
    );
    // Revoking an invite frees its seat.
    const [pending] = (await listInvitations(tx, people.owner, workspaceId))
      .invitations;
    await revokeInvitation(tx, people.owner, workspaceId, pending.id);
    await invite(email(people.unverified));
    // The lookup reads only the scoped workspace's plan.
    await expect(planSeatLimit(tx, crypto.randomUUID())).rejects.toThrow(
      'INVALID_SEAT_LIMIT',
    );
  }));

it('binds acceptance to the verified invited address and spends the link once', () =>
  fixture(async (tx, people, workspaceId) => {
    const token = hash(),
      unverified = hash();
    const accepted = await createInvitation(
      tx,
      people.owner,
      workspaceId,
      { email: email(people.invitee), role: 'viewer' },
      token,
      noSeatLimit,
    );
    await createInvitation(
      tx,
      people.owner,
      workspaceId,
      { email: email(people.unverified), role: 'editor' },
      unverified,
      noSeatLimit,
    );
    await expect(acceptInvitation(tx, people.invitee, hash())).rejects.toThrow(
      'INVITATION_NOT_FOUND',
    );
    // A forwarded link cannot join as another identity, even the owner.
    for (const actor of [people.outsider, people.owner])
      await expect(acceptInvitation(tx, actor, token)).rejects.toThrow(
        'INVITATION_EMAIL_MISMATCH',
      );
    await expect(
      acceptInvitation(tx, people.unverified, unverified),
    ).rejects.toThrow('EMAIL_NOT_VERIFIED');
    expect(await acceptInvitation(tx, people.invitee, token)).toEqual({
      id: workspaceId,
      name: 'Team QA',
      role: 'viewer',
    });
    await expect(acceptInvitation(tx, people.invitee, token)).rejects.toThrow(
      'INVITATION_USED',
    );
    await expect(
      revokeInvitation(tx, people.owner, workspaceId, accepted.invitation.id),
    ).rejects.toThrow('INVITATION_USED');
    expect(
      (await listInvitations(tx, people.owner, workspaceId)).invitations.map(
        (invitation) => invitation.email,
      ),
    ).toEqual([email(people.unverified)]);
    const team = await listTeam(tx, people.invitee, workspaceId);
    expect(team.role).toBe('viewer');
    expect(team.members.map((member) => member.role).sort()).toEqual([
      'editor',
      'owner',
      'viewer',
      'viewer',
    ]);
    // The invited viewer now meets the real role checks.
    await expect(
      inWorkspace(tx, people.invitee, workspaceId, 'forms.write', async () => {
        throw Error('VIEWER_WRITE_WAS_ALLOWED');
      }),
    ).rejects.toThrow('FORBIDDEN');
    await expect(listTeam(tx, people.outsider, workspaceId)).rejects.toThrow(
      'WORKSPACE_NOT_FOUND',
    );
  }));

it('changes roles and removes members without leaving the workspace ownerless', () =>
  fixture(async (tx, people, workspaceId) => {
    await expect(
      changeMemberRole(tx, people.owner, workspaceId, people.owner, {
        role: 'editor',
      }),
    ).rejects.toThrow('LAST_OWNER');
    await expect(
      removeMember(tx, people.owner, workspaceId, people.owner),
    ).rejects.toThrow('LAST_OWNER');
    for (const actor of [people.editor, people.viewer]) {
      await expect(
        changeMemberRole(tx, actor, workspaceId, people.viewer, {
          role: 'owner',
        }),
      ).rejects.toThrow('FORBIDDEN');
      await expect(
        removeMember(tx, actor, workspaceId, people.owner),
      ).rejects.toThrow('FORBIDDEN');
    }
    await expect(
      changeMemberRole(tx, people.owner, workspaceId, people.outsider, {
        role: 'viewer',
      }),
    ).rejects.toThrow('MEMBER_NOT_FOUND');
    expect(
      await changeMemberRole(tx, people.owner, workspaceId, people.editor, {
        role: 'owner',
      }),
    ).toEqual({ userId: people.editor, role: 'owner' });
    expect(
      await changeMemberRole(tx, people.owner, workspaceId, people.owner, {
        role: 'editor',
      }),
    ).toEqual({ userId: people.owner, role: 'editor' });
    await expect(
      removeMember(tx, people.owner, workspaceId, people.viewer),
    ).rejects.toThrow('FORBIDDEN');
    await removeMember(tx, people.editor, workspaceId, people.viewer);
    await expect(listTeam(tx, people.viewer, workspaceId)).rejects.toThrow(
      'WORKSPACE_NOT_FOUND',
    );
    await expect(
      removeMember(tx, people.editor, workspaceId, people.editor),
    ).rejects.toThrow('LAST_OWNER');
    // Direct writes cannot skip the last-owner check, even with owner context.
    await denied(
      tx,
      sql`update public.membership set role='viewer' where workspace_id=${workspaceId}::uuid`,
    );
    await denied(
      tx,
      sql`delete from public.membership where workspace_id=${workspaceId}::uuid`,
    );
  }));

it('freezes invitations and member changes while the workspace awaits deletion', () =>
  fixture(async (tx, people, workspaceId) => {
    const token = hash();
    await createInvitation(
      tx,
      people.owner,
      workspaceId,
      { email: email(people.invitee), role: 'viewer' },
      token,
      noSeatLimit,
    );
    await scheduleDeletion(
      tx,
      people.owner,
      workspaceId,
      { kind: 'workspace', targetId: workspaceId },
      {
        requestId: crypto.randomUUID(),
        confirmation: 'Team QA',
        acknowledgeDeletion: true,
      },
    );
    await expect(acceptInvitation(tx, people.invitee, token)).rejects.toThrow(
      'WORKSPACE_DELETION_PENDING',
    );
    await expect(
      createInvitation(
        tx,
        people.owner,
        workspaceId,
        { email: email(people.outsider), role: 'viewer' },
        hash(),
        noSeatLimit,
      ),
    ).rejects.toThrow('WORKSPACE_DELETION_PENDING');
    await expect(
      changeMemberRole(tx, people.owner, workspaceId, people.viewer, {
        role: 'editor',
      }),
    ).rejects.toThrow('WORKSPACE_DELETION_PENDING');
    expect(
      (await listTeam(tx, people.viewer, workspaceId)).members,
    ).toHaveLength(3);
  }));
