import { createElement } from 'react';
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import {
  documentTitle,
  Receipt,
  RespondentFrame,
  Review,
  Unavailable,
  Welcome,
} from './screens';
const html = (element: ReactElement) => renderToStaticMarkup(element);
const none = () => undefined;
const headings = (markup: string, level: number) =>
  markup.match(new RegExp(`<h${level}[ >]`, 'g'))?.length || 0;
it('keeps respondents on the form with quiet links that open new tabs', () => {
  const markup = html(
    createElement(RespondentFrame, { title: 'Project enquiry' }, 'Body'),
  );
  expect(headings(markup, 1)).toBe(1);
  expect(markup).toContain('Project enquiry');
  expect(markup).not.toMatch(/snapform home|better conversation/i);
  const links = markup.match(/<a [^>]+>/g) || [];
  expect(links).toHaveLength(3);
  for (const link of links) {
    expect(link).toContain('target="_blank"');
    expect(link).toContain('rel="noopener"');
  }
  expect(markup).toContain('Powered by Snapform');
  expect(markup).toContain('Report abuse');
  expect(markup).toContain('(opens in a new tab)');
});
it('marks only an embedded frame for the host page surface', () => {
  expect(html(createElement(RespondentFrame, { embed: true }))).toContain(
    'class="intake-shell intake-embed"',
  );
  expect(html(createElement(RespondentFrame, {}))).toContain(
    'class="intake-shell"',
  );
});
it('names a missing or closed form without sending the respondent away', () => {
  const missing = html(
    createElement(
      RespondentFrame,
      {},
      createElement(Unavailable, { closed: false }),
    ),
  );
  expect(headings(missing, 1)).toBe(1);
  expect(missing).toContain('This form isn’t available');
  expect(missing).toContain(
    'It may have been closed. If you need to reach the business, contact whoever sent you the link.',
  );
  expect(missing).not.toMatch(/back to snapform/i);
  const closed = html(createElement(Unavailable, { closed: true }));
  expect(closed).toContain('This form isn’t accepting responses right now');
  expect(closed).toContain('contact whoever sent you the link.');
});
it('explains the security check beside the start button', () => {
  const props = {
    title: 'Project enquiry',
    description: '',
    busy: false,
    onStart: none,
    onRetryCheck: none,
    onClear: none,
  };
  const checking = html(
    createElement(Welcome, { ...props, check: 'checking' }),
  );
  expect(headings(checking, 1)).toBe(1);
  expect(checking).toMatch(/<button[^>]*disabled=""[^>]*>Start<\/button>/);
  expect(checking).toContain('Checking your browser…');
  expect(checking).not.toMatch(/A CLEAR START|↗/);
  expect(checking).toMatch(
    /<details[\s\S]*Clear saved answers[\s\S]*<\/details>/,
  );
  const failed = html(createElement(Welcome, { ...props, check: 'failed' }));
  expect(failed).toContain('role="alert"');
  expect(failed).toContain('Try again');
  const ready = html(createElement(Welcome, { ...props, check: 'ready' }));
  expect(ready).not.toContain('disabled');
  expect(ready).not.toContain('Checking your browser');
});
it('names the business above the form title and keeps Snapform in the footer', () => {
  const steps = html(
    createElement(RespondentFrame, {
      business: 'Studio North',
      title: 'Project enquiry',
    }),
  );
  expect(steps).toMatch(
    /<header class="intake-bar"><p class="intake-business">Studio North<\/p><h1>Project enquiry<\/h1><\/header>/,
  );
  expect(headings(steps, 1)).toBe(1);
  expect(steps).toContain('Powered by Snapform');
  // The welcome screen shows the title itself, so the header names only the business.
  const welcome = html(
    createElement(RespondentFrame, { business: 'Studio North' }),
  );
  expect(welcome).toMatch(
    /<header class="intake-bar"><p class="intake-business">Studio North<\/p><\/header>/,
  );
  expect(headings(welcome, 1)).toBe(0);
  expect(
    html(createElement(RespondentFrame, { business: '<b>Studio</b>' })),
  ).toContain('&lt;b&gt;Studio&lt;/b&gt;');
  expect(html(createElement(RespondentFrame, {}))).not.toContain('<header');
});
it('tells respondents which business receives their answers', () => {
  const props = {
    title: 'Project enquiry',
    description: '',
    check: 'ready' as const,
    busy: false,
    onStart: none,
    onRetryCheck: none,
    onClear: none,
  };
  expect(
    html(createElement(Welcome, { ...props, business: 'Studio North' })),
  ).toContain('Your answers go to Studio North.');
  expect(html(createElement(Welcome, props))).toContain(
    'Your answers go to the business that shared this form.',
  );
  for (const business of ['Studio North Inc.', 'Yahoo!', 'Why Not?'])
    expect(html(createElement(Welcome, { ...props, business }))).toContain(
      `Your answers go to ${business}</p>`,
    );
});
it('titles the page with the form and business, or the generic title', () => {
  expect(documentTitle('Project enquiry', 'Studio North')).toBe(
    'Project enquiry · Studio North',
  );
  expect(documentTitle('Project enquiry', undefined)).toBe(
    'Your response · Snapform',
  );
  expect(documentTitle(undefined, 'Studio North')).toBe(
    'Your response · Snapform',
  );
});
it('gives a short reference and a way to start over after sending', () => {
  const sessionId = '3f9a1c2e-0b4d-4e8f-9a7b-112233445566';
  const markup = html(
    createElement(Receipt, {
      sessionId,
      ending: { title: 'Thank you', description: '' },
      onAnother: none,
      onClear: none,
    }),
  );
  expect(markup).toContain('Your reference');
  expect(markup).toContain('3F9A-1C2E');
  expect(markup).toContain('Keep it if you need to follow up.');
  expect(markup).not.toContain(sessionId);
  expect(markup).not.toMatch(/RESPONSE RECEIVED|has been saved/);
  expect(markup.match(/received|sent/gi)).toHaveLength(1);
  expect(markup).toContain('Submit another response');
  expect(markup).toMatch(
    /<details[\s\S]*Clear saved answers[\s\S]*<\/details>/,
  );
  expect(headings(markup, 1)).toBe(0);
  expect(markup).toMatch(/<h2[^>]*>Thank you<\/h2>/);
});
it('summarizes answers with labelled edit actions and sends after saving', () => {
  const sections = [
    {
      pageId: crypto.randomUUID(),
      title: 'Project',
      rows: [
        { id: 'a', label: 'Budget', answer: 'INR 5,000', stepIndex: 0 },
        { id: 'b', label: 'Context', answer: 'Not answered', stepIndex: 0 },
      ],
    },
  ];
  const props = {
    sections,
    status: 'waiting' as const,
    frozen: false,
    pendingSubmit: false,
    sending: false,
    onEdit: none,
    onBack: none,
    onSend: none,
  };
  const waiting = html(createElement(Review, props));
  expect(headings(waiting, 2)).toBe(1);
  expect(headings(waiting, 3)).toBe(1);
  expect(waiting).not.toMatch(/<(input|textarea)/);
  expect(waiting).toMatch(
    /Edit<span class="visually-hidden"> Budget<\/span><\/button>/,
  );
  expect(waiting).toContain('Not answered');
  expect(waiting).toMatch(/<button[^>]*type="button"[^>]*>Send response</);
  expect(waiting).not.toMatch(/disabled=""[^>]*>Send response/);
  const sending = html(createElement(Review, { ...props, sending: true }));
  expect(sending).toContain('Saving your answers…');
  const frozen = html(
    createElement(Review, {
      ...props,
      frozen: true,
      pendingSubmit: true,
      status: 'saving',
    }),
  );
  expect(frozen).not.toContain('>Edit<');
  expect(frozen).toContain('Sending…');
});
