# GolpoGhor — গল্পঘর

A home for stories, in two languages. A Bangladesh-focused platform for reading
and publishing stories in Bangla and English. MVP built per the GolpoGhor
Project Blueprint.

**Stack:** React + Vite + TypeScript · Tailwind CSS · React Router · TanStack
Query · Tiptap (chapter editor) · Supabase (Postgres + Auth + Storage)

## Quick start

```bash
npm install
npm run dev        # → http://localhost:5173 (demo mode, no credentials needed)
```

The app runs **without any credentials** in local demo mode: an in-browser data
layer (localStorage) seeds demo Bangla/English stories so every flow — signup,
writing, autosave, publishing, reading, comments, reports, moderation — can be
tried immediately. A gold banner marks demo mode.

### Demo accounts (demo mode only)

| Email | Password | Role |
|---|---|---|
| `nusrat@golpoghor.demo` | `golpoghor-demo-2026` | author (Bangla) |
| `tanvir@golpoghor.demo` | `golpoghor-demo-2026` | author (English) |
| `moderator@golpoghor.demo` | `golpoghor-demo-2026` | moderator |

Or sign up a fresh account — it works fully in demo mode.

## Connecting Supabase (production data)

1. Create a project at [supabase.com](https://supabase.com), then in the SQL
   editor run, in order:
   - `supabase/migrations/20261016090000_schema.sql`
   - `supabase/migrations/20261016090001_rls.sql`
   - `supabase/migrations/20261016090002_storage.sql`
   - `supabase/migrations/20261016130000_appeals_notifications.sql`
   - `supabase/migrations/20261016140000_story_views.sql`
   - `supabase/migrations/20261016140001_notification_hardening.sql`
   - `supabase/migrations/20261016140002_story_visibility.sql`
   - `supabase/migrations/20261016150000_role_guard_bootstrap.sql`
   - `supabase/migrations/20261016160000_story_is_public_definer.sql`
   - `supabase/migrations/20261016170000_notify_user_link_recipient_fix.sql`
   - `supabase/migrations/20261016170001_story_moderator_columns.sql`
   - `supabase/seed.sql` (optional demo content — create the matching auth
     users first; see the header comment in that file)
2. Authentication → URL Configuration: add your site URL and
   `http://localhost:5173/reset-password` as redirect URLs.
3. Copy `.env.example` to `.env` and set `VITE_SUPABASE_URL` and
   `VITE_SUPABASE_ANON_KEY` (the **anon** key only — never the service-role key).
4. Restart the dev server. The demo banner disappears; you're on real data.
5. Promote your first moderator/admin with direct SQL (service role bypasses
   RLS; the app can never self-promote):
   ```sql
   update public.profiles set role = 'admin' where username = 'your_username';
   ```

## Project layout

```
src/
  lib/            types.ts, utils.ts, i18n.ts (bn/en strings)
  lib/providers/  supabase-provider.ts, demo-provider.ts
  lib/            data-provider.ts  ← the single UI↔backend seam
                  provider.ts       ← picks Supabase or demo backend
                  app-context.tsx   ← session, profile, locale
  components/     ui.tsx, layout.tsx, story-card.tsx, report-dialog.tsx
  pages/          discovery.tsx (home/discover/search)
                  story.tsx (story detail, author page)
                  reader.tsx (chapter reader + comments)
                  library.tsx (reading list, follows, progress, settings)
                  write.tsx (dashboard, story form)
                  chapter-editor.tsx (Tiptap + autosave + publish)
                  admin.tsx (report queue + audit log)
                  auth.tsx
  styles/         index.css, fonts.css (self-hosted, OFL)
supabase/
  migrations/     schema, RLS policies, storage buckets
  seed.sql        demo content (generated — do not edit by hand)
scripts/
  generate-seed-sql.ts   regenerates supabase/seed.sql from src/lib/demo-content.ts
  validate-sql.mjs       structural checks for the migration SQL
```

## Data model & security

Tables: `profiles`, `stories`, `chapters`, `follows`, `reading_list`,
`reading_progress`, `likes`, `comments`, `reports`, `moderation_events`,
`appeals`, `notifications`.
Row-Level Security is enabled on **every** table; policies are deny-by-default:

- Public reads only published stories/chapters and visible comments.
- Owners have full control of their stories/chapters via ownership joins
  (chapter writes verify the parent story's `author_id`).
- Private data (reading list, progress, inbox) is strictly owner-only.
- Moderator actions are role-gated (`is_moderator()`), audited append-only in
  `moderation_events`, and role self-escalation is blocked by a trigger.
- Appeals: writers may file an appeal only for their own *hidden* content
  (enforced in RLS, not just the UI); only moderators can decide them, and
  deciding never restores content by itself.
- Notifications are created by the app as side effects of legitimate actions
  (chapter published, report filed/resolved, content hidden/restored, appeal
  submitted/decided). The insert policy lets any signed-in user write a row —
  an accepted MVP tradeoff; bodies render from fixed templates. For
  production, move creation into `SECURITY DEFINER` triggers so clients
  cannot forge notifications.
- Storage: public `covers` bucket (author-owned paths, 2 MB image limit),
  private `drafts` bucket (signed URLs only).

## Bilingual support

- UI strings fully translated (`src/lib/i18n.ts`); toggle বাংলা/EN in the header.
- Self-hosted fonts: Literata + Noto Serif Bengali for reading, Inter + Noto
  Sans Bengali for UI (all SIL Open Font License).
- Seed content exercises conjuncts, vowel signs, `।` dari, mixed Bangla/English
  ("weather app", "bus stop") and line wrapping in both editor and reader.

## Rendering choice (SSR)

The MVP is a client-rendered SPA. Public story/chapter pages are readable by
search engines via standard meta tags, but per-page server rendering was
deliberately deferred: the blueprint prioritizes the read/write loop, and
Supabase's indexed Postgres search covers discovery. If organic search becomes
the top acquisition channel, the next step is prerendering/SSR for the public
routes (`/`, `/discover`, `/stories/:user/:slug…`) — e.g. Vite SSR or a static
export of public pages — without changing the data layer.

## Moderation, appeals & notifications

- **Restore:** the moderator queue shows each target's current status and
  offers a confirmed Restore action for hidden stories, chapters and
  comments. Restoring returns content to its pre-hide visibility, logs an
  audited `restore_*` event, and notifies the author.
- **Appeals:** writers see a notice on hidden stories/chapters with a
  "Request review" flow (short reason). Appeals stay pending until a
  moderator approves or declines them with an optional note; approval does
  not auto-restore content.
- **Comment reports:** comments carry the same report flow as stories and
  chapters; the queue shows the comment with its story/chapter context.
- **Inbox:** the header bell (with unread badge) leads to `/inbox`.
  Notifications fire for new chapters from followed authors, report status
  changes, content hidden/restored, appeal submissions (moderators) and
  appeal decisions. Titles/bodies render from structured data in the
  reader's language; per-user toggles live in Settings. In-app only — no
  email or push. Notification creation is hardened: the permissive client
  insert is gone and the `notify_user()` trusted function (migration
  `20261016140001`) validates, per type, that the caller may send that
  notification.

## View counts & "Most viewed"

- A story view is counted **at most once per signed-in reader per story per
  day** (unique `(story_id, viewer_id, viewed_on)` row; denormalized
  `view_count` on the story). Guests are not tracked — no IP addresses are
  stored anywhere. Authors never count views on their own stories;
  drafts, hidden stories and unpublished stories never count.
- View counts show on story cards and the story detail page (compact
  formatting: 1.2k, 2.3M).
- Discover offers a **"Most viewed"** sort (tracked counts, newest-first
  tie-breaker); only publicly published stories are listed.

## Publishing requires a chapter

- A story **cannot be published until it has at least one published
  chapter** — enforced in the UI (the publish card explains what's needed
  and the button stays disabled) and in the data layer (both providers
  raise `noPublishedChapters`), plus a database trigger as a backstop.
- A story with zero published chapters is **not public**: it disappears
  from Discover, home shelves, search, author profiles and the reading
  list, and its URL returns "not found" to everyone except the owner. The
  status stays `ongoing`/`complete` — visibility is derived — and the story
  reappears automatically once a chapter is published again. If you
  unpublish the last published chapter, the editor warns you first. If a
  moderator hides the last published chapter, the writer's notification
  explains that the story left Discover and search.

## Scripts

```bash
npm run dev          # start dev server
npm run build        # typecheck + production build
npm run preview      # serve the production build
node scripts/generate-seed-sql.ts   # regenerate supabase/seed.sql
node scripts/validate-sql.mjs       # structural SQL checks
node scripts/test-demo-provider.mjs # 114 headless data-layer checks
node scripts/qa-browser.mjs         # end-to-end browser checks (see file header for setup)
```

## Known limitations (MVP)

- Email confirmation depends on Supabase Auth settings; demo mode skips it.
- Search uses `ilike` matching (title/summary/tags/author).
- Cover uploads in demo mode are stored as data URLs in the browser.
- No realtime updates, paid chapters, recommendations, or mobile apps — all
  listed as later phases in the blueprint. Notifications are in-app only
  (bell polls every 30 s); no email or push.
- Reading progress saves scroll ratio per chapter; exact "resume at paragraph"
  positioning is approximated by scroll percentage.
- The migrations have been executed inside a live Supabase project
  (2026-10-16/17) — all 11 run cleanly, and the publish gate, view dedup,
  self-view exclusion, role guard, notification hardening and moderator
  column restrictions were functionally verified. (An earlier version of the
  schema migration failed on live Supabase with 42P17 because of GIN
  expression indexes on `to_tsvector()`/`array_to_string()` — those unused
  indexes were removed; the app searches with `ilike`.)
