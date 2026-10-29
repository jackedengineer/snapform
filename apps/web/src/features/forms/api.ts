import {
  responsePageSchema,
  responseDetailSchema,
} from '@snapform/contracts/responses';
import {
  publicationEnvelopeSchema,
  publicationReceiptSchema,
  publishFormSchema,
  unpublishFormSchema,
} from '@snapform/contracts/publication';
import type {
  PublishForm,
  UnpublishForm,
} from '@snapform/contracts/publication';
import {
  createFormSchema,
  saveDraftSchema,
  formEnvelopeSchema,
  formsPageSchema,
  draftReceiptSchema,
} from '@snapform/contracts/draft';
import type { CreateForm, SaveDraft } from '@snapform/contracts/draft';
function invalidDraft(
  issues: { code: string; params?: Record<string, unknown> }[],
) {
  return new FormRequestError(
    'invalid',
    issues.some(
      (issue) =>
        issue.code === 'custom' && issue.params?.reason === 'definition-size',
    )
      ? 'This draft is too large. Shorten long text, then try saving again.'
      : 'This draft contains unsupported settings.',
  );
}
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
    if (response.status === 422)
      throw new FormRequestError(
        'invalid',
        'These changes could not be validated. Review the form settings and try again.',
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
const formPath = (workspaceId: string, id: string) =>
  `${collectionPath(workspaceId)}/${encodeURIComponent(id)}`;
const draftPath = (workspaceId: string, id: string) =>
  formPath(workspaceId, id) + '/draft';
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
  if (!parsed.success) throw invalidDraft(parsed.error.issues);
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
  signal?: AbortSignal,
) {
  const parsed = saveDraftSchema.safeParse(input);
  if (!parsed.success) throw invalidDraft(parsed.error.issues);
  return request(
    draftPath(workspaceId, id),
    {
      method: 'PUT',
      signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(parsed.data),
    },
    (value) => draftReceiptSchema.parse(value),
  );
}

const publicationPath = (workspaceId: string, id: string) =>
  formPath(workspaceId, id) + '/publication';
export function fetchPublication(
  workspaceId: string,
  id: string,
  signal?: AbortSignal,
) {
  return request(
    publicationPath(workspaceId, id),
    { signal },
    (value) => publicationEnvelopeSchema.parse(value).publication,
  );
}
export function publishFormRequest(
  workspaceId: string,
  id: string,
  input: PublishForm,
) {
  return request(
    publicationPath(workspaceId, id),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(publishFormSchema.parse(input)),
    },
    (value) => publicationReceiptSchema.parse(value),
  );
}
export function stopPublicationRequest(
  workspaceId: string,
  id: string,
  input: UnpublishForm,
) {
  return request(
    publicationPath(workspaceId, id),
    {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(unpublishFormSchema.parse(input)),
    },
    (value) => publicationEnvelopeSchema.parse(value).publication,
  );
}

const responsesPath = (workspaceId: string, formId: string) =>
  formPath(workspaceId, formId) + '/responses';
export function fetchResponses(
  workspaceId: string,
  formId: string,
  cursor?: string,
  signal?: AbortSignal,
) {
  return request(
    responsesPath(workspaceId, formId) +
      (cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''),
    { signal },
    (value) => responsePageSchema.parse(value),
  );
}
export function fetchResponse(
  workspaceId: string,
  formId: string,
  id: string,
  signal?: AbortSignal,
) {
  return request(
    `${responsesPath(workspaceId, formId)}/${encodeURIComponent(id)}`,
    { signal },
    (value) => responseDetailSchema.parse(value).response,
  );
}

export const responseExportPath = (
  workspaceId: string,
  formId: string,
  versionId: string,
) =>
  formPath(workspaceId, formId) +
  '/response-export?versionId=' +
  encodeURIComponent(versionId);
