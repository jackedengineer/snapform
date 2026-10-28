import { blockSchema } from '@snapform/contracts/form';
import type { Block } from '@snapform/contracts/form';
export function hasAnswerSettings(block: Block) {
  return [
    'short-text',
    'long-text',
    'number',
    'multiple-choice',
    'date',
    'file',
  ].includes(block.type);
}
export function readAnswerSettings(block: Block, data: FormData): Block | null {
  const text = (name: string) => {
    const value = data.get(name);
    return typeof value === 'string' ? value : null;
  };
  const number = (name: string) => {
    const value = text(name);
    if (value === '') return undefined;
    if (value === null || !/^-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(value))
      return NaN;
    return Number(value);
  };
  let keys: string[], candidate: unknown;
  switch (block.type) {
    case 'short-text':
    case 'long-text':
      keys = ['minLength', 'maxLength'];
      candidate = {
        ...block,
        minLength: number('minLength'),
        maxLength: number('maxLength'),
      };
      break;
    case 'number': {
      const base = { ...block };
      delete base.min;
      delete base.max;
      const min = number('min'),
        max = number('max'),
        kind = text('unit');
      keys = ['min', 'max', 'unit'];
      if (kind === 'currency') keys.push('currency');
      if (kind === 'custom') keys.push('customUnit');
      candidate = {
        ...base,
        ...(min === undefined ? {} : { min }),
        ...(max === undefined ? {} : { max }),
        unit:
          kind === 'currency'
            ? { kind, code: text('currency') }
            : kind === 'custom'
              ? { kind, label: text('customUnit') }
              : { kind },
      };
      break;
    }
    case 'multiple-choice':
      keys = ['minSelections', 'maxSelections'];
      candidate = {
        ...block,
        minSelections: number('minSelections'),
        maxSelections: number('maxSelections'),
      };
      break;
    case 'date': {
      const next = { ...block };
      delete next.min;
      delete next.max;
      keys = ['min', 'max'];
      const min = text('min'),
        max = text('max');
      if (min === null || max === null) return null;
      candidate = { ...next, ...(min ? { min } : {}), ...(max ? { max } : {}) };
      break;
    }
    case 'file':
      keys = ['maxFiles'];
      candidate = { ...block, maxFiles: number('maxFiles') };
      break;
    default:
      return null;
  }
  for (const key of data.keys())
    if (!keys.includes(key) || data.getAll(key).length !== 1) return null;
  if (keys.some((key) => !data.has(key))) return null;
  const parsed = blockSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}
