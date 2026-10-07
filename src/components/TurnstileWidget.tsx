import { useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from 'react';

// Cloudflare Turnstile adds a global `turnstile` object once its script loads.
declare global {
  interface Window {
    turnstile: {
      render: (
        container: string | HTMLElement,
        options: {
          sitekey: string;
          callback?: (token: string) => void;
          'expired-callback'?: () => void;
          'error-callback'?: () => void;
          theme?: 'light' | 'dark' | 'auto';
          size?: 'normal' | 'compact';
          appearance?: 'always' | 'execute' | 'interaction-only';
          retry?: 'auto' | 'never';
          'retry-interval'?: number;
        },
      ) => string;
      reset: (widgetId: string) => void;
      remove: (widgetId: string) => void;
      getResponse: (widgetId: string) => string | undefined;
      implicit?: unknown;
    };
  }
}

export interface TurnstileWidgetHandle {
  reset: () => void;
  getResponse: () => string | undefined;
}

interface TurnstileWidgetProps {
  sitekey: string;
  onVerify: (token: string) => void;
  onError?: () => void;
  onExpire?: () => void;
  theme?: 'light' | 'dark' | 'auto';
  size?: 'normal' | 'compact';
  appearance?: 'always' | 'execute' | 'interaction-only';
}

const TURNSTILE_SCRIPT_URL =
  'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

// Module-level singleton: all mounted widgets share one script load.
let turnstileScriptPromise: Promise<void> | null = null;

/**
 * Load the Turnstile script exactly once. Reuses an existing script tag
 * (or the global) when present instead of injecting a duplicate.
 */
function ensureTurnstileScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  if (turnstileScriptPromise) return turnstileScriptPromise;

  turnstileScriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      'script[src*="challenges.cloudflare.com/turnstile"]',
    );
    if (existing) {
      if (window.turnstile) {
        resolve();
        return;
      }
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener(
        'error',
        () => reject(new Error('Turnstile script failed to load')),
        { once: true },
      );
      return;
    }
    const script = document.createElement('script');
    script.src = TURNSTILE_SCRIPT_URL;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => {
      turnstileScriptPromise = null; // allow a later retry
      reject(new Error('Turnstile script failed to load'));
    };
    document.head.appendChild(script);
  });
  return turnstileScriptPromise;
}

/**
 * Explicit-rendered Cloudflare Turnstile widget.
 *
 * Uses the `execute` appearance by default: the widget runs its JS challenges
 * on mount but only shows a visual challenge to visitors it can't otherwise
 * classify. The `callback` fires once a token is available; the token is
 * cached in a ref AND forwarded to the parent, so it survives even if the
 * parent unmounts this widget immediately after verify.
 *
 * StrictMode safety: the widget ID lives in a ref, the second mount of a
 * StrictMode double-mount is a no-op while a widget is live, and teardown
 * is deferred to the next macrotask so a remount cancels it — the widget is
 * never torn down mid-challenge. A real unmount (no follow-up setup) still
 * removes the widget.
 *
 * The imperative handle lets the parent reset the widget after a failed
 * signup attempt (each token is single-use).
 */
const TurnstileWidget = forwardRef<TurnstileWidgetHandle, TurnstileWidgetProps>(
  function TurnstileWidget(
    {
      sitekey,
      onVerify,
      onError,
      onExpire,
      theme = 'dark',
      size = 'normal',
      appearance = 'execute',
    },
    ref,
  ) {
    // Narrow literal union types for the render call below.
    const themeVal: TurnstileWidgetProps['theme'] = theme;
    const sizeVal: TurnstileWidgetProps['size'] = size;
    const appearanceVal: TurnstileWidgetProps['appearance'] = appearance;
    const containerRef = useRef<HTMLDivElement>(null);
    // Widget ID in a ref (never state): survives StrictMode remounts and
    // is always safe to test before calling remove().
    const widgetIdRef = useRef<string | null>(null);
    // Last token delivered by onSuccess — captured before any unmount.
    const tokenRef = useRef<string | null>(null);
    // True while a live widget owns the container.
    const mountedRef = useRef(false);
    // Pending deferred teardown, cancellable by a remount.
    const teardownRef = useRef<number | null>(null);
    // Options the live widget was rendered with (rebuild on change).
    const renderedKeyRef = useRef<string | null>(null);
    const onVerifyRef = useRef(onVerify);
    const onErrorRef = useRef(onError);
    const onExpireRef = useRef(onExpire);

    // Keep callbacks fresh without re-rendering the widget.
    useEffect(() => {
      onVerifyRef.current = onVerify;
      onErrorRef.current = onError;
      onExpireRef.current = onExpire;
    }, [onVerify, onError, onExpire]);

    const safeRemove = useCallback(() => {
      // Claim the ID first so a second cleanup can never attempt to
      // remove the same widget twice ("Cannot find Widget ...").
      const widgetId = widgetIdRef.current;
      widgetIdRef.current = null;
      renderedKeyRef.current = null;
      tokenRef.current = null;
      if (!widgetId || !window.turnstile) return;
      try {
        window.turnstile.remove(widgetId);
      } catch {
        // Widget already gone — safe to ignore.
      }
    }, []);

    useImperativeHandle(ref, () => ({
      reset: () => {
        const widgetId = widgetIdRef.current;
        if (widgetId && window.turnstile) {
          try {
            window.turnstile.reset(widgetId);
          } catch {
            // Widget already gone — safe to ignore.
          }
        }
      },
      getResponse: () => {
        if (tokenRef.current) return tokenRef.current;
        const widgetId = widgetIdRef.current;
        if (widgetId && window.turnstile) {
          try {
            return window.turnstile.getResponse(widgetId) || undefined;
          } catch {
            return undefined;
          }
        }
        return undefined;
      },
    }));

    const renderWidget = useCallback(() => {
      const container = containerRef.current;
      if (!container || !window.turnstile) return;
      if (!container.isConnected) return;
      if (widgetIdRef.current) return; // already rendered

      widgetIdRef.current = window.turnstile.render(container, {
        sitekey,
        theme: themeVal,
        size: sizeVal,
        appearance: appearanceVal,
        retry: 'auto',
        'retry-interval': 8000,
        // Cache the token locally BEFORE forwarding: the parent unmounts
        // this widget right after verify, so the token must be captured
        // here first.
        callback: (token: string) => {
          tokenRef.current = token || null;
          onVerifyRef.current?.(token);
        },
        'error-callback': () => onErrorRef.current?.(),
        'expired-callback': () => {
          tokenRef.current = null;
          onExpireRef.current?.();
        },
      });
      renderedKeyRef.current = `${sitekey}|${themeVal}|${sizeVal}|${appearanceVal}`;
    }, [sitekey, themeVal, sizeVal, appearanceVal]);

    useEffect(() => {
      // A setup following a deferred teardown cancels it — this is the
      // StrictMode path (cleanup + setup run back-to-back in dev).
      if (teardownRef.current !== null) {
        window.clearTimeout(teardownRef.current);
        teardownRef.current = null;
      }
      const key = `${sitekey}|${themeVal}|${sizeVal}|${appearanceVal}`;
      if (mountedRef.current && widgetIdRef.current && renderedKeyRef.current === key) {
        return; // StrictMode second mount: widget already live, don't double-render.
      }
      if (widgetIdRef.current) safeRemove(); // options changed: rebuild
      mountedRef.current = true;

      let cancelled = false;
      ensureTurnstileScript().then(
        () => {
          if (!cancelled && mountedRef.current) renderWidget();
        },
        () => {
          if (!cancelled) onErrorRef.current?.();
        },
      );

      return () => {
        cancelled = true;
        // Defer teardown to the next macrotask. A StrictMode remount's
        // setup runs first and cancels this; a real unmount has no
        // follow-up setup, so the widget is removed then — never
        // mid-challenge, and never via a stale widget ID.
        // NOTE: window.clearTimeout (not the bare global) must pair with
        // window.setTimeout above — they are different timer systems in
        // non-browser runtimes (jsdom), where the bare clearTimeout would
        // silently fail to cancel.
        if (teardownRef.current !== null) window.clearTimeout(teardownRef.current);
        teardownRef.current = window.setTimeout(() => {
          teardownRef.current = null;
          mountedRef.current = false;
          safeRemove();
        }, 0);
      };
    }, [renderWidget, safeRemove, sitekey, themeVal, sizeVal, appearanceVal]);

    return <div ref={containerRef} data-testid="turnstile-widget" />;
  },
);

export default TurnstileWidget;
