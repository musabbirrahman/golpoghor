-- History genre rename (2026-11-05): ইতিহাস -> ঐতিহাসিক.
-- The app code (lib/genres.ts) renamed the canonical genre value the same
-- day; this migration renames the stored values so a fresh database built
-- from migrations alone agrees with the code. Idempotent: on a database
-- where the rename already ran, it matches 0 rows.

update public.stories set genre = 'ঐতিহাসিক' where genre = 'ইতিহাস';
