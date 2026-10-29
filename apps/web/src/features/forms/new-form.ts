import type { Block, FormDefinition } from '@snapform/contracts/form';
export const blockNames = {
  'short-text': 'Short answer',
  'long-text': 'Long answer',
  email: 'Email address',
  number: 'Number',
  'single-choice': 'Single choice',
  'multiple-choice': 'Multiple choice',
  date: 'Date',
  acknowledgment: 'Acknowledgment',
  file: 'File upload',
  heading: 'Heading',
  help: 'Help text',
} satisfies Record<Block['type'], string>;
export function newBlankDefinition(): FormDefinition {
  const endingId = crypto.randomUUID();
  return {
    contractVersion: 1,
    title: 'Untitled form',
    description: '',
    presentation: 'page',
    rules: [],
    pages: [{ id: crypto.randomUUID(), title: 'Your questions', blocks: [] }],
    endings: [
      {
        id: endingId,
        title: 'Thank you',
        description: 'Your response has been received.',
      },
    ],
    defaultEndingId: endingId,
  };
}
export function newBlock(type: Block['type']): Block {
  const id = crypto.randomUUID();
  const common = {
    id,
    label: blockNames[type],
    description: '',
    required: false,
    aiEnabled: false,
  };
  const options = () =>
    [1, 2].map((index) => ({
      id: crypto.randomUUID(),
      label: `Option ${index}`,
    }));
  switch (type) {
    case 'short-text':
      return { ...common, type, minLength: 0, maxLength: 500 };
    case 'long-text':
      return { ...common, type, minLength: 0, maxLength: 10000 };
    case 'email':
      return { ...common, type };
    case 'number':
      return { ...common, type, unit: { kind: 'none' } };
    case 'single-choice':
      return { ...common, type, options: options() };
    case 'multiple-choice':
      return {
        ...common,
        type,
        options: options(),
        minSelections: 0,
        maxSelections: 2,
      };
    case 'date':
      return { ...common, type };
    case 'acknowledgment':
      return { ...common, type };
    case 'file':
      return { ...common, type, aiEnabled: false, maxFiles: 1 };
    case 'heading':
      return { id, type, text: 'New section' };
    case 'help':
      return { id, type, text: 'Add some helpful context.' };
  }
}
export function duplicateBlock(block: Block): Block {
  const copy = structuredClone(block);
  copy.id = crypto.randomUUID();
  if (copy.type === 'single-choice' || copy.type === 'multiple-choice')
    copy.options = copy.options.map((option) => ({
      ...option,
      id: crypto.randomUUID(),
    }));
  return copy;
}

const captionSegments = new Intl.Segmenter(undefined, {
  granularity: 'grapheme',
});
export function blockCaption(block: Block) {
  const text = ('label' in block ? block.label : block.text).trim();
  if (!text) return 'Untitled question';
  let caption = '',
    count = 0;
  for (const { segment } of captionSegments.segment(text)) {
    if (count++ === 80) return caption.trimEnd() + '…';
    caption += segment;
  }
  return caption;
}
