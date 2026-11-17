import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { expect, it } from 'vitest';
import { resizeMessage } from './features/intake/embed';

// The shipped static file, run against a minimal stand-in for a host page.
const source = readFileSync(
  new URL('../public/embed.js', import.meta.url),
  'utf8',
);
const snapform = 'https://snapform.jacked.dev';
const publicId = '11111111-1111-4111-8111-111111111111';
type Frame = {
  title?: string;
  loading?: string;
  src?: string;
  style: Record<string, string>;
  contentWindow: object;
};
type Host = { dataset: Record<string, string>; frames: Frame[] };
const host = (dataset: Record<string, string>): Host => ({
  dataset,
  frames: [],
});
function embed(hosts: Host[], src = snapform + '/embed.js', loading = false) {
  const listeners: Record<string, ((event: unknown) => void)[]> = {};
  const listen = (type: string, listener: (event: unknown) => void) => {
    (listeners[type] ||= []).push(listener);
  };
  const document = {
    currentScript: { src },
    readyState: loading ? 'loading' : 'complete',
    querySelectorAll: () =>
      hosts.map((item) => ({
        dataset: item.dataset,
        append: (frame: Frame) => item.frames.push(frame),
      })),
    createElement: () => ({ style: {}, contentWindow: {} }),
    addEventListener: listen,
  };
  runInNewContext(source, { document, URL, addEventListener: listen });
  return {
    fire: (type: string, event: unknown = {}) =>
      listeners[type]?.forEach((listener) => listener(event)),
  };
}

it('stays a small static file', () => {
  expect(Buffer.byteLength(source)).toBeLessThan(2048);
});

it('creates one lazy, full-width, titled frame per valid form placeholder', () => {
  const plain = host({ snapform: publicId }),
    titled = host({ snapform: publicId, snapformTitle: 'Project enquiry' }),
    unsafe = host({ snapform: '../../login' }),
    empty = host({ snapform: '' });
  embed([plain, titled, unsafe, empty]);
  expect(plain.frames).toEqual([
    {
      title: 'Form',
      loading: 'lazy',
      src: `${snapform}/f/${publicId}?embed=1`,
      style: { display: 'block', width: '100%', height: '600px', border: '0' },
      contentWindow: {},
    },
  ]);
  expect(titled.frames[0].title).toBe('Project enquiry');
  expect(unsafe.frames).toEqual([]);
  expect(empty.frames).toEqual([]);
});

it('mounts placeholders parsed after it once, even if loaded twice', () => {
  const placeholder = host({ snapform: publicId });
  const page = embed([placeholder], undefined, true);
  page.fire('DOMContentLoaded');
  embed([placeholder]);
  expect(placeholder.frames).toHaveLength(1);
});

it('resizes only from its own Snapform frame and only to a sane height', () => {
  const first = host({ snapform: publicId }),
    second = host({ snapform: publicId });
  const page = embed([first, second]);
  const frame = first.frames[0];
  const send = (
    data: unknown,
    origin = snapform,
    source: object | null = frame.contentWindow,
  ) => page.fire('message', { data, origin, source });
  send(resizeMessage(612.4));
  expect(frame.style.height).toBe('613px');
  expect(second.frames[0].style.height).toBe('600px');
  send(resizeMessage(450), snapform, second.frames[0].contentWindow);
  expect(frame.style.height).toBe('613px');
  expect(second.frames[0].style.height).toBe('450px');
  for (const [data, origin, source] of [
    [resizeMessage(900), 'https://attacker.example', frame.contentWindow],
    [resizeMessage(900), 'https://snapform.jacked.dev.attacker.example'],
    [resizeMessage(900), snapform, {}],
    [resizeMessage(900), snapform, null],
    [{ type: 'other', height: 900 }],
    [{ type: 'snapform:resize', height: '900' }],
    [{ type: 'snapform:resize', height: Number.NaN }],
    [{ type: 'snapform:resize', height: Number.POSITIVE_INFINITY }],
    [{ type: 'snapform:resize', height: 0 }],
    [{ type: 'snapform:resize', height: -40 }],
    [{ type: 'snapform:resize', height: 20001 }],
    [null],
    ['snapform:resize'],
  ] as const)
    send(data, origin, source);
  expect(frame.style.height).toBe('613px');
  expect(second.frames[0].style.height).toBe('450px');
});

it('serves frames from the origin it was loaded from', () => {
  const local = host({ snapform: publicId });
  const page = embed([local], 'http://127.0.0.1:5173/embed.js');
  expect(local.frames[0].src).toBe(
    `http://127.0.0.1:5173/f/${publicId}?embed=1`,
  );
  const source = local.frames[0].contentWindow;
  page.fire('message', { data: resizeMessage(700), origin: snapform, source });
  expect(local.frames[0].style.height).toBe('600px');
  page.fire('message', {
    data: resizeMessage(700),
    origin: 'http://127.0.0.1:5173',
    source,
  });
  expect(local.frames[0].style.height).toBe('700px');
});

it('tells the host page only the form height', () => {
  expect(resizeMessage(812.2)).toEqual({
    type: 'snapform:resize',
    height: 813,
  });
  expect(Object.keys(resizeMessage(1))).toEqual(['type', 'height']);
});
