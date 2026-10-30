import type { Story } from "./types";

// Build-time bake (see the bake-home plugin in vite.config.ts): the deploy
// inlines the homepage's Featured stories into index.html as
// window.__BAKED_FEATURED__ so the Featured grid can paint on first render
// instead of waiting for the story-list fetch. The query still refetches
// live data in the background (staleTime 0 on that query), so freshness is
// unchanged — the baked copy is only the first paint. Anything malformed
// or absent falls back to the normal fetch path.
declare global {
  interface Window {
    __BAKED_FEATURED__?: unknown;
  }
}

export function getBakedFeatured(): Story[] | undefined {
  const raw = window.__BAKED_FEATURED__;
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  for (const s of raw as any[]) {
    if (!s || typeof s !== "object") return undefined;
    if (typeof s.id !== "string" || typeof s.slug !== "string" || typeof s.title !== "string") return undefined;
    if (typeof s.language !== "string" || typeof s.status !== "string") return undefined;
    if (s.cover_path !== null && typeof s.cover_path !== "string") return undefined;
    if (!s.author || typeof s.author.username !== "string" || typeof s.author.display_name !== "string") return undefined;
  }
  return raw as Story[];
}
