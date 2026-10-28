import {
  createFormSchema,
  saveDraftSchema,
  formEnvelopeSchema,
  formsPageSchema,
  draftReceiptSchema,
} from '@snapform/contracts/draft';
import type { CreateForm, SaveDraft } from '@snapform/contracts/draft';
type FailureCode =
  | 'unauthenticated'
  | 'forbidden'
  | 'not-found'
  | 'conflict'
  | 'rate-limited'
  | 'unavailable'
  | 'invalid';
export class FormRequestError extends Error {
  constructor(
    readonly code: FailureCode,
    message: string,
  ) {
    super(message);
  }
}
const unavailable = () =>
  new FormRequestError(
    'unavailable',
    'We couldn’t confirm that request. Please try again.',
  );
async function request<T>(
  path: string,
  init: RequestInit,
  decode: (value: unknown) => T,
): Promise<T> {
  try {
    const response = await fetch(path, {
      ...init,
      credentials: 'same-origin',
      cache: 'no-store',
      redirect: 'error',
      signal: init.signal
        ? AbortSignal.any([init.signal, AbortSignal.timeout(20000)])
        : AbortSignal.timeout(20000),
    });
    if (response.status === 401)
      throw new FormRequestError(
        'unauthenticated',
        'Sign in again to continue.',
      );
    if (response.status === 403)
      throw new FormRequestError(
        'forbidden',
        'Your workspace role doesn’t allow this change.',
      );
    if (response.status === 404)
      throw new FormRequestError(
        'not-found',
        'That workspace or form is unavailable.',
      );
    if (response.status === 409)
      throw new FormRequestError(
        'conflict',
        'This operation conflicts with saved changes. Review the saved version before trying again.',
      );
    if (response.status === 429)
      throw new FormRequestError(
        'rate-limited',
        'Too many requests. Try again in a minute.',
      );
    if (!response.ok) throw unavailable();
    return decode(await response.json());
  } catch (error) {
    if (error instanceof FormRequestError) throw error;
    throw unavailable();
  }
}
const collectionPath = (workspaceId: string) =>
  `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/forms`;
const draftPath = (workspaceId: string, id: string) =>
  `${collectionPath(workspaceId)}/${encodeURIComponent(id)}/draft`;
export function fetchForms(
  workspaceId: string,
  cursor?: string,
  signal?: AbortSignal,
) {
  const path =
    collectionPath(workspaceId) +
    (cursor ? `?cursor=${encodeURIComponent(cursor)}` : '');
  return request(path, { signal }, (value) => formsPageSchema.parse(value));
}
export function fetchForm(
  workspaceId: string,
  id: string,
  signal?: AbortSignal,
) {
  return request(
    draftPath(workspaceId, id),
    { signal },
    (value) => formEnvelopeSchema.parse(value).form,
  );
}
export async function createFormRequest(
  workspaceId: string,
  input: CreateForm,
) {
  const parsed = createFormSchema.safeParse(input);
  if (!parsed.success)
    throw new FormRequestError(
      'invalid',
      'This draft contains unsupported settings.',
    );
  return request(
    collectionPath(workspaceId),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(parsed.data),
    },
    (value) => formEnvelopeSchema.parse(value).form,
  );
}
export async function saveDraftRequest(
  workspaceId: string,
  id: string,
  input: SaveDraft,
) {
  const parsed = saveDraftSchema.safeParse(input);
  if (!parsed.success)
    throw new FormRequestError(
      'invalid',
      'This draft contains unsupported settings.',
    );
  return request(
    draftPath(workspaceId, id),
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(parsed.data),
    },
    (value) => draftReceiptSchema.parse(value),
  );
}
