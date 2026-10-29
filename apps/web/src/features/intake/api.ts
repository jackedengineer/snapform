import {
  intakeEnvelopeSchema,
  intakeConfigurationSchema,
} from '@snapform/contracts/intake';
import { publicFormEnvelopeSchema } from '@snapform/contracts/public-form';
import {
  intakeMutationSchema,
  intakeMutationReceiptSchema,
} from '@snapform/contracts/intake-progress';
import type { IntakeMutation } from '@snapform/contracts/intake-progress';
export type IntakeIdentity = { id: string; capability: string };
type Failure =
  | 'unavailable'
  | 'expired'
  | 'challenge'
  | 'conflict'
  | 'quota'
  | 'rate-limited'
  | 'invalid';
export class IntakeRequestError extends Error {
  constructor(
    readonly code: Failure,
    message: string,
  ) {
    super(message);
  }
}
const unavailable = () =>
  new IntakeRequestError(
    'unavailable',
    'We couldn’t confirm that request. Your answers have not been cleared.',
  );
async function request<T>(
  path: string,
  init: RequestInit,
  decode: (value: unknown) => T,
): Promise<T> {
  try {
    const response = await fetch(path, {
      ...init,
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) {
      if (response.status === 401 || response.status === 404)
        throw new IntakeRequestError(
          'expired',
          'This form or saved session is no longer available. Contact the business for help.',
        );
      if (response.status === 429)
        throw new IntakeRequestError(
          'rate-limited',
          'Too many requests. Wait a minute, then retry.',
        );
      const body: unknown = await response.json();
      const error =
        typeof body === 'object' && body !== null && 'error' in body
          ? body.error
          : null;
      const code =
        typeof error === 'object' && error !== null && 'code' in error
          ? error.code
          : null;
      if (response.status === 403)
        throw new IntakeRequestError(
          'challenge',
          'The security check needs another try.',
        );
      if (response.status === 409)
        throw new IntakeRequestError(
          code === 'INTAKE_QUOTA_UNAVAILABLE' ? 'quota' : 'conflict',
          code === 'INTAKE_QUOTA_UNAVAILABLE'
            ? 'This form cannot accept more responses right now. Contact the business for help.'
            : 'Your saved response changed. Reload the saved version before continuing.',
        );
      if (response.status === 422)
        throw new IntakeRequestError(
          'invalid',
          'Review the highlighted answers before submitting.',
        );
      throw unavailable();
    }
    return decode(await response.json());
  } catch (error) {
    if (error instanceof IntakeRequestError) throw error;
    throw unavailable();
  }
}
const root = (publicId: string) =>
  '/api/v1/public/forms/' + encodeURIComponent(publicId);
const sessionPath = (publicId: string, identity: IntakeIdentity) =>
  root(publicId) + '/sessions/' + encodeURIComponent(identity.id);
const bearer = (identity: IntakeIdentity) => ({
  Authorization: 'Bearer ' + identity.capability,
});
export const readPublicForm = (publicId: string) =>
  request(
    root(publicId),
    {},
    (value) => publicFormEnvelopeSchema.parse(value).form,
  );
export const readIntakeConfiguration = () =>
  request('/api/v1/public/intake-config', {}, (value) =>
    intakeConfigurationSchema.parse(value),
  );
export function startIntakeRequest(
  publicId: string,
  identity: IntakeIdentity,
  challengeToken: string,
) {
  return request(
    root(publicId) + '/sessions',
    {
      method: 'POST',
      headers: { ...bearer(identity), 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: identity.id, challengeToken }),
    },
    (value) => {
      const session = intakeEnvelopeSchema.parse(value).session;
      if (session.id !== identity.id || session.publicId !== publicId)
        throw unavailable();
      return session;
    },
  );
}
export function readIntakeRequest(publicId: string, identity: IntakeIdentity) {
  return request(
    sessionPath(publicId, identity),
    { headers: bearer(identity) },
    (value) => {
      const session = intakeEnvelopeSchema.parse(value).session;
      if (session.id !== identity.id || session.publicId !== publicId)
        throw unavailable();
      return session;
    },
  );
}
export function writeIntakeRequest(
  publicId: string,
  identity: IntakeIdentity,
  raw: IntakeMutation,
  kind: 'save' | 'submit',
) {
  const input = intakeMutationSchema.parse(raw);
  return request(
    sessionPath(publicId, identity) + (kind === 'submit' ? '/submission' : ''),
    {
      method: kind === 'submit' ? 'POST' : 'PATCH',
      headers: { ...bearer(identity), 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
    (value) => {
      if (
        typeof value !== 'object' ||
        value === null ||
        !('receipt' in value) ||
        Object.keys(value).length !== 1
      )
        throw unavailable();
      const receipt = intakeMutationReceiptSchema.parse(value.receipt);
      if (
        receipt.operationId !== input.operationId ||
        receipt.revision !== input.expectedRevision + 1 ||
        receipt.currentRevision < receipt.revision ||
        receipt.status !== (kind === 'submit' ? 'submitted' : 'collecting')
      )
        throw unavailable();
      return receipt;
    },
  );
}
