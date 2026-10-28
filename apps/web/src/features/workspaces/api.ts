import {
  createWorkspaceSchema,
  workspaceListSchema,
  workspaceCreatedSchema,
} from '@snapform/contracts/workspace';
import type { CreateWorkspace } from '@snapform/contracts/workspace';
const path = '/api/v1/workspaces';
export async function fetchWorkspaces(signal?: AbortSignal) {
  try {
    const response = await fetch(path, {
      credentials: 'same-origin',
      cache: 'no-store',
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(15000)])
        : AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error('Request failed');
    return workspaceListSchema.parse(await response.json()).workspaces;
  } catch {
    throw new Error('We couldn’t load your workspaces.');
  }
}
export async function createWorkspaceRequest(input: CreateWorkspace) {
  try {
    const response = await fetch(path, {
      method: 'POST',
      credentials: 'same-origin',
      redirect: 'error',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createWorkspaceSchema.parse(input)),
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) throw new Error('Request failed');
    return workspaceCreatedSchema.parse(await response.json()).workspace;
  } catch {
    throw new Error(
      'We couldn’t confirm your workspace. Your details are still here.',
    );
  }
}
