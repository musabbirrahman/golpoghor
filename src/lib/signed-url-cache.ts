/**
 * Phase 1B: persisted signed-URL cache for cover images.
 *
 * Problem: Supabase mints a fresh signed URL on every createSignedUrl
 * call, so a new browser session gets different URLs for the same
 * cover and the browser cannot reuse its cached image. This module
 * persists minted URLs in localStorage (keyed by bucket + authorization
 * context + storage path) so return visits reuse the same URL until
 * it nears expiry, letting the browser revalidate (ETag) instead of
 * re-downloading.
 *
 * Security notes (per the Phase 1B brief):
 * - A signed URL is a bearer token: anyone holding one can fetch its
 *   object until expiry. localStorage is NOT a security boundary.
 * - Entries are keyed by authorization context ("anon" for signed-out
 *   viewers, else the user id). Anonymous signing only ever succeeds
 *   for public stories, so anon entries cannot expose private objects.
 * - Reuse does not bypass authorization: RLS is checked at mint time,
 *   and cards for non-public stories never render for other viewers,
 *   so a stale entry for an unpublished story is simply never used.
 * - This module never logs URLs and never stores credentials.
 * - All storage access is best-effort: any failure (disabled storage,
 *   corrupt entry, quota) falls back to "no cached URL" and the caller
 *   re-signs, preserving pre-1B behavior.
 */

export const SIGNED_URL_TTL_MS = 31536000 * 1000;
export const SIGNED_URL_REFRESH_MARGIN_MS = 7 * 24 * 3600 * 1000;
export const SIGNED_URL_CACHE_PREFIX = "gh:coverurl:v1";
export const SIGNED_URL_CACHE_MAX_ENTRIES = 500;

type Entry = { u: string; t: number };

type Store = {
  get(k: string): string | null;
  set(k: string, v: string): void;
  remove(k: string): void;
  keys(): string[];
};

const fallback = new Map<string, string>();

function store(): Store {
  try {
    const ls = (globalThis as { localStorage?: Storage }).localStorage;
    if (ls && typeof ls.getItem === "function") {
      return {
        get: (k) => {
          try {
            return ls.getItem(k);
          } catch {
            return null;
          }
        },
        set: (k, v) => {
          try {
            ls.setItem(k, v);
          } catch {
            /* quota/disabled: persistence is best-effort */
          }
        },
        remove: (k) => {
          try {
            ls.removeItem(k);
          } catch {
            /* ignore */
          }
        },
        keys: () => {
          try {
            const out: string[] = [];
            for (let i = 0; i < ls.length; i++) {
              const k = ls.key(i);
              if (k !== null) out.push(k);
            }
            return out;
          } catch {
            return [];
          }
        },
      };
    }
  } catch {
    /* fall through to the in-memory store */
  }
  return {
    get: (k) => fallback.get(k) ?? null,
    set: (k, v) => fallback.set(k, v),
    remove: (k) => fallback.delete(k),
    keys: () => [...fallback.keys()],
  };
}

export function signedUrlCacheKey(bucket: string, auth: string, path: string): string {
  return `${SIGNED_URL_CACHE_PREFIX}:${bucket}:${auth}:${encodeURIComponent(path)}`;
}

export function isFresh(savedAt: number, now: number): boolean {
  return (
    Number.isFinite(savedAt) &&
    savedAt > 0 &&
    savedAt <= now &&
    savedAt + SIGNED_URL_TTL_MS - SIGNED_URL_REFRESH_MARGIN_MS > now
  );
}

function parseEntry(raw: string | null): Entry | null {
  if (!raw) return null;
  try {
    const e = JSON.parse(raw) as Partial<Entry>;
    if (typeof e.u !== "string" || !/^https?:\/\//.test(e.u)) return null;
    if (typeof e.t !== "number" || !Number.isFinite(e.t)) return null;
    return { u: e.u, t: e.t };
  } catch {
    return null;
  }
}

export function readCachedUrl(
  bucket: string,
  auth: string,
  path: string,
  now: number = Date.now(),
): string | null {
  const e = parseEntry(store().get(signedUrlCacheKey(bucket, auth, path)));
  if (!e) return null;
  if (!isFresh(e.t, now)) return null;
  return e.u;
}

export function writeCachedUrl(
  bucket: string,
  auth: string,
  path: string,
  url: string,
  maxEntries: number = SIGNED_URL_CACHE_MAX_ENTRIES,
): void {
  const s = store();
  const key = signedUrlCacheKey(bucket, auth, path);
  s.set(key, JSON.stringify({ u: url, t: Date.now() }));
  // Cap: drop the oldest entries (never the one just written) so a
  // long-lived device cannot grow this cache without bound.
  try {
    const mine = s
      .keys()
      .filter((k) => k.startsWith(SIGNED_URL_CACHE_PREFIX + ":"))
      .map((k) => ({ k, e: parseEntry(s.get(k)) }))
      .filter((x): x is { k: string; e: Entry } => x.e !== null)
      .sort((a, b) => a.e.t - b.e.t);
    let over = mine.length - maxEntries;
    for (const x of mine) {
      if (over <= 0) break;
      if (x.k === key) continue;
      s.remove(x.k);
      over--;
    }
  } catch {
    /* pruning is best-effort */
  }
}

export function dropCachedUrl(bucket: string, auth: string, path: string): void {
  store().remove(signedUrlCacheKey(bucket, auth, path));
}

export function clearCachedUrls(): void {
  const s = store();
  for (const k of s.keys()) {
    if (k.startsWith(SIGNED_URL_CACHE_PREFIX + ":")) s.remove(k);
  }
}

export function countCachedUrls(): number {
  return store()
    .keys()
    .filter((k) => k.startsWith(SIGNED_URL_CACHE_PREFIX + ":")).length;
}
