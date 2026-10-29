import { expect, it } from 'vitest';
import { createWebhookTestPayload } from './webhook-test.ts';
import { formFixture } from '../test/form-fixture.ts';
const event = {
  id: crypto.randomUUID(),
  formId: crypto.randomUUID(),
  createdAt: '2026-10-30T00:00:00.000Z',
};
it('creates deterministic synthetic values within the published field bounds without using saved responses', () => {
  const { definition, ids } = formFixture(),
    versionId = crypto.randomUUID();
  const common = { description: '', required: true, aiEnabled: false };
  const text = crypto.randomUUID(),
    date = crypto.randomUUID(),
    multi = crypto.randomUUID(),
    ack = crypto.randomUUID(),
    option = crypto.randomUUID();
  definition.pages[0].blocks.push(
    {
      ...common,
      id: text,
      type: 'short-text',
      label: 'Text',
      minLength: 20,
      maxLength: 25,
    },
    {
      ...common,
      id: date,
      type: 'date',
      label: 'Date',
      min: '2030-01-01',
      max: '2030-12-31',
    },
    {
      ...common,
      id: multi,
      type: 'multiple-choice',
      label: 'Choices',
      minSelections: 1,
      maxSelections: 1,
      options: [{ id: option, label: 'Example' }],
    },
    { ...common, id: ack, type: 'acknowledgment', label: 'Accept' },
    { id: crypto.randomUUID(), type: 'heading', text: 'Heading' },
    { id: crypto.randomUUID(), type: 'help', text: 'Help' },
  );
  const version = { id: versionId, number: 2, definition };
  const raw = createWebhookTestPayload(event, version),
    payload = JSON.parse(raw);
  expect(createWebhookTestPayload(event, version)).toBe(raw);
  expect(payload).toMatchObject({
    test: true,
    type: 'webhook.test',
    data: { responseId: event.id, formVersionId: versionId, formVersion: 2 },
  });
  const values = Object.fromEntries(
    payload.data.answers.map((answer: { fieldId: string; value: unknown }) => [
      answer.fieldId,
      answer.value,
    ]),
  );
  expect(values[ids.budget]).toBe(0);
  expect(values[ids.contact]).toBe('qa@example.invalid');
  expect(values[text]).toHaveLength(20);
  expect(values[date]).toBe('2030-01-01');
  expect(values[multi]).toEqual([option]);
  expect(values[ack]).toBe(true);
  expect(payload.data.answers).toHaveLength(8);
});
it('handles upper bounds and rejects unsupported or invalid definitions', () => {
  const { definition, ids } = formFixture();
  const number = definition.pages[0].blocks.find(
    (field) => field.id === ids.budget,
  );
  if (!number || number.type !== 'number') throw Error('Number fixture');
  number.min = -10;
  number.max = -2;
  const date = crypto.randomUUID();
  definition.pages[0].blocks.push({
    id: date,
    type: 'date',
    label: 'Date',
    description: '',
    required: true,
    aiEnabled: false,
    max: '1990-01-01',
  });
  const version = { id: crypto.randomUUID(), number: 1, definition };
  expect(
    JSON.parse(createWebhookTestPayload(event, version)).data.answers,
  ).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ fieldId: ids.budget, value: -2 }),
      expect.objectContaining({ fieldId: date, value: '1990-01-01' }),
    ]),
  );
  number.min = 5;
  number.max = 10;
  expect(
    JSON.parse(createWebhookTestPayload(event, version)).data.answers,
  ).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ fieldId: ids.budget, value: 5 }),
    ]),
  );
  definition.pages[0].blocks.push({
    id: crypto.randomUUID(),
    type: 'file',
    label: 'File',
    description: '',
    required: false,
    aiEnabled: false,
    maxFiles: 1,
  });
  expect(() => createWebhookTestPayload(event, version)).toThrow(
    'INVALID_WEBHOOK_TEST',
  );
  definition.pages[0].blocks = [];
  definition.title = '';
  expect(() => createWebhookTestPayload(event, version)).toThrow(
    'INVALID_WEBHOOK_TEST',
  );
});
