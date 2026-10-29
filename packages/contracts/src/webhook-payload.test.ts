import { expect, it } from 'vitest';
import { createWebhookPayload } from './webhook-payload.ts';
import { formFixture } from '../test/form-fixture.ts';
import type { ResponseDetail } from './responses.ts';
const event = {
  id: crypto.randomUUID(),
  formId: crypto.randomUUID(),
  createdAt: '2026-10-30T00:00:00.000Z',
};
function fixture() {
  const { definition, ids } = formFixture();
  const ack = crypto.randomUUID();
  definition.pages[0].blocks.push({
    id: ack,
    type: 'acknowledgment',
    label: 'Optional acknowledgement',
    description: '',
    required: false,
    aiEnabled: false,
  });
  const response: ResponseDetail = {
    id: crypto.randomUUID(),
    versionId: crypto.randomUUID(),
    version: 2,
    submittedAt: event.createdAt,
    definition,
    answers: {
      [ids.kind]: { state: 'value', value: ids.agency },
      [ids.budget]: { state: 'value', value: 0 },
      [ids.contact]: { state: 'value', value: 'qa@example.invalid' },
      [ids.detail]: { state: 'blank' },
      [ack]: { state: 'value', value: false },
    },
  };
  return { response, ids, ack };
}
it('serializes a versioned pinned response with typed zero/false and explicit missing states', () => {
  const { response, ids, ack } = fixture();
  const raw = createWebhookPayload(event, response, false),
    payload = JSON.parse(raw);
  expect(payload).toMatchObject({
    specVersion: 1,
    id: event.id,
    type: 'response.submitted',
    test: false,
    createdAt: event.createdAt,
    data: {
      formId: event.formId,
      responseId: response.id,
      formVersionId: response.versionId,
      formVersion: 2,
      submittedAt: response.submittedAt,
    },
  });
  expect(
    payload.data.answers.find(
      (a: { fieldId: string }) => a.fieldId === ids.budget,
    ),
  ).toMatchObject({
    type: 'number',
    state: 'value',
    value: 0,
    display: 'INR 0',
  });
  expect(
    payload.data.answers.find((a: { fieldId: string }) => a.fieldId === ack),
  ).toMatchObject({ state: 'value', value: false, display: 'No' });
  expect(
    payload.data.answers.find(
      (a: { fieldId: string }) => a.fieldId === ids.detail,
    ),
  ).toMatchObject({ state: 'blank', value: null });
  expect(
    payload.data.answers.find(
      (a: { fieldId: string }) => a.fieldId === ids.kind,
    ),
  ).toMatchObject({ value: ids.agency, display: 'Agency' });
  expect(Object.keys(payload.data).sort()).toEqual([
    'answers',
    'formId',
    'formVersion',
    'formVersionId',
    'responseId',
    'submittedAt',
  ]);
  expect(createWebhookPayload(event, response, false)).toBe(raw);
});
it('labels tests distinctly and never accepts an incomplete or foreign-field record', () => {
  const { response, ids } = fixture();
  expect(JSON.parse(createWebhookPayload(event, response, true))).toMatchObject(
    { type: 'webhook.test', test: true },
  );
  for (const answers of [
    { ...response.answers, [ids.contact]: { state: 'missing' as const } },
    {
      ...response.answers,
      [crypto.randomUUID()]: { state: 'value' as const, value: 'foreign' },
    },
  ])
    expect(() =>
      createWebhookPayload(event, { ...response, answers }, false),
    ).toThrow('INVALID_WEBHOOK_PAYLOAD');
  expect(() =>
    createWebhookPayload({ ...event, id: 'invalid' }, response, false),
  ).toThrow('INVALID_WEBHOOK_PAYLOAD');
});
