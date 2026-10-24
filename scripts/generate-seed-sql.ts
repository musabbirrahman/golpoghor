/**
 * Generates supabase/seed.sql from src/lib/demo-content.ts.
 * Run: node scripts/generate-seed-sql.ts
 */
import { writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { SEED_AUTHORS, SEED_STORIES } from "../src/lib/demo-content.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
const arr = (a: string[]) => `array[${a.map(q).join(", ")}]`;

function tiptapJson(paragraphs: string[]): string {
  return JSON.stringify({
    type: "doc",
    content: paragraphs.map((p) => ({
      type: "paragraph",
      content: [{ type: "text", text: p }],
    })),
  });
}

const words = (t: string) => t.split(/\s+/).filter(Boolean).length;

let sql = `-- GolpoGhor demo seed.
-- PREREQUISITE: matching auth.users rows must exist for the profile ids below.
-- Create them first (Supabase Dashboard > Authentication > Users, or Auth Admin API),
-- then run this file in the SQL editor. Every demo account uses the password
-- documented in README.md ("Demo accounts" section).
--
-- Local/dev shortcut (DO NOT run on production): uncomment the block below to
-- create the auth users directly with a known password hash.
--
--   insert into auth.users (id, email, encrypted_password, email_confirmed_at, raw_user_meta_data)
--   values
--     ('11111111-1111-4111-8111-111111111111', 'nusrat@golpoghor.demo',
--       crypt('golpoghor-demo-2026', gen_salt('bf')), now(), '{"display_name":"Nusrat Rahman"}'),
--     ('22222222-2222-4222-8222-222222222222', 'tanvir@golpoghor.demo',
--       crypt('golpoghor-demo-2026', gen_salt('bf')), now(), '{"display_name":"Tanvir Ahmed"}'),
--     ('33333333-3333-4333-8333-333333333333', 'moderator@golpoghor.demo',
--       crypt('golpoghor-demo-2026', gen_salt('bf')), now(), '{"display_name":"GolpoGhor Moderation"}')
--   on conflict (id) do nothing;
--
-- Generated from src/lib/demo-content.ts — do not edit by hand.

begin;

`;

// Profiles
for (const a of SEED_AUTHORS) {
  sql += `insert into public.profiles (id, username, display_name, bio, locale, role)
values (${q(a.id)}, ${q(a.username)}, ${q(a.display_name)}, ${q(a.bio)}, ${q(a.locale)}, ${q(a.role)})
on conflict (id) do update set username = excluded.username, display_name = excluded.display_name,
  bio = excluded.bio, locale = excluded.locale, role = excluded.role;\n`;
}

const authorId = (username: string) => SEED_AUTHORS.find((a) => a.username === username)!.id;

sql += "\n";

// Stories + chapters. Stagger publish dates for a lively "recent" shelf.
let dayOffset = 12;
for (const s of SEED_STORIES) {
  const storyId = randomUUID();
  const pub = s.status === "draft" ? "null" : `now() - interval '${dayOffset} days'`;
  dayOffset -= 2;
  sql += `insert into public.stories
  (id, author_id, title, slug, summary, language, genre, tags, status, content_notice, published_at, created_at,
   origin_type, original_author, pd_verified)
values
  (${q(storyId)}, ${q(authorId(s.author_username))}, ${q(s.title)}, ${q(s.slug)}, ${q(s.summary)},
   ${q(s.language)}, ${q(s.genre)}, ${arr(s.tags)}, ${q(s.status)}, ${q(s.content_notice)}, ${pub},
   now() - interval '${dayOffset + 6} days',
   ${s.origin_type ? q(s.origin_type) : "null"}, ${s.original_author ? q(s.original_author) : "null"}, ${s.pd_verified ? "true" : "false"})
on conflict (author_id, slug) do update set title = excluded.title, summary = excluded.summary,
  language = excluded.language, genre = excluded.genre, tags = excluded.tags, status = excluded.status,
  origin_type = excluded.origin_type, original_author = excluded.original_author, pd_verified = excluded.pd_verified;\n`;

  s.chapters.forEach((c, i) => {
    const bodyText = c.paragraphs.join("\n\n");
    const wc = words(bodyText);
    const cPub = c.status === "published" ? `now() - interval '${Math.max(dayOffset + i, 1)} days'` : "null";
    sql += `insert into public.chapters
  (id, story_id, title, slug, body_json, body_text, position, status, word_count, published_at)
values
  (${q(randomUUID())}, ${q(storyId)}, ${q(c.title)}, ${q(c.slug)}, ${q(tiptapJson(c.paragraphs))}::jsonb,
   ${q(bodyText)}, ${i}, ${q(c.status)}, ${wc}, ${cPub})
on conflict (story_id, slug) do update set title = excluded.title, body_json = excluded.body_json,
  body_text = excluded.body_text, status = excluded.status, word_count = excluded.word_count;\n`;
  });
  sql += "\n";
}

sql += "commit;\n";

writeFileSync(join(root, "supabase", "seed.sql"), sql);
console.log(`wrote supabase/seed.sql (${sql.length} chars)`);
