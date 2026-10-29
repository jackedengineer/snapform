import {
  webhookConfigurationInputSchema,
  webhookSettingsSchema,
  webhookSecretInputSchema,
  webhookSecretSchema,
} from '@snapform/contracts/webhook-settings';
import type {
  WebhookConfigurationInput,
  WebhookSecretInput,
} from '@snapform/contracts/webhook-settings';
import { request, FormRequestError } from './api';
const path = (workspaceId: string, formId: string) =>
  `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/forms/${encodeURIComponent(formId)}/webhook`;
export function fetchWebhookSettings(
  workspaceId: string,
  formId: string,
  signal?: AbortSignal,
) {
  return request(path(workspaceId, formId), { signal }, (value) =>
    webhookSettingsSchema.parse(value),
  );
}
export async function saveWebhookSettings(
  workspaceId: string,
  formId: string,
  input: WebhookConfigurationInput,
) {
  const checked = webhookConfigurationInputSchema.safeParse(input);
  if (!checked.success)
    throw new FormRequestError(
      'invalid',
      checked.error.issues.some((issue) => issue.path[0] === 'url')
        ? 'Use a public HTTPS endpoint on port 443, without credentials or fragments.'
        : 'Refresh the saved endpoint, then try again.',
    );
  return request(
    path(workspaceId, formId),
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(checked.data),
    },
    (value) => webhookSettingsSchema.parse(value),
  );
}
export function revealWebhookSecret(
  workspaceId: string,
  formId: string,
  input: WebhookSecretInput,
  signal?: AbortSignal,
) {
  return request(
    path(workspaceId, formId) + '/secret',
    {
      method: 'POST',
      signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(webhookSecretInputSchema.parse(input)),
    },
    (value) => webhookSecretSchema.parse(value),
  );
}
