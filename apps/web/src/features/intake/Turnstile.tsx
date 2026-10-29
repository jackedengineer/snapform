import { useEffect, useRef, useState } from 'react';
type Widget = {
  render: (
    element: HTMLElement,
    options: {
      sitekey: string;
      action: string;
      theme: string;
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
}: {
  siteKey: string;
  onToken: (token: string) => void;
}) {
  const host = useRef<HTMLDivElement>(null),
    callback = useRef(onToken);
  callback.current = onToken;
  const [error, setError] = useState(false);
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
          callback: (token) => callback.current(token),
          'expired-callback': () => callback.current(''),
          'error-callback': () => {
            callback.current('');
            setError(true);
          },
        });
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
      if (id) window.turnstile?.remove(id);
    };
  }, [siteKey]);
  return (
    <>
      <div ref={host} />
      {error && (
        <p role="alert">
          The security check couldn’t load. Check your connection and reload to
          try again.
        </p>
      )}
    </>
  );
}
