import { useEffect, useImperativeHandle, useRef, type Ref } from "react";

/**
 * Cloudflare Turnstile (invisible) for signup / sign-in / password-reset.
 *
 * Careful-by-design:
 * - With no VITE_TURNSTILE_SITE_KEY configured this component renders
 *   nothing and every form behaves exactly as it did before this change,
 *   so deploying this pack alone changes nothing on the live site.
 * - With a key configured, each submit fetches a fresh token first. If no
 *   token can be obtained (script blocked, challenge failed, timeout) the
 *   form shows an error and does NOT submit — a submit without a token
 *   would fail server-side once Supabase's CAPTCHA toggle is on, so a
 *   silent doomed request is worse than a retry prompt.
 * - Tokens are single-use: executeAsync() resets the widget before every
 *   execute so each submit attempt gets a fresh token.
 */

type TurnstileApi = {
  render: (
    container: HTMLElement,
    options: {
      sitekey: string;
      size: "invisible";
      callback: (token: string) => void;
      "expired-callback": () => void;
      "error-callback": () => void;
    },
  ) => string;
  execute: (widgetId: string) => void;
  reset: (widgetId: string) => void;
  remove: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

export function getTurnstileSiteKey(): string | undefined {
  const key = (import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined)?.trim();
  return key ? key : undefined;
}

export function isCaptchaConfigured(): boolean {
  return getTurnstileSiteKey() !== undefined;
}

export type TurnstileHandle = {
  /** Resolve a fresh token, or null when no token could be obtained. */
  executeAsync: () => Promise<string | null>;
};

const SCRIPT_ID = "cf-turnstile-script";
const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
const EXECUTE_TIMEOUT_MS = 60000;

export function TurnstileWidget({ turnstileRef }: { turnstileRef: Ref<TurnstileHandle> }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const pendingRef = useRef<{ resolve: (token: string | null) => void } | null>(null);
  const siteKey = getTurnstileSiteKey();

  useEffect(() => {
    if (!siteKey) return;
    let cancelled = false;
    function render() {
      if (cancelled || !containerRef.current || !window.turnstile || widgetIdRef.current) return;
      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: siteKey as string,
        size: "invisible",
        callback: (token: string) => {
          const pending = pendingRef.current;
          pendingRef.current = null;
          pending?.resolve(token);
        },
        "expired-callback": () => {
          const pending = pendingRef.current;
          pendingRef.current = null;
          pending?.resolve(null);
        },
        "error-callback": () => {
          const pending = pendingRef.current;
          pendingRef.current = null;
          pending?.resolve(null);
        },
      });
    }
    if (window.turnstile) {
      render();
    } else {
      const existing = document.getElementById(SCRIPT_ID);
      if (existing) {
        existing.addEventListener("load", render, { once: true });
      } else {
        const script = document.createElement("script");
        script.id = SCRIPT_ID;
        script.src = SCRIPT_SRC;
        script.async = true;
        script.defer = true;
        script.onload = render;
        document.head.appendChild(script);
      }
    }
    return () => {
      cancelled = true;
      if (widgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {
          /* already gone */
        }
        widgetIdRef.current = null;
      }
    };
  }, [siteKey]);

  useImperativeHandle(
    turnstileRef,
    () => ({
      executeAsync(): Promise<string | null> {
        if (!siteKey) return Promise.resolve(null);
        const widgetId = widgetIdRef.current;
        if (!widgetId || !window.turnstile) return Promise.resolve(null);
        return new Promise((resolve) => {
          pendingRef.current = { resolve };
          try {
            window.turnstile!.reset(widgetId);
            window.turnstile!.execute(widgetId);
          } catch {
            pendingRef.current = null;
            resolve(null);
            return;
          }
          setTimeout(() => {
            if (pendingRef.current) {
              pendingRef.current = null;
              resolve(null);
            }
          }, EXECUTE_TIMEOUT_MS);
        });
      },
    }),
    [siteKey],
  );

  if (!siteKey) return null;
  return <div ref={containerRef} aria-hidden="true" />;
}
