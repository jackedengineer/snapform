import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import type { DeletionRequest } from '@snapform/contracts/deletion';
import { WorkspaceDeleted } from './WorkspaceDeleted';
const workspaceId = crypto.randomUUID();
const receipt: DeletionRequest = {
  id: crypto.randomUUID(),
  workspaceId,
  kind: 'workspace',
  targetId: workspaceId,
  requestedAt: '2026-10-31T12:00:00.000Z',
  notBefore: '2026-11-01T12:00:00.000Z',
  cancelledAt: null,
  deletedAt: '2026-11-01T12:01:00.000Z',
  state: 'deleted',
  revision: 2,
};
it('shows the minimal completed receipt without exposing a scheduling form', () => {
  const html = renderToStaticMarkup(
    createElement(WorkspaceDeleted, { receipt }),
  );
  expect(html).toContain('Workspace deleted.');
  expect(html).toContain(receipt.id);
  expect(html).toContain('dateTime="2026-11-01T12:01:00.000Z"');
  expect(html).not.toContain('<form');
});
it('never labels pending, cancelled or response requests as a deleted workspace', () => {
  for (const patch of [
    { state: 'scheduled' as const, deletedAt: null },
    { state: 'cancelled' as const, deletedAt: null },
    { kind: 'response' as const },
  ])
    expect(
      renderToStaticMarkup(
        createElement(WorkspaceDeleted, { receipt: { ...receipt, ...patch } }),
      ),
    ).toBe('');
});
