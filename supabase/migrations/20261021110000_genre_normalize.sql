-- GolpoNeer V4-14 (Decision D6): normalize legacy English genre values
-- onto the frozen canonical taxonomy (Bangla terms + 'general').
-- The app already groups aliases in code (lib/genres.ts); this migration
-- is data hygiene so raw values are canonical too. Idempotent.

update public.stories set genre = 'রহস্য'    where lower(genre) in ('mystery', 'thriller');
update public.stories set genre = 'রোমান্স'   where lower(genre) = 'romance';
update public.stories set genre = 'হরর'      where lower(genre) = 'horror';
update public.stories set genre = 'ইতিহাস'    where lower(genre) in ('history', 'historical');
update public.stories set genre = 'ফ্যান্টাসি'  where lower(genre) = 'fantasy';
update public.stories set genre = 'কবিতা'     where lower(genre) in ('poetry', 'poem', 'poems');
update public.stories set genre = 'সমকালীন'   where lower(genre) = 'contemporary';
update public.stories set genre = 'ছোটগল্প'   where lower(genre) in ('short story', 'short-story', 'short stories');
