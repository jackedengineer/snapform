import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { DraftRecovery } from './DraftRecovery';
it('renders conflict recovery independently of publication diagnostics', () => {
  const html = renderToStaticMarkup(
    createElement(DraftRecovery, { loading: false, onReload: () => undefined }),
  );
  expect(html).toContain('Load saved version');
  expect(html).toContain('Restore previous edit');
  expect(html).not.toContain('disabled');
});
it('prevents repeated recovery requests while the saved copy is loading', () => {
  const html = renderToStaticMarkup(
    createElement(DraftRecovery, { loading: true, onReload: () => undefined }),
  );
  expect(html).toContain('disabled');
});
