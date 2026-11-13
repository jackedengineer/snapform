import { useEffect, useRef } from 'react';
type Widget = {
  render: (
    element: HTMLElement,
    options: {
      sitekey: string;
      action: string;
      theme: string;
      size: 'normal' | 'compact';
      callback: (token: string) => void;
      'expired-callback': () => void;
      'error-callback': () => void;
    },
  ) => string;
  remove: (id: string) => void;
};
declare global {
  interface Window {
    turnstile?: Widget;
  }
}
let script: Promise<void> | null = null;
function load() {
  if (window.turnstile) return Promise.resolve();
  if (!script)
    script = new Promise<void>((resolve, reject) => {
      const element = document.createElement('script');
      element.src =
        'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      element.async = true;
      element.defer = true;
      const timeout = setTimeout(
        () => reject(new Error('Security check timed out.')),
        15000,
      );
      element.onload = () => {
        clearTimeout(timeout);
        resolve();
      };
      element.onerror = () => {
        clearTimeout(timeout);
        script = null;
        element.remove();
        reject(new Error('Security check could not load.'));
      };
      document.head.appendChild(element);
    });
  return script;
}
export function Turnstile({
  siteKey,
  onToken,
  onError,
}: {
  siteKey: string;
  onToken: (token: string) => void;
  onError: () => void;
}) {
  const host = useRef<HTMLDivElement>(null),
    callback = useRef(onToken),
    failed = useRef(onError);
  callback.current = onToken;
  failed.current = onError;
  useEffect(() => {
    let active = true,
      id: string | undefined;
    void load()
      .then(() => {
        if (!active || !host.current || !window.turnstile) return;
        id = window.turnstile.render(host.current, {
          sitekey: siteKey,
          action: 'intake_start',
          theme: 'light',
          // The standard widget is 300px wide; narrow phones need the compact one.
          size: host.current.clientWidth < 300 ? 'compact' : 'normal',
          callback: (token) => callback.current(token),
          'expired-callback': () => callback.current(''),
          'error-callback': () => {
            callback.current('');
            failed.current();
          },
        });
      })
      .catch(() => {
        if (active) failed.current();
      });
    return () => {
      active = false;
      if (id) window.turnstile?.remove(id);
    };
  }, [siteKey]);
  return <div ref={host} className="intake-turnstile" />;
}
