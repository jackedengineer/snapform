import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { ResponseFiles } from './ResponseFiles';
const path = {
  workspaceId: crypto.randomUUID(),
  formId: crypto.randomUUID(),
  responseId: crypto.randomUUID(),
};
const [brief, missing] = [crypto.randomUUID(), crypto.randomUUID()];
const render = (props: Partial<Parameters<typeof ResponseFiles>[0]>) =>
  renderToStaticMarkup(
    createElement(ResponseFiles, { failed: false, path, ...props }),
  );
it('lists names and sizes with an authenticated attachment link', () => {
  const html = render({
    answer: { state: 'value', value: [brief, missing] },
    files: [{ id: brief, name: '<img src=x>.pdf', size: 2048 }],
  });
  expect(html).toContain('&lt;img src=x&gt;.pdf');
  expect(html).toContain('2 KB');
  expect(html).toContain(
    `href="/api/v1/workspaces/${path.workspaceId}/forms/${path.formId}/responses/${path.responseId}/files/${brief}"`,
  );
  expect(html).toContain('aria-label="Download &lt;img src=x&gt;.pdf"');
  expect(html).toContain('Unavailable file');
  expect(html).not.toMatch(/r2\.|https?:/);
});
it('explains empty, declined, loading and failed file answers', () => {
  expect(render({ answer: { state: 'blank' } })).toBe('No files');
  expect(render({ answer: { state: 'refused' } })).toBe('Prefer not to answer');
  const answer = { state: 'value' as const, value: [brief] };
  expect(render({ answer })).toBe('Loading files…');
  expect(render({ answer, failed: true })).toBe(
    'Files couldn’t be loaded. Refresh to try again.',
  );
});
