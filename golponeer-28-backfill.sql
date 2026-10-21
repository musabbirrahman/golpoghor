-- GolpoNeer V4-28 backfill: attribution for the 17 live stories.
--
-- Source: GolpoGhor-Rights-Tracker-v3.1 (provenance rows GG-SL-*).
-- Every row is keyed by story id, so re-running this file is safe.
-- original_title is left NULL everywhere: the hosted title IS the
-- original title for all 17, and the story page hides a duplicate.
-- rights_evidence_ref is the tracker work id — audit linkage only,
-- never rendered, never a legal claim.
--
-- 1. risad's original: no extra fields, just the type.
update public.stories set origin_type = 'original'
  where id = '0f724120-1df4-4bff-a74a-000509e50d87';

-- 2. Tagore shorts (bn.wikisource.org texts).
update public.stories set origin_type = 'classic',
  original_author = 'রবীন্দ্রনাথ ঠাকুর',
  edition_source = 'bn.wikisource.org — গল্পগুচ্ছ (প্রথম খণ্ড), Visva-Bharati edition, 1950',
  publication_details = 'Sadhana magazine, 1892',
  rights_evidence_ref = 'GG-SL-001'
  where id = '54f38a8a-239d-44ad-b9b6-3b44804cbfd2';

update public.stories set origin_type = 'classic',
  original_author = 'রবীন্দ্রনাথ ঠাকুর',
  edition_source = 'bn.wikisource.org — গল্পগুচ্ছ (প্রথম খণ্ড), Visva-Bharati edition, 1950',
  publication_details = 'Hitabadi magazine, May 1891',
  rights_evidence_ref = 'GG-SL-002'
  where id = 'c92dde30-067b-4f82-ae03-f93f9eb3e3ee';

update public.stories set origin_type = 'classic',
  original_author = 'রবীন্দ্রনাথ ঠাকুর',
  edition_source = 'bn.wikisource.org — গল্পগুচ্ছ (প্রথম খণ্ড), Visva-Bharati edition, 1950',
  publication_details = 'Sadhana, 1893',
  rights_evidence_ref = 'GG-SL-003'
  where id = '563d7805-869c-43fe-af57-2593c09cbadd';

update public.stories set origin_type = 'classic',
  original_author = 'রবীন্দ্রনাথ ঠাকুর',
  edition_source = 'bn.wikisource.org — গল্প-দশক, 1895 edition',
  publication_details = 'Sadhana Patrika, Jul/Aug 1895',
  rights_evidence_ref = 'GG-SL-004'
  where id = '0ab5e31d-dd90-4682-905d-f734705f56f7';

update public.stories set origin_type = 'classic',
  original_author = 'রবীন্দ্রনাথ ঠাকুর',
  edition_source = 'bn.wikisource.org — গল্পগুচ্ছ (প্রথম খণ্ড), Visva-Bharati edition, 1950',
  publication_details = 'Sadhana Puja issue, 30 Sep 1893',
  rights_evidence_ref = 'GG-SL-005'
  where id = '7fb587e8-d0d8-4c98-b87d-68a71431a5eb';

-- 3. Novels (bn.wikisource.org texts; historical edition facts from tracker).
update public.stories set origin_type = 'classic',
  original_author = 'বঙ্কিমচন্দ্র চট্টোপাধ্যায়',
  edition_source = 'bn.wikisource.org',
  publication_details = 'Book, 1866',
  rights_evidence_ref = 'GG-SL-019'
  where id = 'df8e437c-226e-4188-a9cb-0e0fce30ac23';

update public.stories set origin_type = 'classic',
  original_author = 'বঙ্কিমচন্দ্র চট্টোপাধ্যায়',
  edition_source = 'bn.wikisource.org',
  publication_details = 'Book, 15 Dec 1882',
  rights_evidence_ref = 'GG-SL-020'
  where id = 'cd8f2829-7a60-493b-9330-ffef6fea166d';

update public.stories set origin_type = 'classic',
  original_author = 'বিভূতিভূষণ বন্দ্যোপাধ্যায়',
  edition_source = 'bn.wikisource.org',
  publication_details = 'Book, Nov 1929 (serialized in Desh, 1928–29)',
  rights_evidence_ref = 'GG-SL-015'
  where id = '8fe255ea-d2a8-4f20-a67d-1efbbd6eb431';

-- 4. English PD shorts (Project Gutenberg texts).
update public.stories set origin_type = 'classic',
  original_author = 'Saki (H. H. Munro)',
  edition_source = 'Project Gutenberg ebook #269 — Beasts and Super-Beasts (1914 John Lane edition)',
  publication_details = 'Westminster Gazette, Nov 1911',
  rights_evidence_ref = 'GG-SL-107'
  where id = '9e617bdf-c7b2-478d-9733-949657e9a699';

update public.stories set origin_type = 'classic',
  original_author = 'O. Henry',
  edition_source = 'Project Gutenberg ebook #7256',
  publication_details = 'New York Sunday World, Dec 1905',
  rights_evidence_ref = 'GG-SL-101'
  where id = 'fdd099f5-ae37-4b62-88b6-6791dd99a2fc';

update public.stories set origin_type = 'classic',
  original_author = 'Edgar Allan Poe',
  edition_source = 'Project Gutenberg ebook #2148 — Works of Edgar Allan Poe, Vol. 2',
  publication_details = 'The Pioneer, Jan 1843',
  rights_evidence_ref = 'GG-SL-106'
  where id = 'ef49b1ef-324f-4eb3-8f27-4b94f8561c7b';

update public.stories set origin_type = 'classic',
  original_author = 'O. Henry',
  edition_source = 'Project Gutenberg ebook #3707 — The Trimmed Lamp',
  publication_details = 'New York World, Oct 1905',
  rights_evidence_ref = 'GG-SL-102'
  where id = '0f48bf79-6a03-4f79-a9c5-b77256bc4d8b';

update public.stories set origin_type = 'classic',
  original_author = 'Anton Chekhov',
  edition_source = 'Project Gutenberg ebook #1732 — Garnett translation (1921), Tales of Chekhov Vol. IX',
  publication_details = 'Novoye Vremya, Jan 1889 (Russian original)',
  rights_evidence_ref = 'GG-SL-104'
  where id = '70848ec1-1b7d-4241-b8ad-5af318ffbcf5';

update public.stories set origin_type = 'classic',
  original_author = 'Ambrose Bierce',
  edition_source = 'Project Gutenberg ebook #375 — An Occurrence at Owl Creek',
  publication_details = 'San Francisco Examiner, Jul 1890',
  rights_evidence_ref = 'GG-SL-109'
  where id = 'b92e77ca-ccda-4b54-9b80-fec5e19cbb97b';

update public.stories set origin_type = 'classic',
  original_author = 'Leo Tolstoy',
  edition_source = 'Project Gutenberg ebook #6157 — What Men Live By, and Other Tales (Maude translation)',
  publication_details = '1886 (Russian original)',
  rights_evidence_ref = 'GG-SL-108'
  where id = 'd868ab8f-a2e8-4705-8f8d-f3f9c5b91d9d';

update public.stories set origin_type = 'classic',
  original_author = 'Arthur Conan Doyle',
  edition_source = 'Project Gutenberg ebook #48320 — Adventures of Sherlock Holmes',
  publication_details = 'Strand Magazine, Feb 1892',
  rights_evidence_ref = 'GG-SL-110'
  where id = '8e358e64-3c62-4130-8ed8-3ccb9b175092';

-- Verify: expect 17 rows with origin_type set, 16 classics + 1 original.
select origin_type, count(*) from public.stories
  where status in ('ongoing', 'complete') group by origin_type;
