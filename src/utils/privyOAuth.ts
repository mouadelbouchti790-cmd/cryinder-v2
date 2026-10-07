/**
 * Robust helpers for Privy Google OAuth callbacks.
 * Pure functions only — no React — so this file never trips Fast Refresh.
 */

export interface ActiveOAuthParams {
  code: string | null;
  state: string | null;
  hasCallback: boolean;
  /** True when duplicated / concatenated params were detected. */
  wasStacked: boolean;
}

/** Take the last non-empty token from a possibly concatenated value. */
function lastToken(raw: string | null): string | null {
  if (raw == null) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // Split on common concatenation artifacts: nested ? & # , ; and
  // embedded privy_oauth_* markers (double-redirect stacking).
  const parts = trimmed
    .split(/(?:[?&#,;]+|privy_oauth_(?:code|state)=)/)
    .map((s) => s.trim())
    .filter(Boolean);
  const last = parts.length > 0 ? parts[parts.length - 1] : null;
  if (!last) return null;
  try {
    // Values are URL-encoded once; a stacked value may be double-encoded.
    const once = decodeURIComponent(last);
    // If decoding reveals another nesting level, recurse one step.
    if (/[?&#]/.test(once) || once.includes('privy_oauth_')) {
      const inner = once
        .split(/(?:[?&#,;]+|privy_oauth_(?:code|state)=)/)
        .map((s) => s.trim())
        .filter(Boolean)
        .pop();
      return inner ?? once;
    }
    return once;
  } catch {
    return last;
  }
}

/** All raw occurrences of a key in search + hash (catches stacked redirects). */
function collectRaw(search: string, hash: string, key: string): string[] {
  const out: string[] = [];
  for (const src of [search, hash.replace(/^#/, '?')]) {
    if (!src) continue;
    try {
      const params = new URLSearchParams(src);
      out.push(...params.getAll(key));
    } catch {
      // Fall through to regex below.
    }
    // Regex catches values URLSearchParams might merge oddly.
    const re = new RegExp(`${key}=([^&#?]+)`, 'g');
    let m: RegExpExecArray | null;
    // Only add regex hits not already captured (avoids double counting).
    const seen = new Set(out);
    while ((m = re.exec(src)) !== null) {
      const v = m[1];
      if (!seen.has(v)) {
        out.push(v);
        seen.add(v);
      }
    }
  }
  return out;
}

/** Extract the active code/state, tolerating stacked duplicates. */
export function getActiveOAuthParams(
  search: string = typeof window === 'undefined' ? '' : window.location.search,
  hash: string = typeof window === 'undefined' ? '' : window.location.hash,
): ActiveOAuthParams {
  const rawCodes = collectRaw(search, hash, 'privy_oauth_code');
  const rawStates = collectRaw(search, hash, 'privy_oauth_state');
  const hasCallback =
    rawCodes.length > 0 ||
    rawStates.length > 0 ||
    /privy_oauth/.test(search) ||
    /privy_oauth/.test(hash);

  // wasStacked when: duplicate keys, or a single value containing nesting.
  const singleCodeNested =
    rawCodes.length === 1 &&
    (/privy_oauth_/.test(rawCodes[0]) || /[?&#,;]/.test(decodeURIComponentSafe(rawCodes[0])));
  const singleStateNested =
    rawStates.length === 1 &&
    (/privy_oauth_/.test(rawStates[0]) || /[?&#,;]/.test(decodeURIComponentSafe(rawStates[0])));

  const wasStacked =
    rawCodes.length > 1 || rawStates.length > 1 || singleCodeNested || singleStateNested;

  // Active = last occurrence (most recent redirect wins).
  const code = rawCodes.length > 0 ? lastToken(rawCodes[rawCodes.length - 1]) : null;
  const state = rawStates.length > 0 ? lastToken(rawStates[rawStates.length - 1]) : null;

  return { code, state, hasCallback, wasStacked };
}

function decodeURIComponentSafe(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/**
 * Collapse stacked duplicates to a single active code/state pair.
 * Runs synchronously BEFORE PrivyProvider mounts so the SDK only ever sees
 * one clean callback. Returns true when the URL was rewritten.
 */
export function dedupeOAuthUrl(): boolean {
  if (typeof window === 'undefined') return false;
  const { hasCallback, wasStacked, code, state } = getActiveOAuthParams();
  if (!hasCallback || !wasStacked) return false;
  try {
    const url = new URL(window.location.href);
    // Remove every privy_oauth_* key from query + hash, then re-add one clean pair.
    for (const key of Array.from(url.searchParams.keys())) {
      if (key.startsWith('privy_oauth')) url.searchParams.delete(key);
    }
    if (code) url.searchParams.set('privy_oauth_code', code);
    if (state) url.searchParams.set('privy_oauth_state', state);
    // Hash-stored callbacks (rare) are dropped after promotion to query.
    if (url.hash && /privy_oauth/.test(url.hash)) {
      url.hash = url.hash
        .split('&')
        .filter((p) => !p.includes('privy_oauth'))
        .join('&');
      if (url.hash === '&' || url.hash === '') url.hash = '';
    }
    window.history.replaceState({}, '', url.toString());
    return true;
  } catch {
    return false;
  }
}

/** Strip ALL privy_oauth_* params once processed. Returns true when rewritten. */
export function sanitizeOAuthUrl(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const url = new URL(window.location.href);
    let changed = false;
    for (const key of Array.from(url.searchParams.keys())) {
      if (key.startsWith('privy_oauth')) {
        url.searchParams.delete(key);
        changed = true;
      }
    }
    if (url.hash && /privy_oauth/.test(url.hash)) {
      const kept = url.hash
        .split('&')
        .filter((p) => !p.includes('privy_oauth'));
      const next = kept.join('&');
      if (next !== url.hash) {
        url.hash = next === '&' || next === '' ? '' : next;
        changed = true;
      }
    }
    if (changed) window.history.replaceState({}, '', url.toString());
    return changed;
  } catch {
    return false;
  }
}
