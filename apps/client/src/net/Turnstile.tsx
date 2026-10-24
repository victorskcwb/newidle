import { useEffect, useRef } from 'react';
import { locale } from '../i18n.ts';

/**
 * Cloudflare Turnstile (anti-bot) for new accounts (decision 175). Off when the build has no
 * site key: the server then accepts every request, as it does without `TURNSTILE_SECRET`.
 */
export const TURNSTILE_SITE_KEY: string | undefined =
  import.meta.env.VITE_TURNSTILE_SITE_KEY || undefined;

interface TurnstileApi {
  render(
    el: HTMLElement,
    options: {
      sitekey: string;
      language: string;
      theme: 'dark';
      callback: (token: string) => void;
      'expired-callback': () => void;
      'error-callback': () => void;
    },
  ): string;
  reset(id: string): void;
  remove(id: string): void;
}

let script: Promise<TurnstileApi> | null = null;

function loadTurnstile(): Promise<TurnstileApi> {
  script ??= new Promise((resolve, reject) => {
    const el = document.createElement('script');
    el.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    el.async = true;
    el.onload = () => resolve((window as unknown as { turnstile: TurnstileApi }).turnstile);
    el.onerror = () => {
      script = null;
      reject(new Error('turnstile'));
    };
    document.head.appendChild(el);
  });
  return script;
}

/**
 * The widget. Reports a token when the check passes and `null` when it expires or fails. Each
 * token works once: change `resetKey` after every request to get a new one.
 */
export function Turnstile({
  onToken,
  resetKey,
}: {
  onToken: (token: string | null) => void;
  resetKey: number;
}) {
  const box = useRef<HTMLDivElement>(null);
  const widget = useRef<{ api: TurnstileApi; id: string } | null>(null);
  const report = useRef(onToken);
  report.current = onToken;

  useEffect(() => {
    const sitekey = TURNSTILE_SITE_KEY;
    if (!sitekey) return;
    let gone = false;
    loadTurnstile()
      .then((api) => {
        if (gone || !box.current) return;
        const id = api.render(box.current, {
          sitekey,
          language: locale === 'en' ? 'en' : 'pt-br',
          theme: 'dark',
          callback: (token) => report.current(token),
          'expired-callback': () => report.current(null),
          'error-callback': () => report.current(null),
        });
        widget.current = { api, id };
      })
      .catch(() => report.current(null));
    return () => {
      gone = true;
      if (widget.current) widget.current.api.remove(widget.current.id);
      widget.current = null;
    };
  }, []);

  useEffect(() => {
    if (resetKey === 0 || !widget.current) return;
    report.current(null);
    widget.current.api.reset(widget.current.id);
  }, [resetKey]);

  if (!TURNSTILE_SITE_KEY) return null;
  return <div ref={box} className="turnstile" />;
}
