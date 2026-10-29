import { z } from 'zod';
import { responseDetailSchema } from './responses.ts';
import type { ResponseDetail } from './responses.ts';
import { evaluateForm } from './evaluate.ts';
import { formatResponseAnswer } from './response-display.ts';
import { MAX_WEBHOOK_BYTES } from './webhook-protocol.ts';
const eventSchema = z.strictObject({
  id: z.uuid(),
  formId: z.uuid(),
  createdAt: z.iso.datetime(),
});
export function createWebhookPayload(
  raw: z.infer<typeof eventSchema>,
  snapshot: ResponseDetail,
  test: boolean,
): string {
  try {
    const event = eventSchema.parse(raw),
      response = responseDetailSchema.parse({ response: snapshot }).response;
    if (typeof test !== 'boolean') throw Error();
    const evaluated = evaluateForm(response.definition, response.answers);
    if (!evaluated.ok || !evaluated.complete) throw Error();
    const answers = response.definition.pages
      .flatMap((page) => page.blocks)
      .filter((block) => 'required' in block)
      .map((field) => {
        const answer = evaluated.answers[field.id];
        return {
          fieldId: field.id,
          type: field.type,
          label: field.label,
          state: answer.state,
          value: answer.state === 'value' ? answer.value : null,
          display: formatResponseAnswer(field, answer),
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
