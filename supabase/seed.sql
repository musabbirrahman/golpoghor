-- GolpoGhor demo seed.
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

insert into public.profiles (id, username, display_name, bio, locale, role)
values ('11111111-1111-4111-8111-111111111111', 'nusrat_rahman', 'Nusrat Rahman', 'ঢাকায় থাকি, বৃষ্টি ভালোবাসি। ছোটগল্প আর ধারাবাহিক লিখি — মূলত বাংলায়।', 'bn', 'reader')
on conflict (id) do update set username = excluded.username, display_name = excluded.display_name,
  bio = excluded.bio, locale = excluded.locale, role = excluded.role;
insert into public.profiles (id, username, display_name, bio, locale, role)
values ('22222222-2222-4222-8222-222222222222', 'tanvir_ahmed', 'Tanvir Ahmed', 'Writing about Old Dhaka — its lanes, its river, and the people who remember.', 'en', 'reader')
on conflict (id) do update set username = excluded.username, display_name = excluded.display_name,
  bio = excluded.bio, locale = excluded.locale, role = excluded.role;
insert into public.profiles (id, username, display_name, bio, locale, role)
values ('33333333-3333-4333-8333-333333333333', 'golpoghor_mods', 'GolpoGhor Moderation', 'Community moderation team. Report issues and we will look into them.', 'bn', 'moderator')
on conflict (id) do update set username = excluded.username, display_name = excluded.display_name,
  bio = excluded.bio, locale = excluded.locale, role = excluded.role;

insert into public.stories
  (id, author_id, title, slug, summary, language, genre, tags, status, content_notice, published_at, created_at)
values
  ('c2b1757a-9ddf-4f37-b4b0-d081c592e052', '11111111-1111-4111-8111-111111111111', 'বর্ষার চিঠি', 'borshar-chithi', 'দাদির রেখে যাওয়া নীল বইয়ের ভেতর একটা চিঠি — আর সেই চিঠির সূত্র ধরে মিনার খুঁজে পাওয়া এক অজানা গ্রামের ঠিকানা। বর্ষা, নদী আর স্মৃতির গল্প।',
   'bn', 'সমকালীন', array['বর্ষা', 'পরিবার', 'স্মৃতি', 'ধারাবাহিক'], 'ongoing', '', now() - interval '12 days',
   now() - interval '16 days')
on conflict (author_id, slug) do update set title = excluded.title, summary = excluded.summary,
  language = excluded.language, genre = excluded.genre, tags = excluded.tags, status = excluded.status;
insert into public.chapters
  (id, story_id, title, slug, body_json, body_text, position, status, word_count, published_at)
values
  ('e216f99f-aa11-4550-b8f0-b58aec784212', 'c2b1757a-9ddf-4f37-b4b0-d081c592e052', 'নীল খাম', 'nil-kham', '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"বৃষ্টি এল শেষ বাসটা যাওয়ার আগেই। শহরের কিনারাগুলো নরম হয়ে এল জলের ছোঁয়ায়, আর ছাদের ওপর দাঁড়িয়ে মিনা দেখল — আকাশটা কেমন ধূসর কাগজের মতো ভিজে গেছে।"}]},{"type":"paragraph","content":[{"type":"text","text":"দাদির পুরনো নীল বইটা সে হাতে নিয়েছিল সকালে, মায়ের আলমারি গোছাতে গিয়ে। পাতাগুলো হলদে হয়ে এসেছে, কিনারায় কালি ছড়িয়ে গেছে বৃষ্টির মতোই। আর ঠিক মাঝখানের পাতায় — একটা নীল খাম, সযত্নে ভাঁজ করা।"}]},{"type":"paragraph","content":[{"type":"text","text":"“মিনা,” খামের ওপর দাদির হাতের লেখা, কাঁপা কাঁপা অক্ষরে, “নদী যখন ফুলে উঠবে, তখন ফিরে এসো।”"}]},{"type":"paragraph","content":[{"type":"text","text":"মিনা চিঠিটা পড়ল তিনবার। বাইরে তখন ঝমঝম শব্দে বৃষ্টি পড়ছে টিনের চালে, আর তার মনে হলো — দাদি যেন এই মুহূর্তটার জন্যই অপেক্ষা করে ছিলেন। গ্রামের বাড়ি, বুড়িগঙ্গার পার, আর সেই অজানা ঠিকানা — সবকিছু হঠাৎ করেই খুব জরুরি মনে হতে লাগল।"}]},{"type":"paragraph","content":[{"type":"text","text":"সে ফোনটা হাতে নিল। স্ক্রিনে ভেসে উঠল weather app-এর পূর্বাভাস: আগামী সাত দিন ভারী বর্ষণ। মিনা হেসে ফেলল — দাদি ঠিকই বলতেন, “প্রকৃতির নিজস্ব ক্যালেন্ডার আছে, মা।”"}]}]}'::jsonb,
   'বৃষ্টি এল শেষ বাসটা যাওয়ার আগেই। শহরের কিনারাগুলো নরম হয়ে এল জলের ছোঁয়ায়, আর ছাদের ওপর দাঁড়িয়ে মিনা দেখল — আকাশটা কেমন ধূসর কাগজের মতো ভিজে গেছে।

দাদির পুরনো নীল বইটা সে হাতে নিয়েছিল সকালে, মায়ের আলমারি গোছাতে গিয়ে। পাতাগুলো হলদে হয়ে এসেছে, কিনারায় কালি ছড়িয়ে গেছে বৃষ্টির মতোই। আর ঠিক মাঝখানের পাতায় — একটা নীল খাম, সযত্নে ভাঁজ করা।

“মিনা,” খামের ওপর দাদির হাতের লেখা, কাঁপা কাঁপা অক্ষরে, “নদী যখন ফুলে উঠবে, তখন ফিরে এসো।”

মিনা চিঠিটা পড়ল তিনবার। বাইরে তখন ঝমঝম শব্দে বৃষ্টি পড়ছে টিনের চালে, আর তার মনে হলো — দাদি যেন এই মুহূর্তটার জন্যই অপেক্ষা করে ছিলেন। গ্রামের বাড়ি, বুড়িগঙ্গার পার, আর সেই অজানা ঠিকানা — সবকিছু হঠাৎ করেই খুব জরুরি মনে হতে লাগল।

সে ফোনটা হাতে নিল। স্ক্রিনে ভেসে উঠল weather app-এর পূর্বাভাস: আগামী সাত দিন ভারী বর্ষণ। মিনা হেসে ফেলল — দাদি ঠিকই বলতেন, “প্রকৃতির নিজস্ব ক্যালেন্ডার আছে, মা।”', 0, 'published', 145, now() - interval '10 days')
on conflict (story_id, slug) do update set title = excluded.title, body_json = excluded.body_json,
  body_text = excluded.body_text, status = excluded.status, word_count = excluded.word_count;
insert into public.chapters
  (id, story_id, title, slug, body_json, body_text, position, status, word_count, published_at)
values
  ('0e749f32-c152-486f-8068-c73684458492', 'c2b1757a-9ddf-4f37-b4b0-d081c592e052', 'ছাদের ঘর', 'chhader-ghor', '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"ছাদের ছোট্ট ঘরটায় দাদির জিনিসপত্র এখনো সাজানো — একটা কাঠের সিন্দুক, তাতে পুরনো শাড়ির ভাঁজে ভাঁজে লুকিয়ে রাখা চিঠির তোড়া। মিনা একটা একটা করে খুলতে লাগল।"}]},{"type":"paragraph","content":[{"type":"text","text":"প্রতিটা চিঠিই অসমাপ্ত। কোনোটায় শুধু সম্বোধন — “প্রিয় রহিমা,” — তারপর শূন্যতা। কোনোটায় দু-লাইন লেখার পর কালি শুকিয়ে গেছে মাঝপথে, যেন লেখক হঠাৎ উঠে গেছেন আর ফেরেননি।"}]},{"type":"paragraph","content":[{"type":"text","text":"সবচেয়ে পুরনো চিঠিটার তারিখ: ১৯৮৩ সালের শ্রাবণ মাস। “আজ নদীতে জোয়ার এসেছে। তোমার কথা খুব মনে পড়ছে। জ্ঞান হওয়ার পর এই প্রথম এত দূরে আছি…” — এখানেই থেমে গেছে লেখা।"}]},{"type":"paragraph","content":[{"type":"text","text":"মিনার বুকটা ধড়ফড় করে উঠল। রহিমা — এই নামটা সে আগে কখনো শোনেনি। দাদির বোন? বান্ধবী? নাকি… অন্য কেউ? প্রশ্নগুলো বৃষ্টির ফোঁটার মতো জমতে লাগল তার মনে।"}]},{"type":"paragraph","content":[{"type":"text","text":"সিন্দুকের তলায়, একটা লাল কাপড়ে মোড়ানো — একটা ছোট্ট নৌকার মডেল, কাঠের তৈরি। তার গায়ে খোদাই করা: “ক্ষণিকের জন্য নয়, চিরদিনের জন্য।”"}]}]}'::jsonb,
   'ছাদের ছোট্ট ঘরটায় দাদির জিনিসপত্র এখনো সাজানো — একটা কাঠের সিন্দুক, তাতে পুরনো শাড়ির ভাঁজে ভাঁজে লুকিয়ে রাখা চিঠির তোড়া। মিনা একটা একটা করে খুলতে লাগল।

প্রতিটা চিঠিই অসমাপ্ত। কোনোটায় শুধু সম্বোধন — “প্রিয় রহিমা,” — তারপর শূন্যতা। কোনোটায় দু-লাইন লেখার পর কালি শুকিয়ে গেছে মাঝপথে, যেন লেখক হঠাৎ উঠে গেছেন আর ফেরেননি।

সবচেয়ে পুরনো চিঠিটার তারিখ: ১৯৮৩ সালের শ্রাবণ মাস। “আজ নদীতে জোয়ার এসেছে। তোমার কথা খুব মনে পড়ছে। জ্ঞান হওয়ার পর এই প্রথম এত দূরে আছি…” — এখানেই থেমে গেছে লেখা।

মিনার বুকটা ধড়ফড় করে উঠল। রহিমা — এই নামটা সে আগে কখনো শোনেনি। দাদির বোন? বান্ধবী? নাকি… অন্য কেউ? প্রশ্নগুলো বৃষ্টির ফোঁটার মতো জমতে লাগল তার মনে।

সিন্দুকের তলায়, একটা লাল কাপড়ে মোড়ানো — একটা ছোট্ট নৌকার মডেল, কাঠের তৈরি। তার গায়ে খোদাই করা: “ক্ষণিকের জন্য নয়, চিরদিনের জন্য।”', 1, 'published', 132, now() - interval '11 days')
on conflict (story_id, slug) do update set title = excluded.title, body_json = excluded.body_json,
  body_text = excluded.body_text, status = excluded.status, word_count = excluded.word_count;
insert into public.chapters
  (id, story_id, title, slug, body_json, body_text, position, status, word_count, published_at)
values
  ('e6f58ea2-0f18-4223-8c6e-86781cbc7f3e', 'c2b1757a-9ddf-4f37-b4b0-d081c592e052', 'নদীর ডাক', 'nodir-dak', '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"পরদিন ভোরে মিনা বেরিয়ে পড়ল। লঞ্চঘাটে পৌঁছতেই দেখল — নদী ফুলে উঠেছে, ঠিক দাদির চিঠিতে লেখা মতো। ঘোলা জলে ভাসছে কচুরিপানা, আর দূরে মেঘের আড়ালে সূর্য উঁকি দিচ্ছে।"}]},{"type":"paragraph","content":[{"type":"text","text":"যাত্রাপথে পাশের সিটের বৃদ্ধা জিজ্ঞেস করলেন, “কোথায় যাচ্ছ মা?” মিনা ঠিকানাটা দেখাল — একটা গ্রামের নাম, যা গুগল ম্যাপেও ঠিকমতো পাওয়া যায় না। বৃদ্ধা হেসে বললেন, “ওই গ্রামে তো এখন কেউ থাকে না। শুধু বর্ষায় নদীটা ফিরে আসে।”"}]},{"type":"paragraph","content":[{"type":"text","text":"“কেউ থাকে না?”"}]},{"type":"paragraph","content":[{"type":"text","text":"“একজন থাকেন। রহিমা বেগম। চল্লিশ বছর ধরে একা। সবাই বলে, তিনি কারো অপেক্ষায় আছেন।”"}]},{"type":"paragraph","content":[{"type":"text","text":"মিনার হাত কাঁপতে লাগল। ব্যাগের ভেতর নীল খামটা ভারী মনে হলো — যেন চল্লিশ বছরের অপেক্ষা তার কাঁধে চেপে বসেছে। নদীর ঢেউয়ের শব্দে সে শুনতে পেল দাদির গলা: “দেরি কোরো না, মা। কিছু চিঠির উত্তর প্রজন্ম পেরিয়ে দিতে হয়।”"}]}]}'::jsonb,
   'পরদিন ভোরে মিনা বেরিয়ে পড়ল। লঞ্চঘাটে পৌঁছতেই দেখল — নদী ফুলে উঠেছে, ঠিক দাদির চিঠিতে লেখা মতো। ঘোলা জলে ভাসছে কচুরিপানা, আর দূরে মেঘের আড়ালে সূর্য উঁকি দিচ্ছে।

যাত্রাপথে পাশের সিটের বৃদ্ধা জিজ্ঞেস করলেন, “কোথায় যাচ্ছ মা?” মিনা ঠিকানাটা দেখাল — একটা গ্রামের নাম, যা গুগল ম্যাপেও ঠিকমতো পাওয়া যায় না। বৃদ্ধা হেসে বললেন, “ওই গ্রামে তো এখন কেউ থাকে না। শুধু বর্ষায় নদীটা ফিরে আসে।”

“কেউ থাকে না?”

“একজন থাকেন। রহিমা বেগম। চল্লিশ বছর ধরে একা। সবাই বলে, তিনি কারো অপেক্ষায় আছেন।”

মিনার হাত কাঁপতে লাগল। ব্যাগের ভেতর নীল খামটা ভারী মনে হলো — যেন চল্লিশ বছরের অপেক্ষা তার কাঁধে চেপে বসেছে। নদীর ঢেউয়ের শব্দে সে শুনতে পেল দাদির গলা: “দেরি কোরো না, মা। কিছু চিঠির উত্তর প্রজন্ম পেরিয়ে দিতে হয়।”', 2, 'published', 122, now() - interval '12 days')
on conflict (story_id, slug) do update set title = excluded.title, body_json = excluded.body_json,
  body_text = excluded.body_text, status = excluded.status, word_count = excluded.word_count;
insert into public.chapters
  (id, story_id, title, slug, body_json, body_text, position, status, word_count, published_at)
values
  ('64943856-abd3-4e8d-9928-c885be9d815d', 'c2b1757a-9ddf-4f37-b4b0-d081c592e052', 'খসড়া: ফেরার পথ', 'khosra-pata', '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"এই অধ্যায়টি এখনো লেখা হচ্ছে… (লেখকের খসড়া — পাঠকের জন্য দৃশ্যমান নয়)"}]},{"type":"paragraph","content":[{"type":"text","text":"রহিমা বেগমের উঠোনে পা রাখতেই মিনা বুঝতে পারল — গল্পটা এখানেই শেষ নয়, শুরু।"}]}]}'::jsonb,
   'এই অধ্যায়টি এখনো লেখা হচ্ছে… (লেখকের খসড়া — পাঠকের জন্য দৃশ্যমান নয়)

রহিমা বেগমের উঠোনে পা রাখতেই মিনা বুঝতে পারল — গল্পটা এখানেই শেষ নয়, শুরু।', 3, 'draft', 26, null)
on conflict (story_id, slug) do update set title = excluded.title, body_json = excluded.body_json,
  body_text = excluded.body_text, status = excluded.status, word_count = excluded.word_count;

insert into public.stories
  (id, author_id, title, slug, summary, language, genre, tags, status, content_notice, published_at, created_at)
values
  ('3350b22a-5e5c-453c-be3c-b78652d238cf', '22222222-2222-4222-8222-222222222222', 'A Map of Old Dhaka', 'a-map-of-old-dhaka', 'An archivist inherits a hand-drawn map of 19th-century Dhaka — with one lane that doesn''t exist on any modern survey. A slow mystery through Shankhari Bazar, the river ghats, and the city''s living memory.',
   'en', 'Mystery', array['dhaka', 'history', 'mystery', 'serial'], 'ongoing', '', now() - interval '10 days',
   now() - interval '14 days')
on conflict (author_id, slug) do update set title = excluded.title, summary = excluded.summary,
  language = excluded.language, genre = excluded.genre, tags = excluded.tags, status = excluded.status;
insert into public.chapters
  (id, story_id, title, slug, body_json, body_text, position, status, word_count, published_at)
values
  ('9eb40889-1069-4d0b-b0c0-b861de049e95', '3350b22a-5e5c-453c-be3c-b78652d238cf', 'The Brass Key', 'the-brass-key', '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"The map arrived on a Tuesday, folded inside my grandfather''s survey ledger — all brass corners and mildew, smelling faintly of the Buriganga at low tide. I almost threw it out with the water-damaged field notes."}]},{"type":"paragraph","content":[{"type":"text","text":"It showed Old Dhaka as it was in 1873: the ghats numbered in careful ink, the mohallas shaded in watercolour, Shankhari Bazar marked with a tiny conch shell. My grandfather''s hand, unmistakable — he had drawn half the municipal maps of this city before the war."}]},{"type":"paragraph","content":[{"type":"text","text":"But there was a fourteenth lane off Islampur Road. I counted three times. Fourteen lanes, when every survey — British, Pakistani, Bangladeshi — lists thirteen."}]},{"type":"paragraph","content":[{"type":"text","text":"Taped to the back of the map was a brass key, green with age, and a note in his shorthand: “For the house that remembers. Go at dusk, when the azan carries across the water.”"}]},{"type":"paragraph","content":[{"type":"text","text":"I am an archivist. I catalogue other people''s certainties for a living. That evening, against every professional instinct I own, I put the key in my pocket and walked toward the river."}]}]}'::jsonb,
   'The map arrived on a Tuesday, folded inside my grandfather''s survey ledger — all brass corners and mildew, smelling faintly of the Buriganga at low tide. I almost threw it out with the water-damaged field notes.

It showed Old Dhaka as it was in 1873: the ghats numbered in careful ink, the mohallas shaded in watercolour, Shankhari Bazar marked with a tiny conch shell. My grandfather''s hand, unmistakable — he had drawn half the municipal maps of this city before the war.

But there was a fourteenth lane off Islampur Road. I counted three times. Fourteen lanes, when every survey — British, Pakistani, Bangladeshi — lists thirteen.

Taped to the back of the map was a brass key, green with age, and a note in his shorthand: “For the house that remembers. Go at dusk, when the azan carries across the water.”

I am an archivist. I catalogue other people''s certainties for a living. That evening, against every professional instinct I own, I put the key in my pocket and walked toward the river.', 0, 'published', 174, now() - interval '8 days')
on conflict (story_id, slug) do update set title = excluded.title, body_json = excluded.body_json,
  body_text = excluded.body_text, status = excluded.status, word_count = excluded.word_count;
insert into public.chapters
  (id, story_id, title, slug, body_json, body_text, position, status, word_count, published_at)
values
  ('ecff849a-badf-4e9c-9ebf-65945a7abace', '3350b22a-5e5c-453c-be3c-b78652d238cf', 'Lane Fourteen', 'lane-fourteen', '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Islampur Road at dusk is a study in organized chaos — rickshaw bells, the smell of frying puri, children chasing a punctured football between trucks. I walked it twice before I saw the gap."}]},{"type":"paragraph","content":[{"type":"text","text":"Between a shuttered printing press and a tea stall, barely wider than a doorway, a passage fell away into shadow. No signboard. The GPS on my phone insisted it was the wall of a warehouse."}]},{"type":"paragraph","content":[{"type":"text","text":"The brass key turned in a lock I could not see until my fingers found it — a door set flush into the brick, painted the exact colour of dust. It opened onto a courtyard where a krishnachura tree was dropping its red flowers onto stones worn smooth by centuries of feet."}]},{"type":"paragraph","content":[{"type":"text","text":"“You''re late,” said a voice behind me. “Your grandfather was always late too.”"}]},{"type":"paragraph","content":[{"type":"text","text":"An old woman sat shelling peas in the last light, as if visitors with impossible keys arrived every evening. Perhaps, in this lane, they did."}]}]}'::jsonb,
   'Islampur Road at dusk is a study in organized chaos — rickshaw bells, the smell of frying puri, children chasing a punctured football between trucks. I walked it twice before I saw the gap.

Between a shuttered printing press and a tea stall, barely wider than a doorway, a passage fell away into shadow. No signboard. The GPS on my phone insisted it was the wall of a warehouse.

The brass key turned in a lock I could not see until my fingers found it — a door set flush into the brick, painted the exact colour of dust. It opened onto a courtyard where a krishnachura tree was dropping its red flowers onto stones worn smooth by centuries of feet.

“You''re late,” said a voice behind me. “Your grandfather was always late too.”

An old woman sat shelling peas in the last light, as if visitors with impossible keys arrived every evening. Perhaps, in this lane, they did.', 1, 'published', 159, now() - interval '9 days')
on conflict (story_id, slug) do update set title = excluded.title, body_json = excluded.body_json,
  body_text = excluded.body_text, status = excluded.status, word_count = excluded.word_count;

insert into public.stories
  (id, author_id, title, slug, summary, language, genre, tags, status, content_notice, published_at, created_at)
values
  ('96970533-b2b8-4752-9d3f-8e91a1b1bce3', '11111111-1111-4111-8111-111111111111', 'সন্ধ্যা নদীর পাড়ে', 'shondha-nodir-pare', 'এক সন্ধ্যায় নদীর পাড়ে দেখা দুজন অপরিচিত মানুষের গল্প — যাদের কথোপকথনে ভেসে ওঠে হারানো স্বপ্ন আর নতুন শুরুর আশা। একটি সমাপ্ত ছোটগল্প।',
   'bn', 'ছোটগল্প', array['নদী', 'সন্ধ্যা', 'ছোটগল্প'], 'complete', '', now() - interval '8 days',
   now() - interval '12 days')
on conflict (author_id, slug) do update set title = excluded.title, summary = excluded.summary,
  language = excluded.language, genre = excluded.genre, tags = excluded.tags, status = excluded.status;
insert into public.chapters
  (id, story_id, title, slug, body_json, body_text, position, status, word_count, published_at)
values
  ('1ce3bf33-dfa4-4b91-b4fd-d373f6b10af3', '96970533-b2b8-4752-9d3f-8e91a1b1bce3', 'প্রথম দেখা', 'prothom-dekha', '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"সন্ধ্যা নামছিল নদীর ওপর। পশ্চিম আকাশে কমলা রঙের ছোপ, জলে তার প্রতিবিম্ব কাঁপছে ঢেউয়ের তালে। ঘাটের সিঁড়িতে বসে ছিল রুমি — হাতে একটা পুরনো ক্যামেরা, চোখে অনেক দিনের ক্লান্তি।"}]},{"type":"paragraph","content":[{"type":"text","text":"“ছবি তুলছেন?” — পাশ থেকে প্রশ্ন এল। একজন বৃদ্ধ, সাদা পাঞ্জাবি, হাতে তসবি।"}]},{"type":"paragraph","content":[{"type":"text","text":"“তুলতাম একসময়। এখন শুধু দেখি।” রুমি হাসল, “ক্যামেরাটা বাবার। তিনি বলতেন — আলো ধরতে হয়, সময় নয়।”"}]},{"type":"paragraph","content":[{"type":"text","text":"বৃদ্ধ মাথা নাড়লেন। “জ্ঞানী মানুষ ছিলেন। আমি পঞ্চাশ বছর এই ঘাটে বসি। প্রতিদিন একই সূর্য ডোবে, কিন্তু কোনো দিনের ছবি এক হয় না।”"}]},{"type":"paragraph","content":[{"type":"text","text":"সেই সন্ধ্যায়, দুজন অপরিচিত মানুষ নদীর পাড়ে বসে জীবনের হিসাব মেলাল — কে কী হারিয়েছে, কে কী পেয়েছে। আর যখন রাত নামল, রুমি প্রথমবারের মতো ক্যামেরা তুলল চোখে। শাটারের শব্দে মনে হলো — কিছু শুরু হচ্ছে।"}]}]}'::jsonb,
   'সন্ধ্যা নামছিল নদীর ওপর। পশ্চিম আকাশে কমলা রঙের ছোপ, জলে তার প্রতিবিম্ব কাঁপছে ঢেউয়ের তালে। ঘাটের সিঁড়িতে বসে ছিল রুমি — হাতে একটা পুরনো ক্যামেরা, চোখে অনেক দিনের ক্লান্তি।

“ছবি তুলছেন?” — পাশ থেকে প্রশ্ন এল। একজন বৃদ্ধ, সাদা পাঞ্জাবি, হাতে তসবি।

“তুলতাম একসময়। এখন শুধু দেখি।” রুমি হাসল, “ক্যামেরাটা বাবার। তিনি বলতেন — আলো ধরতে হয়, সময় নয়।”

বৃদ্ধ মাথা নাড়লেন। “জ্ঞানী মানুষ ছিলেন। আমি পঞ্চাশ বছর এই ঘাটে বসি। প্রতিদিন একই সূর্য ডোবে, কিন্তু কোনো দিনের ছবি এক হয় না।”

সেই সন্ধ্যায়, দুজন অপরিচিত মানুষ নদীর পাড়ে বসে জীবনের হিসাব মেলাল — কে কী হারিয়েছে, কে কী পেয়েছে। আর যখন রাত নামল, রুমি প্রথমবারের মতো ক্যামেরা তুলল চোখে। শাটারের শব্দে মনে হলো — কিছু শুরু হচ্ছে।', 0, 'published', 118, now() - interval '6 days')
on conflict (story_id, slug) do update set title = excluded.title, body_json = excluded.body_json,
  body_text = excluded.body_text, status = excluded.status, word_count = excluded.word_count;
insert into public.chapters
  (id, story_id, title, slug, body_json, body_text, position, status, word_count, published_at)
values
  ('22fb7945-44a9-446c-9543-28d6d4dd59b2', '96970533-b2b8-4752-9d3f-8e91a1b1bce3', 'শেষ আলো', 'shesh-alo', '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"পরের সন্ধ্যায় রুমি আবার এল ঘাটে। বৃদ্ধ তখনো সেখানে, একই জায়গায়, যেন সময় তার জন্য থেমে আছে।"}]},{"type":"paragraph","content":[{"type":"text","text":"“গতকালের ছবিগুলো দেখলাম,” রুমি বলল, ক্যামেরার স্ক্রিন এগিয়ে দিয়ে। “দেখুন — এইটায় আপনার ছায়া পড়েছে জলে, আর পেছনে নৌকা।”"}]},{"type":"paragraph","content":[{"type":"text","text":"বৃদ্ধ ছবিটা দেখলেন অনেকক্ষণ। তার চোখ ভিজে উঠল। “চল্লিশ বছর আগে এই ঘাটে আমার স্ত্রীর সঙ্গে দেখা হয়েছিল। সেও এমনি সন্ধ্যায় বসে ছিল।”"}]},{"type":"paragraph","content":[{"type":"text","text":"“তারপর?”"}]},{"type":"paragraph","content":[{"type":"text","text":"“তারপর পঞ্চাশটা বর্ষা পেরিয়ে গেল। সে চলে গেছে দশ বছর হলো। কিন্তু আমি এখনো আসি — কারণ এই আলোটা, এই নদীটা, আমাদের দুজনের।”"}]},{"type":"paragraph","content":[{"type":"text","text":"রুমি আর কিছু বলল না। সে শুধু ক্যামেরা তুলল, আর শেষ আলোটায় বন্দি করল এক বৃদ্ধের অপেক্ষা — যা আসলে ভালোবাসারই আরেক নাম।"}]}]}'::jsonb,
   'পরের সন্ধ্যায় রুমি আবার এল ঘাটে। বৃদ্ধ তখনো সেখানে, একই জায়গায়, যেন সময় তার জন্য থেমে আছে।

“গতকালের ছবিগুলো দেখলাম,” রুমি বলল, ক্যামেরার স্ক্রিন এগিয়ে দিয়ে। “দেখুন — এইটায় আপনার ছায়া পড়েছে জলে, আর পেছনে নৌকা।”

বৃদ্ধ ছবিটা দেখলেন অনেকক্ষণ। তার চোখ ভিজে উঠল। “চল্লিশ বছর আগে এই ঘাটে আমার স্ত্রীর সঙ্গে দেখা হয়েছিল। সেও এমনি সন্ধ্যায় বসে ছিল।”

“তারপর?”

“তারপর পঞ্চাশটা বর্ষা পেরিয়ে গেল। সে চলে গেছে দশ বছর হলো। কিন্তু আমি এখনো আসি — কারণ এই আলোটা, এই নদীটা, আমাদের দুজনের।”

রুমি আর কিছু বলল না। সে শুধু ক্যামেরা তুলল, আর শেষ আলোটায় বন্দি করল এক বৃদ্ধের অপেক্ষা — যা আসলে ভালোবাসারই আরেক নাম।', 1, 'published', 106, now() - interval '7 days')
on conflict (story_id, slug) do update set title = excluded.title, body_json = excluded.body_json,
  body_text = excluded.body_text, status = excluded.status, word_count = excluded.word_count;

commit;
