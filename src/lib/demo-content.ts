/**
 * Demo seed content: original Bangla + English stories by fictional authors.
 * Single source of truth — used by the local demo provider and by
 * scripts/generate-seed-sql.ts to produce supabase/seed.sql.
 */

export interface SeedAuthor {
  id: string;
  email: string;
  username: string;
  display_name: string;
  bio: string;
  locale: "bn" | "en";
  role: "reader" | "moderator" | "admin";
}

export interface SeedChapter {
  slug: string;
  title: string;
  status: "draft" | "published";
  paragraphs: string[];
}

export interface SeedStory {
  slug: string;
  title: string;
  summary: string;
  language: "bn" | "en";
  genre: string;
  tags: string[];
  status: "draft" | "ongoing" | "complete";
  content_notice: string;
  chapters: SeedChapter[];
}

export const DEMO_PASSWORD = "golpoghor-demo-2026";

export const SEED_AUTHORS: SeedAuthor[] = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    email: "nusrat@golpoghor.demo",
    username: "nusrat_rahman",
    display_name: "Nusrat Rahman",
    bio: "ঢাকায় থাকি, বৃষ্টি ভালোবাসি। ছোটগল্প আর ধারাবাহিক লিখি — মূলত বাংলায়।",
    locale: "bn",
    role: "reader",
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    email: "tanvir@golpoghor.demo",
    username: "tanvir_ahmed",
    display_name: "Tanvir Ahmed",
    bio: "Writing about Old Dhaka — its lanes, its river, and the people who remember.",
    locale: "en",
    role: "reader",
  },
  {
    id: "33333333-3333-4333-8333-333333333333",
    email: "moderator@golpoghor.demo",
    username: "golpoghor_mods",
    display_name: "GolpoNeer Moderation",
    bio: "Community moderation team. Report issues and we will look into them.",
    locale: "bn",
    role: "moderator",
  },
];

export const SEED_STORIES: (SeedStory & { author_username: string })[] = [
  {
    author_username: "nusrat_rahman",
    slug: "borshar-chithi",
    title: "বর্ষার চিঠি",
    summary:
      "দাদির রেখে যাওয়া নীল বইয়ের ভেতর একটা চিঠি — আর সেই চিঠির সূত্র ধরে মিনার খুঁজে পাওয়া এক অজানা গ্রামের ঠিকানা। বর্ষা, নদী আর স্মৃতির গল্প।",
    language: "bn",
    genre: "সমকালীন",
    tags: ["বর্ষা", "পরিবার", "স্মৃতি", "ধারাবাহিক"],
    status: "ongoing",
    content_notice: "",
    chapters: [
      {
        slug: "nil-kham",
        title: "নীল খাম",
        status: "published",
        paragraphs: [
          "বৃষ্টি এল শেষ বাসটা যাওয়ার আগেই। শহরের কিনারাগুলো নরম হয়ে এল জলের ছোঁয়ায়, আর ছাদের ওপর দাঁড়িয়ে মিনা দেখল — আকাশটা কেমন ধূসর কাগজের মতো ভিজে গেছে।",
          "দাদির পুরনো নীল বইটা সে হাতে নিয়েছিল সকালে, মায়ের আলমারি গোছাতে গিয়ে। পাতাগুলো হলদে হয়ে এসেছে, কিনারায় কালি ছড়িয়ে গেছে বৃষ্টির মতোই। আর ঠিক মাঝখানের পাতায় — একটা নীল খাম, সযত্নে ভাঁজ করা।",
          "\u201cমিনা,\u201d খামের ওপর দাদির হাতের লেখা, কাঁপা কাঁপা অক্ষরে, \u201cনদী যখন ফুলে উঠবে, তখন ফিরে এসো।\u201d",
          "মিনা চিঠিটা পড়ল তিনবার। বাইরে তখন ঝমঝম শব্দে বৃষ্টি পড়ছে টিনের চালে, আর তার মনে হলো — দাদি যেন এই মুহূর্তটার জন্যই অপেক্ষা করে ছিলেন। গ্রামের বাড়ি, বুড়িগঙ্গার পার, আর সেই অজানা ঠিকানা — সবকিছু হঠাৎ করেই খুব জরুরি মনে হতে লাগল।",
          "সে ফোনটা হাতে নিল। স্ক্রিনে ভেসে উঠল weather app-এর পূর্বাভাস: আগামী সাত দিন ভারী বর্ষণ। মিনা হেসে ফেলল — দাদি ঠিকই বলতেন, \u201cপ্রকৃতির নিজস্ব ক্যালেন্ডার আছে, মা।\u201d",
        ],
      },
      {
        slug: "chhader-ghor",
        title: "ছাদের ঘর",
        status: "published",
        paragraphs: [
          "ছাদের ছোট্ট ঘরটায় দাদির জিনিসপত্র এখনো সাজানো — একটা কাঠের সিন্দুক, তাতে পুরনো শাড়ির ভাঁজে ভাঁজে লুকিয়ে রাখা চিঠির তোড়া। মিনা একটা একটা করে খুলতে লাগল।",
          "প্রতিটা চিঠিই অসমাপ্ত। কোনোটায় শুধু সম্বোধন — \u201cপ্রিয় রহিমা,\u201d — তারপর শূন্যতা। কোনোটায় দু-লাইন লেখার পর কালি শুকিয়ে গেছে মাঝপথে, যেন লেখক হঠাৎ উঠে গেছেন আর ফেরেননি।",
          "সবচেয়ে পুরনো চিঠিটার তারিখ: ১৯৮৩ সালের শ্রাবণ মাস। \u201cআজ নদীতে জোয়ার এসেছে। তোমার কথা খুব মনে পড়ছে। জ্ঞান হওয়ার পর এই প্রথম এত দূরে আছি…\u201d — এখানেই থেমে গেছে লেখা।",
          "মিনার বুকটা ধড়ফড় করে উঠল। রহিমা — এই নামটা সে আগে কখনো শোনেনি। দাদির বোন? বান্ধবী? নাকি… অন্য কেউ? প্রশ্নগুলো বৃষ্টির ফোঁটার মতো জমতে লাগল তার মনে।",
          "সিন্দুকের তলায়, একটা লাল কাপড়ে মোড়ানো — একটা ছোট্ট নৌকার মডেল, কাঠের তৈরি। তার গায়ে খোদাই করা: \u201cক্ষণিকের জন্য নয়, চিরদিনের জন্য।\u201d",
        ],
      },
      {
        slug: "nodir-dak",
        title: "নদীর ডাক",
        status: "published",
        paragraphs: [
          "পরদিন ভোরে মিনা বেরিয়ে পড়ল। লঞ্চঘাটে পৌঁছতেই দেখল — নদী ফুলে উঠেছে, ঠিক দাদির চিঠিতে লেখা মতো। ঘোলা জলে ভাসছে কচুরিপানা, আর দূরে মেঘের আড়ালে সূর্য উঁকি দিচ্ছে।",
          "যাত্রাপথে পাশের সিটের বৃদ্ধা জিজ্ঞেস করলেন, \u201cকোথায় যাচ্ছ মা?\u201d মিনা ঠিকানাটা দেখাল — একটা গ্রামের নাম, যা গুগল ম্যাপেও ঠিকমতো পাওয়া যায় না। বৃদ্ধা হেসে বললেন, \u201cওই গ্রামে তো এখন কেউ থাকে না। শুধু বর্ষায় নদীটা ফিরে আসে।\u201d",
          "\u201cকেউ থাকে না?\u201d",
          "\u201cএকজন থাকেন। রহিমা বেগম। চল্লিশ বছর ধরে একা। সবাই বলে, তিনি কারো অপেক্ষায় আছেন।\u201d",
          "মিনার হাত কাঁপতে লাগল। ব্যাগের ভেতর নীল খামটা ভারী মনে হলো — যেন চল্লিশ বছরের অপেক্ষা তার কাঁধে চেপে বসেছে। নদীর ঢেউয়ের শব্দে সে শুনতে পেল দাদির গলা: \u201cদেরি কোরো না, মা। কিছু চিঠির উত্তর প্রজন্ম পেরিয়ে দিতে হয়।\u201d",
        ],
      },
      {
        slug: "khosra-pata",
        title: "খসড়া: ফেরার পথ",
        status: "draft",
        paragraphs: [
          "এই অধ্যায়টি এখনো লেখা হচ্ছে… (লেখকের খসড়া — পাঠকের জন্য দৃশ্যমান নয়)",
          "রহিমা বেগমের উঠোনে পা রাখতেই মিনা বুঝতে পারল — গল্পটা এখানেই শেষ নয়, শুরু।",
        ],
      },
    ],
  },
  {
    author_username: "tanvir_ahmed",
    slug: "a-map-of-old-dhaka",
    title: "A Map of Old Dhaka",
    summary:
      "An archivist inherits a hand-drawn map of 19th-century Dhaka — with one lane that doesn't exist on any modern survey. A slow mystery through Shankhari Bazar, the river ghats, and the city's living memory.",
    language: "en",
    genre: "Mystery",
    tags: ["dhaka", "history", "mystery", "serial"],
    status: "ongoing",
    content_notice: "",
    chapters: [
      {
        slug: "the-brass-key",
        title: "The Brass Key",
        status: "published",
        paragraphs: [
          "The map arrived on a Tuesday, folded inside my grandfather's survey ledger — all brass corners and mildew, smelling faintly of the Buriganga at low tide. I almost threw it out with the water-damaged field notes.",
          "It showed Old Dhaka as it was in 1873: the ghats numbered in careful ink, the mohallas shaded in watercolour, Shankhari Bazar marked with a tiny conch shell. My grandfather's hand, unmistakable — he had drawn half the municipal maps of this city before the war.",
          "But there was a fourteenth lane off Islampur Road. I counted three times. Fourteen lanes, when every survey — British, Pakistani, Bangladeshi — lists thirteen.",
          "Taped to the back of the map was a brass key, green with age, and a note in his shorthand: “For the house that remembers. Go at dusk, when the azan carries across the water.”",
          "I am an archivist. I catalogue other people's certainties for a living. That evening, against every professional instinct I own, I put the key in my pocket and walked toward the river.",
        ],
      },
      {
        slug: "lane-fourteen",
        title: "Lane Fourteen",
        status: "published",
        paragraphs: [
          "Islampur Road at dusk is a study in organized chaos — rickshaw bells, the smell of frying puri, children chasing a punctured football between trucks. I walked it twice before I saw the gap.",
          "Between a shuttered printing press and a tea stall, barely wider than a doorway, a passage fell away into shadow. No signboard. The GPS on my phone insisted it was the wall of a warehouse.",
          "The brass key turned in a lock I could not see until my fingers found it — a door set flush into the brick, painted the exact colour of dust. It opened onto a courtyard where a krishnachura tree was dropping its red flowers onto stones worn smooth by centuries of feet.",
          "“You're late,” said a voice behind me. “Your grandfather was always late too.”",
          "An old woman sat shelling peas in the last light, as if visitors with impossible keys arrived every evening. Perhaps, in this lane, they did.",
        ],
      },
    ],
  },
  {
    author_username: "nusrat_rahman",
    slug: "shondha-nodir-pare",
    title: "সন্ধ্যা নদীর পাড়ে",
    summary:
      "এক সন্ধ্যায় নদীর পাড়ে দেখা দুজন অপরিচিত মানুষের গল্প — যাদের কথোপকথনে ভেসে ওঠে হারানো স্বপ্ন আর নতুন শুরুর আশা। একটি সমাপ্ত ছোটগল্প।",
    language: "bn",
    genre: "ছোটগল্প",
    tags: ["নদী", "সন্ধ্যা", "ছোটগল্প"],
    status: "complete",
    content_notice: "",
    chapters: [
      {
        slug: "prothom-dekha",
        title: "প্রথম দেখা",
        status: "published",
        paragraphs: [
          "সন্ধ্যা নামছিল নদীর ওপর। পশ্চিম আকাশে কমলা রঙের ছোপ, জলে তার প্রতিবিম্ব কাঁপছে ঢেউয়ের তালে। ঘাটের সিঁড়িতে বসে ছিল রুমি — হাতে একটা পুরনো ক্যামেরা, চোখে অনেক দিনের ক্লান্তি।",
          "\u201cছবি তুলছেন?\u201d — পাশ থেকে প্রশ্ন এল। একজন বৃদ্ধ, সাদা পাঞ্জাবি, হাতে তসবি।",
          "\u201cতুলতাম একসময়। এখন শুধু দেখি।\u201d রুমি হাসল, \u201cক্যামেরাটা বাবার। তিনি বলতেন — আলো ধরতে হয়, সময় নয়।\u201d",
          "বৃদ্ধ মাথা নাড়লেন। \u201cজ্ঞানী মানুষ ছিলেন। আমি পঞ্চাশ বছর এই ঘাটে বসি। প্রতিদিন একই সূর্য ডোবে, কিন্তু কোনো দিনের ছবি এক হয় না।\u201d",
          "সেই সন্ধ্যায়, দুজন অপরিচিত মানুষ নদীর পাড়ে বসে জীবনের হিসাব মেলাল — কে কী হারিয়েছে, কে কী পেয়েছে। আর যখন রাত নামল, রুমি প্রথমবারের মতো ক্যামেরা তুলল চোখে। শাটারের শব্দে মনে হলো — কিছু শুরু হচ্ছে।",
        ],
      },
      {
        slug: "shesh-alo",
        title: "শেষ আলো",
        status: "published",
        paragraphs: [
          "পরের সন্ধ্যায় রুমি আবার এল ঘাটে। বৃদ্ধ তখনো সেখানে, একই জায়গায়, যেন সময় তার জন্য থেমে আছে।",
          "\u201cগতকালের ছবিগুলো দেখলাম,\u201d রুমি বলল, ক্যামেরার স্ক্রিন এগিয়ে দিয়ে। \u201cদেখুন — এইটায় আপনার ছায়া পড়েছে জলে, আর পেছনে নৌকা।\u201d",
          "বৃদ্ধ ছবিটা দেখলেন অনেকক্ষণ। তার চোখ ভিজে উঠল। \u201cচল্লিশ বছর আগে এই ঘাটে আমার স্ত্রীর সঙ্গে দেখা হয়েছিল। সেও এমনি সন্ধ্যায় বসে ছিল।\u201d",
          "\u201cতারপর?\u201d",
          "\u201cতারপর পঞ্চাশটা বর্ষা পেরিয়ে গেল। সে চলে গেছে দশ বছর হলো। কিন্তু আমি এখনো আসি — কারণ এই আলোটা, এই নদীটা, আমাদের দুজনের।\u201d",
          "রুমি আর কিছু বলল না। সে শুধু ক্যামেরা তুলল, আর শেষ আলোটায় বন্দি করল এক বৃদ্ধের অপেক্ষা — যা আসলে ভালোবাসারই আরেক নাম।",
        ],
      },
    ],
  },
];
