import type { Block, FormDefinition } from '@snapform/contracts/form';
import { newBlankDefinition, newBlock } from './new-form';

export const starters = [
  {
    id: 'agency',
    title: 'Project enquiry',
    description: 'Scope, goals and the right contact.',
  },
  {
    id: 'coach',
    title: 'Coaching discovery',
    description: 'Goals, challenges and a good first conversation.',
  },
  {
    id: 'consultant',
    title: 'Client intake',
    description: 'Understand the problem before the first call.',
  },
  {
    id: 'startup',
    title: 'Customer feedback',
    description: 'Find out what is working and what comes next.',
  },
] as const;
export type StarterId = (typeof starters)[number]['id'];

const questions: Record<StarterId, [Block['type'], string][]> = {
  agency: [
    ['short-text', 'What is your name?'],
    ['email', 'Where can we reach you?'],
    ['short-text', 'What is your company called?'],
    ['long-text', 'What would you like to create?'],
    ['long-text', 'What would a successful project change for you?'],
  ],
  coach: [
    ['short-text', 'What is your name?'],
    ['email', 'Where can we reach you?'],
    ['long-text', 'What would you like to work toward?'],
    ['long-text', 'What is getting in your way right now?'],
    ['long-text', 'What would you like us to know before we talk?'],
  ],
  consultant: [
    ['short-text', 'What is your name?'],
    ['email', 'Where can we reach you?'],
    ['short-text', 'Tell us your company and role.'],
    ['long-text', 'What problem would you like help solving?'],
    ['long-text', 'What have you already tried?'],
  ],
  startup: [
    ['short-text', 'Which part of the product do you use most?'],
    ['long-text', 'What is working well for you?'],
    ['long-text', 'What could we make easier?'],
    ['email', 'Where can we follow up about your feedback?'],
  ],
};

export function newStarterDefinition(id: StarterId): FormDefinition {
  const definition = newBlankDefinition();
  const starter = starters.find((item) => item.id === id)!;
  definition.title = starter.title;
  definition.description = starter.description;
  definition.pages[0].blocks = questions[id].map(([type, label]) => {
    const block = newBlock(type);
    return 'label' in block
      ? { ...block, label, required: type === 'email' && id !== 'startup' }
      : block;
  });
  return definition;
}
