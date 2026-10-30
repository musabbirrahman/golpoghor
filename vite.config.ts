import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

// Build-time bake for the homepage's first paint (LCP).
//
// The homepage's LCP element is the first Featured card's cover, but its URL
// only exists after JavaScript runs AND the story-list fetch resolves —
// that's the whole mobile LCP wait. This plugin fetches the public Featured
// stories once at build time and inlines them into index.html:
//   - window.__BAKED_FEATURED__: the Featured grid's data, used as React
//     Query initialData so the grid paints on first render instead of
//     waiting for the fetch (see src/lib/baked-featured.ts). The query
//     still refetches live data in the background, so freshness is
//     unchanged — the baked copy is only the first paint.
//   - a <link rel="preload"> for the first Featured cover's 440px public
//     thumbnail, so its bytes are already downloaded when the card renders.
//
// Build-time only (apply: 'build'): never runs in the browser or the dev
// server. Fail-safe by design: missing env, a failed fetch, or an empty
// result logs a warning and the build continues with no bake — the site
// then behaves exactly as before. Reads only the public Supabase URL and
// publishable anon key (the same values the browser bundle already ships);
// no secrets, no new service, no runtime cost.
const STORY_SELECT = '*,author:profiles!stories_author_id_fkey(*)'

function thumbSmPath(coverPath: string): string | null {
  // Mirrors src/lib/utils.ts thumbSmPath (same guards).
  if (coverPath.startsWith('data:') || coverPath.startsWith('demo:')) return null
  const slash = coverPath.indexOf('/')
  if (slash <= 0) return null
  const file = coverPath.slice(slash + 1)
  if (!file || file.startsWith('thumb-')) return null
  return `${coverPath.slice(0, slash)}/thumb-sm-${file}`
}

async function fetchBaked(base: string, key: string): Promise<{ stories: any[]; preload: string | null }> {
  const headers = { apikey: key, Authorization: `Bearer ${key}` }
  const params = (extra: string) =>
    `select=${encodeURIComponent(STORY_SELECT)}&status=in.(ongoing,complete)&${extra}&limit=4`
  const get = async (query: string) => {
    const res = await fetch(`${base}/rest/v1/stories?${query}`, {
      headers,
      signal: AbortSignal.timeout(15000),
    })
    if (!res.ok) throw new Error(`stories fetch ${res.status}`)
    return (await res.json()) as any[]
  }
  // Mirrors SupabaseProvider.listFeaturedStories(4): picks in position
  // order, then newest public stories fill any remaining slots.
  const picked = await get(params('featured_position=not.is.null&order=featured_position.asc&order=published_at.desc.nullslast'))
  const stories = [...picked]
  if (stories.length < 4) {
    const newest = await get(params('order=published_at.desc.nullslast'))
    const pickedIds = new Set(stories.map((s) => s.id))
    for (const s of newest) {
      if (stories.length >= 4) break
      if (!pickedIds.has(s.id)) stories.push(s)
    }
  }
  let preload: string | null = null
  const first = stories[0]
  if (first && typeof first.cover_path === 'string') {
    const sm = thumbSmPath(first.cover_path)
    if (sm) preload = `${base}/storage/v1/object/public/cover-thumbs/${sm}`
  }
  return { stories, preload }
}

function bakeHome(): Plugin {
  let baked: { stories: any[]; preload: string | null } | null = null
  return {
    name: 'golponeer-bake-home',
    apply: 'build',
    async buildStart() {
      const base = (process.env.VITE_SUPABASE_URL ?? '').replace(/\/$/, '')
      const key = process.env.VITE_SUPABASE_ANON_KEY ?? ''
      if (!base || !key) {
        console.warn('[bake-home] VITE_SUPABASE_URL/ANON_KEY missing — building without bake')
        return
      }
      try {
        baked = await fetchBaked(base, key)
        if (baked.stories.length === 0) {
          console.warn('[bake-home] no featured stories — building without bake')
          baked = null
          return
        }
        console.log(`[bake-home] baked ${baked.stories.length} featured stories${baked.preload ? ' + cover preload' : ''}`)
      } catch (e) {
        console.warn('[bake-home] fetch failed — building without bake:', e instanceof Error ? e.message : e)
        baked = null
      }
    },
    transformIndexHtml(html) {
      if (!baked) return html
      const tags: any[] = []
      if (baked.preload) {
        tags.push({
          tag: 'link',
          attrs: { rel: 'preload', as: 'image', href: baked.preload, fetchpriority: 'high' },
          injectTo: 'head',
        })
      }
      const json = JSON.stringify(baked.stories).replace(/</g, '\\u003c')
      tags.push({ tag: 'script', children: `window.__BAKED_FEATURED__=${json};`, injectTo: 'head' })
      return { html, tags }
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), bakeHome()],
})
