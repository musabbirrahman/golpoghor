-- GolpoNeer: story sub-categories (Discover Phase 1 taxonomy).
--
-- A story keeps its ONE major genre and gains a sub-categories list,
-- picked from the fixed vocabulary in src/lib/subcategories.ts. The
-- vocabulary is one flat list grouped under majors for display only;
-- grouping never restricts picking, so the column carries no
-- major-matching rule — only membership in the vocabulary.
--
-- Backfill rule (Discover draft section 5c): every existing story keeps
-- its current major and starts with EMPTY sub-categories; authors (or
-- the owner, for classics) fill them in on edit. The Tell-Tale Heart's
-- panel therefore keeps showing only #Horror until it is sub-tagged.
--
-- No RLS change: the stories row policies already cover the table, and
-- a new column needs no policy of its own. Reads come through the
-- provider's `*` select, so no client query changes either.

alter table public.stories
  add column if not exists subcategories text[] not null default '{}';

-- Vocabulary guard: junk values can never reach the reader panels or
-- the filter. Adding a term later needs a migration that alters this
-- constraint — deliberate, so vocabulary changes stay reviewed.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'stories_subcategories_vocab_check'
  ) then
    alter table public.stories add constraint stories_subcategories_vocab_check
      check (subcategories <@ array[
        'detective', 'supernatural',
        'psychological', 'gothic',
        'warm-romance', 'tragic-romance',
        'war-conflict', 'freedom-struggle',
        'coming-of-age',
        'village-life', 'relationships', 'childhood',
        'human-nature', 'twist-irony', 'everyday-life',
        'epic', 'urban', 'dark',
        'lyric', 'narrative'
      ]::text[]);
  end if;
end $$;
