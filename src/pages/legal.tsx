import { Link } from "react-router-dom";
import { useApp } from "../lib/app-context";
import { Layout } from "../components/layout";

/**
 * V4-06 legal & trust pages. The texts are drafted from how the platform
 * actually behaves (storage, moderation, view counting, deletion) — if a
 * behaviour changes, these pages must change with it.
 */

type LText = { bn: string; en: string };
interface LegalSection {
  h: LText;
  paras: LText[];
}
interface LegalDoc {
  title: LText;
  sections: LegalSection[];
}

const EMAIL = "golpoghor.app@gmail.com";

const DOCS: Record<string, LegalDoc> = {
  terms: {
    title: { bn: "ব্যবহারের শর্তাবলি", en: "Terms of Use" },
    sections: [
      {
        h: { bn: "গল্পনীড় কী", en: "What GolpoNeer is" },
        paras: [
          {
            bn: "গল্পনীড় (GolpoNeer) একটি বাংলা ও ইংরেজি গল্প পড়া ও প্রকাশের প্ল্যাটফর্ম। অ্যাকাউন্ট খুলে বা সাইটটি ব্যবহার করে আপনি এই শর্তগুলো মেনে নিচ্ছেন।",
            en: "GolpoNeer is a platform for reading and publishing stories in Bangla and English. By creating an account or using the site, you accept these terms.",
          },
        ],
      },
      {
        h: { bn: "আপনার অ্যাকাউন্ট", en: "Your account" },
        paras: [
          {
            bn: "আপনার পাসওয়ার্ডের গোপনীয়তা এবং আপনার অ্যাকাউন্ট থেকে করা সব কাজের দায়িত্ব আপনার। ইউজারনেম বদলানো যায় (সেটিংস থেকে, ৩০ দিনে একবার); পুরনো ইউজারনেম ৩০ দিন আপনার জন্য সংরক্ষিত থাকে। সেটিংস থেকে যেকোনো সময় অ্যাকাউন্ট স্থায়ীভাবে মুছে ফেলা যায় — এতে আপনার প্রোফাইল, গল্প, মন্তব্য ও পড়ার অগ্রগতি সব মুছে যাবে।",
            en: "You are responsible for keeping your password secret and for everything done from your account. You can change your username in Settings (once every 30 days); your old username stays reserved for you for 30 days. You can permanently delete your account at any time in Settings — this removes your profile, stories, comments and reading progress.",
          },
        ],
      },
      {
        h: { bn: "আপনার লেখা, আপনার অধিকার", en: "Your writing, your rights" },
        paras: [
          {
            bn: "আপনি যা প্রকাশ করেন তার কপিরাইট আপনারই থাকে। গল্পনীড়ে প্রকাশ করে আপনি শুধু পাঠকদের কাছে লেখাটি দেখানো, সংরক্ষণ ও বিতরণের অনুমতি দিচ্ছেন, যাতে প্ল্যাটফর্মটি চলতে পারে। লেখা মুছে ফেললে সেই অনুমতিও শেষ হয়ে যায়। শুধু এমন লেখাই প্রকাশ করুন যার প্রকাশের অধিকার আপনার আছে।",
            en: "You keep the copyright in everything you publish. By publishing on GolpoNeer you only grant us permission to display, store and distribute the work to readers so the platform can operate; deleting the work ends that permission. Publish only work you have the right to publish.",
          },
        ],
      },
      {
        h: { bn: "ক্লাসিক সংগ্রহ", en: "The classics collection" },
        paras: [
          {
            bn: "ক্লাসিক বিভাগের লেখাগুলো পাবলিক ডোমেইনের সৃষ্টি। নতুন অনুবাদ ও আধুনিক সংস্করণের কৃতিত্ব তাদের নিজ নিজ অনুবাদক ও সম্পাদকের, এবং সেগুলো তাদের নিজ নিজ শর্তে থাকে। কোনো লেখা ভুলক্রমে এখানে থাকলে যোগাযোগ করুন — যাচাই করে সরিয়ে দেওয়া হবে।",
            en: "Works in the Classics section are public-domain creations. New translations and modern editions belong to their own translators and editors and remain under their own terms. If a work appears here in error, contact us and we will verify and remove it.",
          },
        ],
      },
      {
        h: { bn: "মডারেশন", en: "Moderation" },
        paras: [
          {
            bn: "পাঠক যেকোনো গল্প, অধ্যায়, মন্তব্য বা প্রোফাইল রিপোর্ট করতে পারেন। মডারেটররা রিপোর্ট পর্যালোচনা করে সামগ্রী লুকিয়ে ফেলতে বা ফিরিয়ে আনতে পারেন। যার সামগ্রী লুকানো হয় তাকে জানানো হয়, এবং তিনি আপিল করতে পারেন। বিস্তারিত কমিউনিটি নির্দেশিকায়।",
            en: "Readers can report any story, chapter, comment or profile. Moderators review reports and may hide or restore content. Authors are told when their content is hidden and may appeal. See the Community Guidelines for details.",
          },
        ],
      },
      {
        h: { bn: "ন্যায্য ব্যবহার", en: "Fair use of the platform" },
        paras: [
          {
            bn: "স্প্যাম, স্বয়ংক্রিয় পদ্ধতিতে অতিরিক্ত অনুরোধ, অন্যের ছদ্মবেশ বা প্ল্যাটফর্মের ক্ষতি করার চেষ্টা নিষেধ। অপব্যবহার রোধে মন্তব্য ও রিপোর্টের মতো কাজে যুক্তিসংগত সীমা প্রযোজ্য। গুরুতর বা বারবার লঙ্ঘনে অ্যাকাউন্টের বিরুদ্ধে ব্যবস্থা নেওয়া হতে পারে।",
            en: "Spam, automated flooding, impersonation and attempts to harm the platform are prohibited. Reasonable limits apply to actions such as comments and reports to prevent abuse. Serious or repeated violations may lead to action against an account.",
          },
        ],
      },
      {
        h: { bn: "দায় ও পরিবর্তন", en: "Liability and changes" },
        paras: [
          {
            bn: "গল্পনীড় একটি ছোট, স্বাধীন প্রকল্প এবং সেবাটি 'যেমন আছে' ভিত্তিতে দেওয়া হয়। লেখকদের লেখার বিষয়বস্তুর দায় তাদের নিজের। এই শর্ত বদলালে এই পেজেই হালনাগাদ করা হবে; বড় পরিবর্তনের ক্ষেত্রে সাইটে জানানো হবে।",
            en: "GolpoNeer is a small, independent project, and the service is provided as-is. Authors are responsible for their own writing. If these terms change, this page will be updated; significant changes will be announced on the site.",
          },
        ],
      },
    ],
  },

  privacy: {
    title: { bn: "গোপনীয়তা নীতি", en: "Privacy Policy" },
    sections: [
      {
        h: { bn: "আমরা যা সংরক্ষণ করি", en: "What we store" },
        paras: [
          {
            bn: "অ্যাকাউন্টের জন্য: আপনার ইমেইল, ইউজারনেম, প্রদর্শন নাম ও বায়ো। আপনার তৈরি সামগ্রী: গল্প, অধ্যায়, মন্তব্য, লাইক, ফলো, রিপোর্ট ও আপিল। পড়ার সুবিধার জন্য: পড়ার তালিকা এবং প্রতিটি গল্পে কোথায় থেমেছেন (পড়ার অগ্রগতি), যাতে Continue Reading কাজ করে।",
            en: "For your account: your email, username, display name and bio. Content you create: stories, chapters, comments, likes, follows, reports and appeals. For reading features: your reading list and where you stopped in each story (reading progress), so Continue Reading can work.",
          },
        ],
      },
      {
        h: { bn: "ভিউ গণনা", en: "View counting" },
        paras: [
          {
            bn: "কোন গল্প কতবার পড়া হলো তা গোনা হয় — প্রতিটি পাঠকের জন্য প্রতিটি গল্পে দিনে সর্বোচ্চ একবার। এই গণনায় কোনো আইপি ঠিকানা সংরক্ষণ করা হয় না, এবং কার পড়ার রেকর্ড আলাদাভাবে কাউকে দেখানো হয় না; শুধু মোট ভিউ সংখ্যাটি প্রকাশ্য।",
            en: "Story views are counted at most once per reader per story per day. No IP addresses are stored for this counting, and individual reading records are never shown to anyone; only the total view count is public.",
          },
        ],
      },
      {
        h: { bn: "ইমেইল", en: "Email" },
        paras: [
          {
            bn: "ইমেইল শুধু অ্যাকাউন্ট-সংক্রান্ত কাজে ব্যবহৃত হয়: নিবন্ধন নিশ্চিতকরণ ও পাসওয়ার্ড রিসেট। আমরা কোনো মার্কেটিং ইমেইল পাঠাই না এবং আপনার ইমেইল বিক্রি বা ভাড়া দিই না।",
            en: "Email is used only for account purposes: confirming signups and password resets. We send no marketing email and never sell or rent your email address.",
          },
        ],
      },
      {
        h: { bn: "তথ্য কোথায় থাকে", en: "Where data lives" },
        paras: [
          {
            bn: "তথ্য সংরক্ষণ ও লগইনের কাজে আমরা Supabase ব্যবহার করি এবং সাইটটি Vercel-এ হোস্ট করা। নোটিফিকেশন পছন্দের মতো সেটিংস শুধু আপনি নিজেই দেখতে পারেন। পাবলিক গল্প ও প্রোফাইল সবাই দেখতে পারে — খসড়া (ড্রাফট) শুধু লেখক নিজে দেখতে পারেন।",
            en: "We use Supabase for storage and sign-in, and the site is hosted on Vercel. Settings such as notification preferences are visible only to you. Published stories and profiles are public; drafts are visible only to their author.",
          },
        ],
      },
      {
        h: { bn: "কুকি ও স্থানীয় সংরক্ষণ", en: "Cookies and local storage" },
        paras: [
          {
            bn: "লগইন অবস্থা ধরে রাখতে এবং পড়ার পছন্দ (থিম, ফন্ট) মনে রাখতে ব্রাউজারের স্থানীয় সংরক্ষণ ব্যবহার করা হয়। আমরা কোনো বিজ্ঞাপন-ট্র্যাকার ব্যবহার করি না।",
            en: "Your browser's local storage keeps you signed in and remembers reading preferences (theme, font). We use no advertising trackers.",
          },
        ],
      },
      {
        h: { bn: "আপনার নিয়ন্ত্রণ", en: "Your control" },
        paras: [
          {
            bn: "সেটিংস থেকে প্রোফাইল সম্পাদনা, পাসওয়ার্ড ও ইউজারনেম পরিবর্তন এবং পুরো অ্যাকাউন্ট মুছে ফেলা যায়। অ্যাকাউন্ট মুছলে আপনার তথ্য স্থায়ীভাবে মুছে যায়। তথ্য নিয়ে কোনো প্রশ্ন থাকলে যোগাযোগ করুন।",
            en: "In Settings you can edit your profile, change your password and username, and delete your entire account. Deleting your account permanently removes your data. For any question about your data, contact us.",
          },
        ],
      },
    ],
  },

  guidelines: {
    title: { bn: "কমিউনিটি নির্দেশিকা", en: "Community Guidelines" },
    sections: [
      {
        h: { bn: "আমাদের উদ্দেশ্য", en: "What this place is for" },
        paras: [
          {
            bn: "গল্পনীড় গল্পের জন্য একটি শান্ত, স্বাগত বাসা। লেখক এখানে নিজের গল্প গড়েন, পাঠক পড়েন ও মতামত দেন। এমন আচরণ করুন যাতে অন্যরাও সেই স্বস্তি পায়।",
            en: "GolpoNeer is a calm, welcoming home for stories. Writers build their stories here; readers read and respond. Behave so that others feel that same welcome.",
          },
        ],
      },
      {
        h: { bn: "যা করবেন", en: "Please do" },
        paras: [
          {
            bn: "নিজের লেখা বা প্রকাশের অধিকার আছে এমন লেখা প্রকাশ করুন। অন্যের লেখায় গঠনমূলক মন্তব্য করুন। কোনো সামগ্রী নির্দেশিকা ভঙ্গ করছে মনে হলে অনুমানের বদলে রিপোর্ট করুন — মডারেটররা দেখবেন।",
            en: "Publish your own writing, or work you have the right to publish. Comment constructively on others' writing. If something seems to break these guidelines, report it rather than speculating — moderators will review it.",
          },
        ],
      },
      {
        h: { bn: "যা করা যাবে না", en: "Not allowed" },
        paras: [
          {
            bn: "অন্যের লেখা নিজের নামে প্রকাশ করা; হয়রানি, ঘৃণামূলক বা হুমকিমূলক আচরণ; স্প্যাম ও বিজ্ঞাপনী মন্তব্য; অবৈধ সামগ্রী; অন্য কারো ছদ্মবেশ; এবং প্রাপ্তবয়স্ক সামগ্রী এমনভাবে প্রকাশ করা যাতে তা অপ্রত্যাশিতভাবে পাঠকের সামনে আসে (প্রয়োজনে শুরুতেই সতর্কতা দিন)।",
            en: "Publishing someone else's work as your own; harassment, hateful or threatening behaviour; spam and promotional comments; illegal content; impersonating another person; and adult content presented so that readers meet it without warning (add a clear warning at the start when needed).",
          },
        ],
      },
      {
        h: { bn: "কপিরাইট", en: "Copyright" },
        paras: [
          {
            bn: "কারো লেখা তার অনুমতি ছাড়া প্রকাশ করবেন না। ক্লাসিক বিভাগের পাবলিক ডোমেইন লেখা ছাড়া পূর্ণাঙ্গ বই বা অন্যের প্রকাশিত লেখা এখানে তোলা যাবে না। কপিরাইটের বিষয়ে অভিযোগ থাকলে যোগাযোগের পেজে জানান — যাচাই করে ব্যবস্থা নেওয়া হবে।",
            en: "Do not publish another writer's work without their permission. Apart from the public-domain works in the Classics section, do not upload full books or others' published writing. If you have a copyright concern, tell us via the Contact page and we will verify and act.",
          },
        ],
      },
      {
        h: { bn: "মডারেশন যেভাবে কাজ করে", en: "How moderation works" },
        paras: [
          {
            bn: "রিপোর্ট পেলে মডারেটররা সামগ্রীটি দেখেন। নির্দেশিকা ভঙ্গ হলে সামগ্রী লুকিয়ে ফেলা হয় এবং লেখককে কারণসহ জানানো হয়। লেখক আপিল করতে পারেন; আপিল পর্যালোচনা করে সিদ্ধান্ত জানানো হয়। বারবার লঙ্ঘনে অ্যাকাউন্টের বিরুদ্ধে কঠোর ব্যবস্থা নেওয়া হতে পারে।",
            en: "When a report arrives, moderators review the content. If it breaks these guidelines, the content is hidden and the author is told why. The author may appeal; appeals are reviewed and answered. Repeated violations may lead to stronger action against an account.",
          },
        ],
      },
    ],
  },

  about: {
    title: { bn: "গল্পনীড় সম্পর্কে", en: "About GolpoNeer" },
    sections: [
      {
        h: { bn: "গল্পের জন্য একটি বাসা", en: "A nest for stories" },
        paras: [
          {
            bn: "নীড় মানে পাখির বাসা — খড়কুটা দিয়ে একটু একটু গড়া, আর ফিরে আসার জায়গা। গল্পনীড়ও তাই: লেখকরা অধ্যায়ে অধ্যায়ে গল্প গড়েন, আর পাঠকরা ফিরে আসেন যেখানে থেমেছিলেন ঠিক সেখান থেকে।",
            en: "Neer means a bird's nest — built twig by twig, and a place to return to. GolpoNeer is the same idea: writers build stories chapter by chapter, and readers return to exactly where they left off.",
          },
          {
            bn: "প্ল্যাটফর্মটি বাংলা ও ইংরেজি — দুই ভাষার জন্যই প্রথম শ্রেণির: বাংলা ফন্ট ও পড়ার অভিজ্ঞতায় বিশেষ যত্ন, মোবাইল-প্রথম নকশা, আর রবীন্দ্রনাথ ঠাকুরসহ পাবলিক ডোমেইন ক্লাসিকের একটি বাড়তে থাকা সংগ্রহ।",
            en: "The platform is bilingual by design — Bangla and English are both first-class: careful Bangla typography and reading experience, a mobile-first design, and a growing collection of public-domain classics, including Rabindranath Tagore.",
          },
        ],
      },
      {
        h: { bn: "কে তৈরি করছে", en: "Who is building it" },
        paras: [
          {
            bn: "গল্পনীড় বাংলাদেশ থেকে একজন স্বাধীন ডেভেলপারের তৈরি ছোট প্রকল্প, ভালোবাসা আর ফ্রি টুলের সমন্বয়ে এগিয়ে চলেছে। পরামর্শ ও মতামত স্বাগতম — যোগাযোগের পেজ দেখুন।",
            en: "GolpoNeer is a small project by an independent developer in Bangladesh, built with care on free tools. Suggestions and feedback are welcome — see the Contact page.",
          },
        ],
      },
    ],
  },

  contact: {
    title: { bn: "যোগাযোগ", en: "Contact" },
    sections: [
      {
        h: { bn: "ইমেইল", en: "Email" },
        paras: [
          {
            bn: `যেকোনো প্রয়োজনে লিখুন: ${EMAIL} — অ্যাকাউন্টের সমস্যা, কপিরাইটের বিষয়, ক্লাসিকে ভুল, কিংবা শুধু মতামত জানাতে। আমরা প্রতিটি বার্তা পড়ি; উত্তর পেতে কয়েক দিন লাগতে পারে।`,
            en: `Write to us at ${EMAIL} — for account problems, copyright matters, an error in the classics, or simply feedback. We read every message; a reply may take a few days.`,
          },
        ],
      },
      {
        h: { bn: "ফেসবুক", en: "Facebook" },
        paras: [
          {
            bn: "আমাদের ফেসবুক পেজ: facebook.com/golponeerapp (গল্পনীড় - GolpoNeer)। ঘোষণা ও নতুন সংযোজনের খবর সেখানে পাওয়া যাবে।",
            en: "Our Facebook page is facebook.com/golponeerapp (গল্পনীড় - GolpoNeer), where announcements and new additions are posted.",
          },
        ],
      },
      {
        h: { bn: "রিপোর্ট বনাম যোগাযোগ", en: "Reports vs. contact" },
        paras: [
          {
            bn: "সাইটের কোনো গল্প, অধ্যায় বা মন্তব্যে সমস্যা দেখলে ইমেইলের বদলে সেই সামগ্রীর রিপোর্ট বোতামটি ব্যবহার করুন — মডারেটরদের কাছে তা দ্রুত পৌঁছায়।",
            en: "If something on the site itself is a problem — a story, chapter or comment — use that item's Report button instead of email; it reaches the moderators faster.",
          },
        ],
      },
    ],
  },
};

export function LegalPage({ slug }: { slug: keyof typeof DOCS }) {
  const { t, locale } = useApp();
  const doc = DOCS[slug];
  const others = Object.keys(DOCS).filter((k) => k !== slug) as (keyof typeof DOCS)[];
  return (
    <Layout>
      <div className="mx-auto mt-6 max-w-3xl">
        <h1 className="font-serif text-3xl font-bold">{doc.title[locale]}</h1>
        <p className="mt-1 text-xs text-ink-faint">
          {locale === "bn" ? "হালনাগাদ: অক্টোবর ২০২৬" : "Updated: October 2026"}
        </p>
        <div className="mt-6 flex flex-col gap-7 rounded-xl bg-white p-6 shadow-card sm:p-8">
          {doc.sections.map((s) => (
            <section key={s.h.en}>
              <h2 className="font-serif text-lg font-bold">{s.h[locale]}</h2>
              {s.paras.map((para) => (
                <p key={para.en.slice(0, 24)} className="mt-2 leading-relaxed text-ink-soft">
                  {para[locale]}
                </p>
              ))}
            </section>
          ))}
        </div>
        <nav className="mt-6 flex flex-wrap gap-x-4 gap-y-2 text-sm text-river" aria-label="Legal">
          {others.map((k) => (
            <Link key={k} to={`/${k}`} className="hover:underline">
              {DOCS[k].title[locale]}
            </Link>
          ))}
        </nav>
        <p className="mt-4 text-xs text-ink-faint">{t("footer", "rights")}</p>
      </div>
    </Layout>
  );
}
