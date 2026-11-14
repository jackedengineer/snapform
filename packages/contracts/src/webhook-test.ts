import { compileDefinition } from './compile.ts';
import { createWebhookPayload } from './webhook-payload.ts';
import type { FormDefinition } from './form.ts';
import type { Answer } from './answers.ts';
import type { UploadedFile } from './uploads.ts';

// A deterministic example; never reads an intake session or existing response.
export function createWebhookTestPayload(
  event: { id: string; formId: string; createdAt: string },
  version: { id: string; number: number; definition: FormDefinition },
) {
  try {
    const compiled = compileDefinition(version.definition);
    if (!compiled.ok) throw Error();
    const answers: Record<string, Answer> = {};
    const files: UploadedFile[] = [];
    for (const page of compiled.definition.pages) {
      for (const field of page.blocks) {
        let value: string | number | boolean | string[];
        switch (field.type) {
          case 'heading':
          case 'help':
            continue;
          case 'short-text':
          case 'long-text':
            value = 'Example response'
              .padEnd(field.minLength, 'x')
              .slice(0, field.maxLength);
            break;
          case 'email':
            value = 'qa@example.invalid';
            break;
          case 'number':
            value = Math.min(
              field.max ?? Number.MAX_SAFE_INTEGER,
              Math.max(field.min ?? -Number.MAX_SAFE_INTEGER, 0),
            );
            break;
          case 'date':
            value = '2000-01-01';
            if (field.min && value < field.min) value = field.min;
            if (field.max && value > field.max) value = field.max;
            break;
          case 'single-choice':
            value = field.options[0].id;
            break;
          case 'multiple-choice':
            value = field.options
              .slice(0, Math.max(1, field.minSelections))
              .map((option) => option.id);
            break;
          case 'acknowledgment':
            value = true;
            break;
          case 'file':
            // A described example file; no object exists for it.
            value = [field.id];
            files.push({
              id: field.id,
              questionId: field.id,
              name: 'example.pdf',
              size: 1024,
              type: 'application/pdf',
            });
            break;
        }
        answers[field.id] = { state: 'value', value };
      }
    }
    return createWebhookPayload(
      event,
      {
        id: event.id,
        versionId: version.id,
        version: version.number,
        submittedAt: event.createdAt,
        definition: compiled.definition,
        answers,
        files,
      },
      true,
    );
  } catch {
    throw Error('INVALID_WEBHOOK_TEST');
  }
}
