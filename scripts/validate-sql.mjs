/**
 * Lightweight structural validation of migration SQL (no Postgres available here).
 * Checks: balanced parens/brackets/dollar-quotes, statement keywords,
 * and a few project-specific invariants. Full execution happens against
 * a real Supabase project (see README.md).
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function checkBalance(sql, file) {
  const errors = [];
  let depth = 0,
    bdepth = 0,
    i = 0,
    line = 1;
  let inLine = false,
    inBlock = false,
    inDollar = false,
    inStr = false;
  const countNl = (s) => (s.match(/\n/g) || []).length;
  while (i < sql.length) {
    const c = sql[i],
      n2 = sql.slice(i, i + 2);
    if (c === "\n") line++;
    if (inLine) {
      if (c === "\n") inLine = false;
      i++;
      continue;
    }
    if (inBlock) {
      if (n2 === "*/") {
        i += 2;
        inBlock = false;
        continue;
      }
      i++;
      continue;
    }
    if (inDollar) {
      if (n2 === "$$") {
        i += 2;
        inDollar = false;
        continue;
      }
      i++;
      continue;
    }
    if (inStr) {
      if (c === "'") {
        if (sql[i + 1] === "'") i += 2;
        else {
          i++;
          inStr = false;
        }
        continue;
      }
      i++;
      continue;
    }
    if (n2 === "--") {
      inLine = true;
      i += 2;
      continue;
    }
    if (n2 === "/*") {
      inBlock = true;
      i += 2;
      continue;
    }
    if (n2 === "$$") {
      inDollar = true;
      i += 2;
      continue;
    }
    if (c === "'") {
      inStr = true;
      i++;
      continue;
    }
    if (c === "(") depth++;
    if (c === ")") {
      depth--;
      if (depth < 0) errors.push(`${file}:${line} unbalanced )`);
    }
    if (c === "[") bdepth++;
    if (c === "]") {
      bdepth--;
      if (bdepth < 0) errors.push(`${file}:${line} unbalanced ]`);
    }
    i++;
  }
  if (depth !== 0) errors.push(`${file}: unbalanced parens (depth ${depth})`);
  if (bdepth !== 0) errors.push(`${file}: unbalanced brackets`);
  if (inDollar) errors.push(`${file}: unterminated $$ block`);
  if (inStr) errors.push(`${file}: unterminated string`);
  if (inBlock) errors.push(`${file}: unterminated block comment`);
  return errors;
}

const files = [
  "supabase/migrations/20261016090000_schema.sql",
  "supabase/migrations/20261016090001_rls.sql",
  "supabase/migrations/20261016090002_storage.sql",
  "supabase/migrations/20261016130000_appeals_notifications.sql",
  "supabase/migrations/20261016140000_story_views.sql",
  "supabase/migrations/20261016140001_notification_hardening.sql",
  "supabase/migrations/20261016140002_story_visibility.sql",
  "supabase/migrations/20261016150000_role_guard_bootstrap.sql",
  "supabase/migrations/20261016160000_story_is_public_definer.sql",
  "supabase/migrations/20261016170000_notify_user_link_recipient_fix.sql",
  "supabase/migrations/20261016170001_story_moderator_columns.sql",
  "supabase/migrations/20261016180000_profile_on_signup.sql",
  "supabase/migrations/20261017190000_bangla_slug_check.sql",
  "supabase/migrations/20261017200000_tag_search.sql",
  "supabase/migrations/20261017210000_notification_prefs_table.sql",
  "supabase/migrations/20261017210001_cover_privacy.sql",
  "supabase/migrations/20261017210002_covers_bucket_private.sql",
  "supabase/migrations/20261018090000_progress_anchor.sql",
  "supabase/migrations/20261020220000_notify_user_respect_prefs.sql",
  "supabase/migrations/20261021090000_account_self_service.sql",
  "supabase/migrations/20261021100000_write_throttles.sql",
  "supabase/migrations/20261021110000_genre_normalize.sql",
  "supabase/migrations/20261021120000_avatars_bucket.sql",
  "supabase/seed.sql",
];

let failed = false;
for (const f of files) {
  const sql = readFileSync(join(root, f), "utf8");
  const errors = checkBalance(sql, f);

  // every table created in schema must have RLS enabled in the rls migration
  if (f.includes("90000_schema")) {
    const tables = [...sql.matchAll(/create table public\.(\w+)/g)].map((m) => m[1]);
    const rls = readFileSync(join(root, "supabase/migrations/20261016090001_rls.sql"), "utf8");
    for (const t of tables) {
      if (!new RegExp(`alter table public\\.${t}\\s+enable row level security`).test(rls))
        errors.push(`${f}: table ${t} has no ENABLE ROW LEVEL SECURITY`);
      if (!new RegExp(`on public\\.${t}\\b`).test(rls))
        errors.push(`${f}: table ${t} has no policy referencing it`);
    }
    // moderation_events must have no update/delete policy (append-only)
    const rlsPolicies = [...rls.matchAll(/create policy \w+ on public\.(\w+)\s+for (\w+)/g)];
    const meWrite = rlsPolicies.filter((m) => m[1] === "moderation_events");
    if (meWrite.some((m) => m[2] === "update" || m[2] === "delete"))
      errors.push("moderation_events must be append-only (no update/delete policy)");
    const meInsert = meWrite.filter((m) => m[2] === "insert");
    if (!meInsert.some((m) => /is_moderator/.test(rls.slice(rls.indexOf(m[0]), rls.indexOf(m[0]) + 400))))
      errors.push("moderation_events insert policy should require moderator role");
  }

  // appeals/notifications migration: tables it creates must get RLS + policies
  // in the same file, and appeals must stay append-only (no update/delete
  // policy for non-moderators; writers never update rows).
  if (f.includes("16130000_appeals_notifications")) {
    const tables = [...sql.matchAll(/create table public\.(\w+)/g)].map((m) => m[1]);
    for (const t of tables) {
      if (!new RegExp(`alter table public\\.${t}\\s+enable row level security`).test(sql))
        errors.push(`${f}: table ${t} has no ENABLE ROW LEVEL SECURITY`);
      if (!new RegExp(`on public\\.${t}\\b`).test(sql))
        errors.push(`${f}: table ${t} has no policy referencing it`);
    }
    if (!/appeals_one_pending_per_target/.test(sql))
      errors.push(`${f}: missing partial unique index for one pending appeal per target`);
    if (/for update using \(auth\.uid\(\) = author_id\)/.test(sql))
      errors.push(`${f}: writers must not be able to update appeal rows`);
  }

  // story_views: function-only table — reader records must never be directly
  // readable/writable, so no policies are created on purpose.
  if (f.includes("16140000_story_views")) {
    if (!/create table public\.story_views/.test(sql))
      errors.push(`${f}: missing story_views table`);
    if (!/FUNCTION_ONLY:story_views/.test(sql))
      errors.push(`${f}: missing FUNCTION_ONLY exemption marker`);
    if (!/security definer/.test(sql))
      errors.push(`${f}: record_story_view must be SECURITY DEFINER`);
    if (!/on conflict do nothing/.test(sql))
      errors.push(`${f}: expected ON CONFLICT DO NOTHING dedup`);
  }

  // notification hardening: permissive insert must be gone, function gated
  if (f.includes("16140001_notification_hardening")) {
    if (!/drop policy if exists notifications_insert/.test(sql))
      errors.push(`${f}: must drop the permissive notifications_insert policy`);
    if (!/security definer/.test(sql))
      errors.push(`${f}: notify_user must be SECURITY DEFINER`);
  }

  // visibility: story_is_public redefined with chapter check + publish gate
  if (f.includes("16140002_story_visibility")) {
    if (!/story_is_public/.test(sql) || !/c\.status = 'published'/.test(sql))
      errors.push(`${f}: story_is_public must require a published chapter`);
    if (!/stories_publish_gate/.test(sql))
      errors.push(`${f}: missing stories_publish_gate trigger`);
  }

  // schema: the 42P17-prone GIN indexes were removed (2026-10-16) after
  // verifying on real PostgreSQL 16 that to_tsvector('simple', ...) is
  // STABLE and array_to_string() is not IMMUTABLE. Fail if either creeps
  // back into an index expression.
  if (f.includes("090000_schema")) {
    const codeOnly = sql.replace(/--[^\n]*/g, "");
    if (/(?<!golpoghor_)to_tsvector\s*\(/i.test(codeOnly))
      errors.push(`${f}: to_tsvector() in an index expression fails with 42P17 on real Postgres`);
    if (/using\s+gin\s*\(/i.test(codeOnly))
      errors.push(`${f}: unexpected GIN expression index — FTS was removed, see file note`);
  }

  if (errors.length) {
    failed = true;
    console.log("FAIL", f);
    errors.forEach((e) => console.log("  -", e));
  } else {
    console.log("OK  ", f);
  }
}
process.exit(failed ? 1 : 0);
