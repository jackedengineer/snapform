import type { FormDefinition } from '../src/form.ts';
export function formFixture() {
  const ids = {
    kind: crypto.randomUUID(),
    budget: crypto.randomUUID(),
    detail: crypto.randomUUID(),
    contact: crypto.randomUUID(),
    agency: crypto.randomUUID(),
    startup: crypto.randomUUID(),
    first: crypto.randomUUID(),
    second: crypto.randomUUID(),
    ending: crypto.randomUUID(),
  };
  const common = { description: '', required: false, aiEnabled: false };
  const definition: FormDefinition = {
    contractVersion: 1,
    title: 'Project enquiry',
    description: '',
    presentation: 'page',
    rules: [],
    endings: [
      {
        id: ids.ending,
        title: 'Thank you',
        description: 'We will be in touch.',
      },
    ],
    defaultEndingId: ids.ending,
    pages: [
      {
        id: ids.first,
        title: 'Project',
        blocks: [
          {
            ...common,
            id: ids.kind,
            type: 'single-choice',
            label: 'Business',
            options: [
              { id: ids.agency, label: 'Agency' },
              { id: ids.startup, label: 'Startup' },
            ],
          },
          {
            ...common,
            id: ids.budget,
            type: 'number',
            label: 'Budget',
            required: true,
            unit: { kind: 'currency', code: 'INR' },
            min: 0,
          },
          {
            ...common,
            id: ids.detail,
            type: 'long-text',
            label: 'Context',
            minLength: 0,
            maxLength: 10000,
          },
        ],
      },
      {
        id: ids.second,
        title: 'Contact',
        blocks: [
          {
            ...common,
            id: ids.contact,
            type: 'email',
            label: 'Email',
            required: true,
          },
        ],
      },
    ],
  };
  return { ids, definition };
}
