import { z } from './zod.ts';
import { responseDetailSchema } from './responses.ts';
import type { ResponseDetail } from './responses.ts';
import { evaluateForm } from './evaluate.ts';
import { formatResponseAnswer } from './response-display.ts';
import { MAX_WEBHOOK_BYTES } from './webhook-protocol.ts';
import { fileNames, uploadedFilesSchema } from './uploads.ts';
import type { UploadedFile } from './uploads.ts';
const eventSchema = z.strictObject({
  id: z.uuid(),
  formId: z.uuid(),
  createdAt: z.iso.datetime(),
});
/** A submitted response plus metadata of its stored files, if any. */
export type WebhookSnapshot = ResponseDetail & { files?: UploadedFile[] };
export function createWebhookPayload(
  raw: z.infer<typeof eventSchema>,
  snapshot: WebhookSnapshot,
  test: boolean,
): string {
  try {
    const event = eventSchema.parse(raw),
      { files: rawFiles = [], ...detail } = snapshot,
      response = responseDetailSchema.parse({ response: detail }).response,
      files = uploadedFilesSchema.parse(rawFiles);
    if (typeof test !== 'boolean') throw Error();
    const evaluated = evaluateForm(response.definition, response.answers);
    if (!evaluated.ok || !evaluated.complete) throw Error();
    const answers = response.definition.pages
      .flatMap((page) => page.blocks)
      .filter((block) => 'required' in block)
      .map((field) => {
        const answer = evaluated.answers[field.id];
        const value = answer.state === 'value' ? answer.value : null;
        // File metadata only: never bytes, storage keys or public links.
        const file = field.type === 'file';
        return {
          fieldId: field.id,
          type: field.type,
          label: field.label,
          state: answer.state,
          value,
          display:
            file && value !== null
              ? fileNames(value, files)
              : formatResponseAnswer(field, answer),
          ...(file && {
            files: (Array.isArray(value) ? value : []).flatMap((id) =>
              files
                .filter((item) => item.id === id)
                .map(({ name, size, type }) => ({ id, name, size, type })),
            ),
          }),
        };
      });
    const body = JSON.stringify({
      specVersion: 1,
      id: event.id,
      type: test ? 'webhook.test' : 'response.submitted',
      test,
      createdAt: event.createdAt,
      data: {
        formId: event.formId,
        responseId: response.id,
        formVersionId: response.versionId,
        formVersion: response.version,
        submittedAt: response.submittedAt,
        answers,
      },
    });
    if (new TextEncoder().encode(body).byteLength > MAX_WEBHOOK_BYTES)
      throw Error();
    return body;
  } catch {
    throw Error('INVALID_WEBHOOK_PAYLOAD');
  }
}
