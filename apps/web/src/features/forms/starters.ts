import type { Block, FormDefinition } from '@snapform/contracts/form';
import type { Condition } from '@snapform/contracts/rules';

// Picker copy is for the form owner; each form's own title faces respondents.
export const starters = [
  {
    id: 'agency',
    title: 'Agency project enquiry',
    description: 'Service, budget, start date and who decides.',
  },
  {
    id: 'coach',
    title: 'Coaching application',
    description: 'Goals, readiness, format and investment.',
  },
  {
    id: 'consultant',
    title: 'Consultant discovery',
    description: 'Situation, outcome, timing and budget.',
  },
  {
    id: 'startup',
    title: 'Demo request',
    description: 'Team size, use case and timing. Small teams self-serve.',
  },
] as const;
export type StarterId = (typeof starters)[number]['id'];

type Question = { label: string; help?: string; optional?: true } & (
  | { type: 'short-text' | 'long-text' | 'email' }
  | { type: 'single-choice'; options: string[] }
);
type Ending = { title: string; description: string };
type Spec = {
  title: string;
  description: string;
  pages: { title: string; questions: Question[] }[];
  // The first ending is the default; the rule sends any listed answer to the second.
  endings: [Ending, Ending];
  route: Record<string, string[]>;
};

const decisionRole: Question = {
  type: 'single-choice',
  label: 'What’s your role in the decision?',
  options: ['I decide', 'I recommend', 'I’m gathering options'],
};
const name: Question = { type: 'short-text', label: 'Your name' };
const workEmail: Question = { type: 'email', label: 'Work email' };
const company: Question = { type: 'short-text', label: 'Company' };

const specs: Record<StarterId, Spec> = {
  agency: {
    title: 'Start a project',
    description:
      'A few questions about your project, so our first reply is a useful one. It takes about three minutes.',
    pages: [
      {
        title: 'Your project',
        questions: [
          {
            type: 'single-choice',
            label: 'What do you need help with?',
            options: [
              'A new website',
              'A website redesign',
              'Brand identity',
              'Ongoing support',
              'Something else',
            ],
          },
          {
            type: 'single-choice',
            label: 'What’s your budget?',
            help: 'A range is fine. It helps us suggest the right scope.',
            options: [
              'Under USD 5,000',
              'USD 5,000 to 15,000',
              'USD 15,000 to 50,000',
              'Over USD 50,000',
              'Not sure yet',
            ],
          },
          {
            type: 'single-choice',
            label: 'When would you like to start?',
            options: [
              'As soon as possible',
              'In 1 to 3 months',
              'In 3 to 6 months',
              'Not sure yet',
            ],
          },
          decisionRole,
          {
            type: 'long-text',
            label: 'What problem are you trying to solve?',
            help: 'In your own words. A few sentences is plenty.',
          },
        ],
      },
      {
        title: 'About you',
        questions: [
          name,
          workEmail,
          company,
          { type: 'short-text', label: 'Website', optional: true },
        ],
      },
    ],
    endings: [
      {
        title: 'Thanks, here’s what happens next',
        description:
          'We’ll read your brief and reply within one working day, with a few questions or a time to talk.',
      },
      {
        title: 'Thanks, we may not be the right fit',
        description:
          'Our projects usually start at USD 5,000. For a smaller budget, a good template or an independent freelancer is often a lighter way to start. We’ll still read your brief and reply if we can help.',
      },
    ],
    route: { 'What’s your budget?': ['Under USD 5,000'] },
  },
  coach: {
    title: 'Coaching application',
    description:
      'A few questions to see whether working together is the right fit right now.',
    pages: [
      {
        title: 'Your goals',
        questions: [
          {
            type: 'long-text',
            label: 'What would you like to change or achieve?',
          },
          {
            type: 'long-text',
            label: 'Where are things today?',
            help: 'For example your role, your business or what you’ve tried.',
          },
        ],
      },
      {
        title: 'Working together',
        questions: [
          {
            type: 'single-choice',
            label: 'How ready are you to commit?',
            options: [
              'Ready to start now',
              'Ready in the next month or two',
              'Just exploring for now',
            ],
          },
          {
            type: 'single-choice',
            label: 'Which format suits you?',
            options: [
              'One-to-one video calls',
              'One-to-one in person',
              'A small group',
              'Not sure yet',
            ],
          },
          {
            type: 'single-choice',
            label: 'What monthly investment feels comfortable?',
            options: [
              'Up to USD 250',
              'USD 250 to 750',
              'Over USD 750',
              'I’d like to talk it through',
            ],
          },
        ],
      },
      {
        title: 'About you',
        questions: [name, { type: 'email', label: 'Email' }],
      },
    ],
    endings: [
      {
        title: 'Thanks for applying',
        description:
          'We’ll read your answers and reply within two working days to arrange a short introductory call.',
      },
      {
        title: 'Thanks, there’s no rush',
        description:
          'It sounds like you’re still exploring, which is a good place to start. We’ll send a few free resources, and you’re welcome to apply again when the timing feels right.',
      },
    ],
    route: { 'How ready are you to commit?': ['Just exploring for now'] },
  },
  consultant: {
    title: 'Discovery questions',
    description:
      'Tell us about the situation, so our first conversation can focus on what matters to you.',
    pages: [
      {
        title: 'Your situation',
        questions: [
          {
            type: 'long-text',
            label: 'What’s the situation?',
            help: 'A short summary of the business and the challenge.',
          },
          {
            type: 'long-text',
            label: 'What outcome would make this worthwhile?',
          },
          {
            type: 'long-text',
            label: 'What have you tried so far?',
            optional: true,
          },
        ],
      },
      {
        title: 'Timing and budget',
        questions: [
          {
            type: 'single-choice',
            label: 'When do you need results?',
            options: [
              'Within a month',
              'In 1 to 3 months',
              'In 3 to 6 months',
              'Just exploring',
            ],
          },
          {
            type: 'single-choice',
            label: 'What budget is set aside?',
            options: [
              'Under USD 5,000',
              'USD 5,000 to 20,000',
              'Over USD 20,000',
              'No budget set yet',
            ],
          },
          decisionRole,
        ],
      },
      { title: 'About you', questions: [name, workEmail, company] },
    ],
    endings: [
      {
        title: 'Thanks, let’s find a time to talk',
        description:
          'We’ll review your answers and email you within one working day with times for a short discovery call.',
      },
      {
        title: 'Thanks, it may be a little early',
        description:
          'From your answers, a paid engagement may be early for now. We’ll send a few ideas to help you prepare, and we’d be glad to talk when timing and budget are clearer.',
      },
    ],
    route: {
      'When do you need results?': ['Just exploring'],
      'What budget is set aside?': ['No budget set yet'],
    },
  },
  startup: {
    title: 'Request a demo',
    description:
      'Tell us about your team, so we can shape the demo around how you work.',
    pages: [
      {
        title: 'About you',
        questions: [
          name,
          workEmail,
          company,
          { type: 'short-text', label: 'Your role' },
        ],
      },
      {
        title: 'Your team',
        questions: [
          {
            type: 'single-choice',
            label: 'How many people would use it?',
            options: [
              'Just me',
              '2 to 10',
              '11 to 50',
              '51 to 200',
              'More than 200',
            ],
          },
          {
            type: 'long-text',
            label: 'What would you like to use it for?',
          },
          {
            type: 'short-text',
            label: 'What do you use today?',
            help: 'A tool, a spreadsheet or nothing yet are all fine answers.',
            optional: true,
          },
          {
            type: 'single-choice',
            label: 'When do you want to get started?',
            options: [
              'This month',
              'Next quarter',
              'Later this year',
              'Just researching',
            ],
          },
        ],
      },
    ],
    endings: [
      {
        title: 'Thanks, we’ll be in touch about your demo',
        description:
          'We’ll read your answers and email you within one working day with a few times that suit your timeline.',
      },
      {
        title: 'Thanks, you can start today',
        description:
          'Teams your size usually get going fastest on their own. We’ll email you a setup guide within one working day, and you can still ask for a walkthrough by replying to it.',
      },
    ],
    route: { 'How many people would use it?': ['Just me', '2 to 10'] },
  },
};

function toBlock({ label, help = '', optional, ...rest }: Question): Block {
  const common = {
    id: crypto.randomUUID(),
    label,
    description: help,
    required: !optional,
    aiEnabled: false,
  };
  switch (rest.type) {
    case 'short-text':
      return { ...common, type: rest.type, minLength: 0, maxLength: 500 };
    case 'long-text':
      return { ...common, type: rest.type, minLength: 0, maxLength: 10000 };
    case 'email':
      return { ...common, type: rest.type };
    case 'single-choice':
      return {
        ...common,
        type: rest.type,
        options: rest.options.map((option) => ({
          id: crypto.randomUUID(),
          label: option,
        })),
      };
  }
}

export function newStarterDefinition(id: StarterId): FormDefinition {
  const spec = specs[id];
  const pages = spec.pages.map((page) => ({
    id: crypto.randomUUID(),
    title: page.title,
    blocks: page.questions.map(toBlock),
  }));
  const endings = spec.endings.map((ending) => ({
    id: crypto.randomUUID(),
    ...ending,
  }));
  const conditions = pages.flatMap((page) =>
    page.blocks.flatMap((block): Condition[] =>
      block.type === 'single-choice'
        ? block.options
            .filter((option) => spec.route[block.label]?.includes(option.label))
            .map((option) => ({
              op: 'eq',
              fieldId: block.id,
              value: option.id,
            }))
        : [],
    ),
  );
  return {
    contractVersion: 1,
    title: spec.title,
    description: spec.description,
    presentation: 'card',
    pages,
    endings,
    defaultEndingId: endings[0].id,
    rules: [
      {
        id: crypto.randomUUID(),
        priority: 0,
        condition:
          conditions.length === 1 ? conditions[0] : { op: 'or', conditions },
        // Ending from the last page keeps every answer in the brief.
        action: {
          type: 'end',
          fromPageId: pages[pages.length - 1].id,
          endingId: endings[1].id,
        },
      },
    ],
  };
}
