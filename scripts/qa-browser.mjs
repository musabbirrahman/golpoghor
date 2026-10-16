/**
 * Local headless browser QA for GolpoGhor (http://127.0.0.1:5173).
 *
 * Setup (one time):
 *   mkdir -p /tmp/pwtest && cd /tmp/pwtest && npm init -y && npm i playwright \
 *     && npx playwright install chromium --only-shell
 * Run:
 *   cp scripts/qa-browser.mjs /tmp/pwtest/ && cd /tmp/pwtest && node qa-browser.mjs
 * (the script must sit next to the playwright install for ESM resolution)
 *
 * Covers: guest reading (shelves, story page, draft invisibility, reader
 * themes, search, filters), signup, library/likes/follows/comments/reports,
 * full authoring loop (create -> autosave -> canonical URL remount ->
 * preview -> publish -> public visibility), moderation queue + audit log,
 * and mobile viewport. Screenshots land in /tmp/pwtest/.
 */
import { chromium } from "playwright";

const BASE = "http://127.0.0.1:5173";
const results = [];
const check = (name, cond, extra = "") => {
  results.push([cond ? "PASS" : "FAIL", name, extra]);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? " — " + extra : ""}`);
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => {
  if (m.type() === "error") errors.push("console: " + m.text().slice(0, 160));
});

async function goto(path) {
  await page.goto(BASE + path, { waitUntil: "networkidle" });
}

// ---------- A. guest reading ----------
await goto("/");
await page.waitForTimeout(1000);
check("home loads", (await page.title()).includes("GolpoGhor"));
check("demo banner visible", await page.getByText("ডেমো মোড").first().isVisible());
check("bangla story card", await page.getByText("বর্ষার চিঠি").first().isVisible());
check("english story card", await page.getByText("A Map of Old Dhaka").first().isVisible());
await page.screenshot({ path: "/tmp/pwtest/home.png" });

// tofu check: Bangla text should not render as boxes — sample computed font
const banglaFont = await page.evaluate(() => {
  const el = [...document.querySelectorAll("h3")].find((e) => e.textContent.includes("বর্ষার"));
  return el ? getComputedStyle(el).fontFamily : "none";
});
check("bangla element has serif font stack", /Literata|Noto Serif Bengali|Georgia/.test(banglaFont), banglaFont.slice(0, 60));

await page.getByText("বর্ষার চিঠি").first().click();
await page.waitForURL(/\/stories\//);
await page.locator("ol li").nth(2).waitFor({ timeout: 8000 });
check("story page url", page.url().includes("/stories/nusrat_rahman/borshar-chithi"), page.url());
check("author shown", await page.getByText("Nusrat Rahman", { exact: false }).first().isVisible());
check("language badge", await page.getByText("বাংলা", { exact: true }).first().isVisible());
check("3 chapters listed", (await page.locator("ol li").count()) === 3, `${await page.locator("ol li").count()} items`);
const chapterNames = await page.locator("ol").first().innerText();
check("chapter titles present", chapterNames.includes("নীল খাম") && chapterNames.includes("ছাদের ঘর"), chapterNames.slice(0, 80));
check("draft chapter hidden from guest", !chapterNames.includes("খসড়া"));

await page.getByText("নীল খাম").first().click();
await page.waitForURL(/nil-kham/);
const bodyText = await page.locator("article .richtext, article").first().innerText().catch(() => "");
const readerText = await page.locator("article").innerText();
check("reader shows bangla prose", readerText.includes("বৃষ্টি") && readerText.includes("।"));
// breadcrumb back to story
await page.getByRole("navigation").first().getByRole("link").first().click().catch(() => {});
// next chapter nav
await goto("/stories/nusrat_rahman/borshar-chithi/nil-kham");
await page.getByRole("link", { name: /পরের অধ্যায়|Next chapter/ }).click();
await page.waitForURL(/chhader-ghor/);
check("next-chapter nav works", page.url().includes("chhader-ghor"), page.url());

// reader settings: dark theme + font size
await page.getByRole("button", { name: "থিম" }).click();
await page.getByRole("button", { name: "অন্ধকার" }).click();
await page.waitForTimeout(300);
await page.getByRole("button", { name: "থিম" }).click();
await page.getByRole("button", { name: "lg", exact: true }).click();
await page.waitForTimeout(300);
const articleBg = await page.locator("article").first().evaluate((el) => getComputedStyle(el).backgroundColor);
const articleSize = await page.locator("article .richtext").first().evaluate((el) => getComputedStyle(el).fontSize);
check("font size increased", parseFloat(articleSize) >= 21, articleSize);
check("dark theme applies", /28|1c/.test(articleBg), articleBg);
await page.screenshot({ path: "/tmp/pwtest/reader-dark.png" });

// search
await goto("/search?q=" + encodeURIComponent("বর্ষা"));
check("search finds bangla story", await page.getByText("বর্ষার চিঠি").first().isVisible());
await goto("/discover?language=bn");
await page.waitForTimeout(800);
const cardsBn = await page.locator("a[href^='/stories/']").count();
check("discover bn filter shows stories", cardsBn > 0, `${cardsBn} cards`);

// ---------- B. reader account ----------
await goto("/signup");
await page.getByLabel(/ইমেইল|Email/).fill("qatest@example.com");
await page.getByLabel(/ইউজারনেম|Username/).fill("qatest");
await page.getByLabel(/প্রদর্শন নাম|Display name/).fill("QA Test");
await page.getByLabel(/পাসওয়ার্ড|Password/).fill("test1234");
await page.getByRole("button", { name: /অ্যাকাউন্ট খুলুন|Sign up/ }).click();
await page.waitForURL(/\/$|\/discover/, { timeout: 8000 }).catch(() => {});
check("signup lands logged in", await page.getByRole("button", { name: /Q|QA Test/ }).first().isVisible().catch(() => false) || page.url() === BASE + "/");

await goto("/stories/nusrat_rahman/borshar-chithi");
await page.getByRole("button", { name: /লাইব্রেরিতে রাখুন|Save to library/ }).click();
await page.waitForTimeout(600);
check("save to library toggles", await page.getByRole("button", { name: /সংরক্ষিত|Saved/ }).isVisible());
await page.getByRole("button", { name: /ভালো লেগেছে|Like/ }).first().click();
await page.waitForTimeout(600);
const likeBtn = await page.getByRole("button", { name: /Liked|ভালো লেগেছে ✓/ }).isVisible().catch(() => false);
check("like toggles", likeBtn);
await page.getByRole("button", { name: /অনুসরণ করুন|Follow/ }).first().click();
await page.waitForTimeout(600);
check("follow toggles", await page.getByRole("button", { name: /অনুসরণ করছেন|Following/ }).isVisible());

await goto("/stories/nusrat_rahman/borshar-chithi/nil-kham");
await page.getByPlaceholder(/মতামত|thoughts/).fill("দারুণ লেখা!");
await page.getByRole("button", { name: /পোস্ট করুন|Post/ }).click();
await page.waitForTimeout(800);
check("comment appears", await page.getByText("দারুণ লেখা!").isVisible());

await goto("/library");
await page.waitForTimeout(600);
const libText = await page.locator("main").innerText();
check("library has reading list item", libText.includes("বর্ষার চিঠি"));
check("library has continue-reading", /চালিয়ে যান|Resume|Continue reading/.test(libText));

// report chapter
await goto("/stories/nusrat_rahman/borshar-chithi/nil-kham");
const reportBtns = page.getByRole("button", { name: /রিপোর্ট|Report/ });
await reportBtns.first().click();
await page.getByLabel(/কারণ|Reason/).fill("test report");
await page.getByRole("button", { name: /রিপোর্ট পাঠান|Submit report/ }).click();
await page.waitForTimeout(600);
check("report submitted", await page.getByText(/মডারেশন টিম|moderation team/i).isVisible());

// ---------- C. authoring ----------
await goto("/write");
await page.getByRole("link", { name: /নতুন গল্প|New story/ }).first().click();
await page.getByLabel(/শিরোনাম|Title/).fill("QA গল্প");
await page.getByLabel(/সারসংক্ষেপ|Summary/).fill("একটি পরীক্ষামূলক গল্প।");
await page.getByRole("button", { name: /সংরক্ষণ|Save/ }).click();
await page.waitForURL(/\/write\/stories\//, { timeout: 8000 });
const storyEditUrl = page.url();
check("story created -> edit page", /\/write\/stories\/[^/]+$/.test(storyEditUrl), storyEditUrl);
const storyId = storyEditUrl.split("/").pop();

await page.getByRole("link", { name: /নতুন অধ্যায়|New chapter/ }).first().click();
await page.waitForURL(/\/write\/(stories\/.+\/chapters\/new|chapters\/.+)/);
await page.getByLabel(/অধ্যায়ের শিরোনাম|Chapter title/).fill("প্রথম অধ্যায়");
await page.locator(".tiptap").click();
await page.keyboard.type("বৃষ্টি পড়ছে।");
await page.keyboard.press("Enter");
await page.keyboard.press("Enter");
await page.keyboard.type("জানালার বাইরে সবুজ মাঠ।");
await page.waitForURL(/\/write\/chapters\//, { timeout: 15000 }); // first autosave creates the chapter
await page.waitForFunction(
  () => document.getElementById("chapter-title")?.value === "প্রথম অধ্যায়",
  null,
  { timeout: 10000 }
);
await page.getByText(/সংরক্ষিত|Saved/).first().waitFor({ timeout: 8000 });
check("autosave shows Saved", true);
check("editor URL became canonical", page.url().includes("/write/chapters/"), page.url());
check("typed title survived remount", await page.getByLabel(/অধ্যায়ের শিরোনাম|Chapter title/).inputValue() === "প্রথম অধ্যায়");
const editorText = await page.locator(".tiptap").innerText();
check("typed body survived remount", editorText.includes("বৃষ্টি পড়ছে") && editorText.includes("সবুজ মাঠ"));

// preview
await page.getByRole("button", { name: /প্রিভিউ|Preview/ }).first().click();
await page.waitForTimeout(400);
const previewText = await page.locator("main").innerText();
check("preview renders typed text", previewText.includes("বৃষ্টি পড়ছে"));
await page.getByRole("button", { name: /প্রিভিউ|Preview/ }).first().click(); // back to edit

// publish chapter
await page.getByRole("button", { name: /^প্রকাশ করুন$|^Publish$/ }).first().click();
await page.getByRole("button", { name: /নিশ্চিত করুন|Confirm/ }).click();
await page.waitForTimeout(800);
check("chapter published badge", await page.getByText(/প্রকাশিত|Published/).first().isVisible().catch(() => false) || (await page.locator("main").innerText()).includes("published"));

// publish story
await goto(`/write/stories/${storyId}`);
await page.getByRole("button", { name: /গল্প প্রকাশ করুন|Publish story/ }).click();
await page.getByRole("button", { name: /নিশ্চিত করুন|Confirm/ }).click();
await page.waitForTimeout(800);

// sign out, verify public visibility as guest
await page.getByRole("button", { name: /Q/ }).first().click().catch(() => {});
await page.getByRole("menuitem", { name: /সাইন আউট|Sign out/ }).click().catch(() => {});
await page.waitForTimeout(800);
await goto("/search?q=" + encodeURIComponent("QA গল্প"));
check("guest finds published story", await page.getByText("QA গল্প").first().isVisible());

// ---------- D. moderation ----------
await goto("/login");
await page.getByLabel(/ইমেইল|Email/).fill("moderator@golpoghor.demo");
await page.getByLabel(/পাসওয়ার্ড|Password/).fill("golpoghor-demo-2026");
await page.getByRole("button", { name: /সাইন ইন|Sign in/ }).first().click();
await page.waitForTimeout(1000);
await goto("/admin/reports");
await page.waitForTimeout(800);
const queueText = await page.locator("main").innerText();
check("moderator sees report queue", queueText.includes("test report"));
await page.getByRole("button", { name: /পর্যালোচনাধীন|in review/i }).first().click();
await page.waitForTimeout(600);
await page.getByRole("button", { name: /অধ্যায় লুকান|Hide chapter/ }).first().click();
await page.waitForTimeout(800);
await page.getByRole("button", { name: /সমাধানকৃত|resolved/i }).first().click();
await page.waitForTimeout(600);
await page.getByRole("tab", { name: /অডিট|Audit/ }).click();
await page.waitForTimeout(800);
const auditText = await page.locator("main").innerText();
check("audit log shows hide_chapter", auditText.includes("hide_chapter"));

// hidden chapter not visible to guests
await page.getByRole("button", { name: /M/ }).first().click().catch(() => {});
await page.getByRole("menuitem", { name: /সাইন আউট|Sign out/ }).click().catch(() => {});
await page.waitForTimeout(600);
await goto("/stories/nusrat_rahman/borshar-chithi");
const chList = await page.locator("ol").first().innerText().catch(() => "");
check("hidden chapter invisible to guests", !chList.includes("নীল খাম"));

// ---------- E. appeals + restore ----------
// guest reports qatest's story
await goto("/search?q=" + encodeURIComponent("QA গল্প"));
await page.locator('main a[href*="/stories/"]').first().click();
await page.waitForURL(/\/stories\//);
await page.getByRole("button", { name: "রিপোর্ট করুন" }).first().click();
await page.getByLabel("কারণ", { exact: true }).fill("qa appeal test");
await page.getByRole("button", { name: "রিপোর্ট পাঠান" }).click();
await page.waitForTimeout(800);
check("story reported", await page.getByText(/মডারেশন টিম/).isVisible());

// moderator: hide the story via the queue
await goto("/login");
await page.getByLabel(/ইমেইল|Email/).fill("moderator@golpoghor.demo");
await page.getByLabel(/পাসওয়ার্ড|Password/).fill("golpoghor-demo-2026");
await page.getByRole("button", { name: /সাইন ইন|Sign in/ }).first().click();
await page.waitForTimeout(1000);
check("moderator notified of report", /\d/.test(await page.getByLabel("ইনবক্স", { exact: true }).innerText()));
await goto("/admin/reports");
await page.waitForTimeout(800);
const storyCard = page.locator("div.p-5", { hasText: "QA গল্প" }).filter({ has: page.getByRole("button", { name: "গল্প লুকান" }) }).first();
await storyCard.getByRole("button", { name: "গল্প লুকান" }).click();
await page.waitForTimeout(800);
await page.reload();
await page.waitForTimeout(800);
const storyCardHidden = page.locator("div.p-5", { hasText: "QA গল্প" }).first();
check("queue shows hidden status", await storyCardHidden.getByText("লুকানো", { exact: true }).isVisible());
await page.getByRole("button", { name: /Q/ }).first().click().catch(() => {});
await page.getByRole("menuitem", { name: /সাইন আউট|Sign out/ }).click().catch(() => {});
await page.waitForTimeout(600);

// writer sees hidden notice + submits appeal
await goto("/login");
await page.getByLabel(/ইমেইল|Email/).fill("qatest@example.com");
await page.getByLabel(/পাসওয়ার্ড|Password/).fill("test1234");
await page.getByRole("button", { name: /সাইন ইন|Sign in/ }).first().click();
await page.waitForTimeout(1000);
check("writer notified of hide", /\d/.test(await page.getByLabel("ইনবক্স", { exact: true }).innerText()));
await goto("/write");
await page.waitForTimeout(600);
await page.getByText("QA গল্প").first().click();
await page.waitForURL(/\/write\/stories\//);
await page.getByText("মডারেশনের কারণে এই কনটেন্টটি লুকানো হয়েছে।").first().waitFor({ timeout: 8000 }).catch(() => {});
check("writer sees hidden notice", await page.getByText("মডারেশনের কারণে এই কনটেন্টটি লুকানো হয়েছে।").isVisible());
await page.getByRole("button", { name: "পুনর্বিবেচনার অনুরোধ" }).click();
await page.getByLabel("কারণ", { exact: true }).fill("please reconsider my story");
await page.getByRole("button", { name: "আপিল পাঠান" }).click();
await page.waitForTimeout(800);
check("appeal submitted", await page.getByText(/আপিল পাঠানো হয়েছে/).isVisible());
await page.getByRole("button", { name: /Q/ }).first().click().catch(() => {});
await page.getByRole("menuitem", { name: /সাইন আউট|Sign out/ }).click().catch(() => {});
await page.waitForTimeout(600);

// moderator: approve appeal, then restore the story
await goto("/login");
await page.getByLabel(/ইমেইল|Email/).fill("moderator@golpoghor.demo");
await page.getByLabel(/পাসওয়ার্ড|Password/).fill("golpoghor-demo-2026");
await page.getByRole("button", { name: /সাইন ইন|Sign in/ }).first().click();
await page.waitForTimeout(1000);
await goto("/admin/reports");
await page.getByRole("tab", { name: "আপিল" }).click();
await page.waitForTimeout(800);
const appealCard = page.locator("div.p-5", { hasText: "please reconsider my story" }).first();
check("moderator sees appeal", await appealCard.isVisible());
await appealCard.getByRole("button", { name: "অনুমোদন" }).click();
await page.getByLabel(/সিদ্ধান্তের নোট/).fill("looks fine, restoring");
await page.getByRole("button", { name: "নিশ্চিত করুন" }).click();
await page.waitForTimeout(800);
check("appeal approved", await page.locator("div.p-5", { hasText: "please reconsider my story" }).getByText("গৃহীত", { exact: true }).isVisible());
// approving alone does not restore
await page.getByRole("tab", { name: /রিপোর্ট তালিকা/ }).click();
await page.waitForTimeout(800);
const hiddenCard = page.locator("div.p-5", { hasText: "QA গল্প" }).first();
await hiddenCard.getByRole("button", { name: "ফিরিয়ে আনুন" }).click();
await page.waitForTimeout(400);
check("restore confirm shown", await page.getByText("কনটেন্ট ফিরিয়ে আনবেন?").isVisible());
await page.getByRole("button", { name: "নিশ্চিত করুন" }).click();
await page.waitForTimeout(1000);
await page.getByRole("button", { name: /M/ }).first().click().catch(() => {});
await page.getByRole("menuitem", { name: /সাইন আউট|Sign out/ }).click().catch(() => {});
await page.waitForTimeout(600);
await goto("/search?q=" + encodeURIComponent("QA গল্প"));
check("guest finds restored story", await page.getByText("QA গল্প").first().isVisible());

// ---------- F. comment report + notifications inbox ----------
// qatest posts a comment on a visible chapter
await goto("/login");
await page.getByLabel(/ইমেইল|Email/).fill("qatest@example.com");
await page.getByLabel(/পাসওয়ার্ড|Password/).fill("test1234");
await page.getByRole("button", { name: /সাইন ইন|Sign in/ }).first().click();
await page.waitForTimeout(1000);
await goto("/stories/nusrat_rahman/borshar-chithi/chhader-ghor");
await page.getByPlaceholder(/মতামত|thoughts/).fill("মন্তব্য পরীক্ষা");
await page.getByRole("button", { name: /পোস্ট করুন|Post/ }).click();
await page.waitForTimeout(800);
await page.getByRole("button", { name: /Q/ }).first().click().catch(() => {});
await page.getByRole("menuitem", { name: /সাইন আউট|Sign out/ }).click().catch(() => {});
await page.waitForTimeout(600);

// new reader reports that comment
await goto("/signup");
await page.getByLabel(/ইমেইল|Email/).fill("reader2@example.com");
await page.getByLabel(/ইউজারনেম|Username/).fill("reader2");
await page.getByLabel(/প্রদর্শন নাম|Display name/).fill("Reader Two");
await page.getByLabel(/পাসওয়ার্ড|Password/).nth(0).fill("test1234");
await page.getByRole("button", { name: /অ্যাকাউন্ট খুলুন|Sign up/ }).click();
await page.waitForTimeout(1200);
await goto("/stories/nusrat_rahman/borshar-chithi/chhader-ghor");
await page.waitForTimeout(600);
const commentBlock = page.locator("article", { hasText: "মন্তব্য পরীক্ষা" }).first();
await commentBlock.getByRole("button", { name: "রিপোর্ট করুন" }).click();
await page.getByLabel("কারণ", { exact: true }).fill("qa comment report");
await page.getByRole("button", { name: "রিপোর্ট পাঠান" }).click();
await page.waitForTimeout(800);
await page.getByRole("button", { name: /R/ }).first().click().catch(() => {});
await page.getByRole("menuitem", { name: /সাইন আউট|Sign out/ }).click().catch(() => {});
await page.waitForTimeout(600);

// moderator hides + restores the comment
await goto("/login");
await page.getByLabel(/ইমেইল|Email/).fill("moderator@golpoghor.demo");
await page.getByLabel(/পাসওয়ার্ড|Password/).fill("golpoghor-demo-2026");
await page.getByRole("button", { name: /সাইন ইন|Sign in/ }).first().click();
await page.waitForTimeout(1000);
await goto("/admin/reports");
await page.waitForTimeout(800);
const commentCard = page.locator("div.p-5", { hasText: "qa comment report" }).first();
check("comment report has chapter context", await commentCard.getByText(/বর্ষার চিঠি — ছাদের ঘর/).isVisible());
await commentCard.getByRole("button", { name: "মন্তব্য লুকান" }).click();
await page.waitForTimeout(800);
await page.reload();
await page.waitForTimeout(800);
const hiddenCommentCard = page.locator("div.p-5", { hasText: "qa comment report" }).first();
await hiddenCommentCard.getByRole("button", { name: "ফিরিয়ে আনুন" }).click();
await page.getByRole("button", { name: "নিশ্চিত করুন" }).click();
await page.waitForTimeout(800);
await page.getByRole("tab", { name: /অডিট/ }).click();
await page.waitForTimeout(800);
check("audit shows comment moderation", (await page.locator("main").innerText()).includes("moderate_comment"));
await page.getByRole("button", { name: /M/ }).first().click().catch(() => {});
await page.getByRole("menuitem", { name: /সাইন আউট|Sign out/ }).click().catch(() => {});
await page.waitForTimeout(600);

// writer checks inbox, marks all read
await goto("/login");
await page.getByLabel(/ইমেইল|Email/).fill("qatest@example.com");
await page.getByLabel(/পাসওয়ার্ড|Password/).fill("test1234");
await page.getByRole("button", { name: /সাইন ইন|Sign in/ }).first().click();
await page.waitForTimeout(1000);
await goto("/inbox");
await page.waitForTimeout(800);
const inboxText = await page.locator("main").innerText();
check("inbox has hide notification", inboxText.includes("লুকানো হয়েছে"));
check("inbox has appeal decision", inboxText.includes("আপিলের সিদ্ধান্ত"));
await page.screenshot({ path: "/tmp/pwtest/inbox.png" });
await page.getByRole("button", { name: "সব পড়া হিসেবে চিহ্নিত" }).click();
await page.waitForTimeout(800);
check("badge cleared after mark-all-read", !(await page.getByLabel("ইনবক্স", { exact: true }).innerText()).match(/\d/));

// EN language spot-check of new UI
await page.getByRole("button", { name: "EN" }).click();
await page.waitForTimeout(600);
await goto("/admin/reports");
check("EN login gate", (await page.locator("main").innerText()).includes("Only moderators"));
await goto("/inbox");
check("EN inbox title", await page.getByRole("heading", { name: "Inbox" }).isVisible());
await page.getByRole("button", { name: "বাং" }).click();
await page.waitForTimeout(400);

// ---------- G. views + zero-chapter publish gate ----------
// (session is qatest writer here)
await goto("/write");
await page.getByRole("link", { name: /নতুন গল্প|New story/ }).first().click();
await page.getByLabel(/শিরোনাম|Title/).fill("QA ভিউ গল্প");
await page.getByLabel(/সারসংক্ষেপ|Summary/).fill("ভিউ গণনার পরীক্ষামূলক গল্প।");
await page.getByRole("button", { name: /সংরক্ষণ|Save/ }).click();
await page.waitForURL(/\/write\/stories\//, { timeout: 8000 });
const gateStoryId = page.url().split("/").pop();

// publish blocked with no chapters: notice + disabled button
await page.getByText(/একটি অধ্যায় লিখে প্রকাশ করুন|Write and publish a chapter/).waitFor({ timeout: 8000 });
check("zero-chapter notice shown", true);
check("publish button disabled w/o chapter", await page.getByRole("button", { name: /গল্প প্রকাশ করুন|Publish story/ }).isDisabled());

// publish one chapter, then the story
await page.getByRole("link", { name: /নতুন অধ্যায়|New chapter/ }).first().click();
await page.waitForURL(/\/write\/(stories\/.+\/chapters\/new|chapters\/.+)/);
await page.getByLabel(/অধ্যায়ের শিরোনাম|Chapter title/).fill("ভিউ অধ্যায়");
await page.locator(".tiptap").click();
await page.keyboard.type("ভিউ গণনার জন্য কিছু লেখা।");
await page.waitForURL(/\/write\/chapters\//, { timeout: 15000 });
await page.getByText(/সংরক্ষিত|Saved/).first().waitFor({ timeout: 8000 });
await page.getByRole("button", { name: /^প্রকাশ করুন$|^Publish$/ }).first().click();
await page.getByRole("button", { name: /নিশ্চিত করুন|Confirm/ }).click();
await page.waitForTimeout(800);
const chapterEditUrl = page.url(); // remember for the unpublish-warning check

await goto(`/write/stories/${gateStoryId}`);
await page.getByRole("button", { name: /গল্প প্রকাশ করুন|Publish story/ }).click();
await page.getByRole("button", { name: /নিশ্চিত করুন|Confirm/ }).click();
await page.waitForTimeout(800);
check("story publishes with chapter", /চলমান|Ongoing/.test(await page.locator("main").innerText()));

// last-chapter warning appears in the unpublish confirm modal (public story)
await goto(new URL(chapterEditUrl).pathname);
await page.waitForTimeout(600);
await page.getByRole("button", { name: /অপ্রকাশিত করুন|Unpublish/ }).click();
await page.getByText(/শেষ প্রকাশিত অধ্যায়|last published chapter/).waitFor({ timeout: 8000 });
check("last-chapter warning shown", true);
await page.getByRole("button", { name: /বাতিল|Cancel/ }).click();

// second account: non-author reader
await page.getByRole("button", { name: /Q/ }).first().click().catch(() => {});
await page.getByRole("menuitem", { name: /সাইন আউট|Sign out/ }).click().catch(() => {});
await page.waitForTimeout(800);
await goto("/signup");
await page.getByLabel(/ইমেইল|Email/).fill("qareader@example.com");
await page.getByLabel(/ইউজারনেম|Username/).fill("qareader");
await page.getByLabel(/প্রদর্শন নাম|Display name/).fill("QA Reader");
await page.getByLabel(/পাসওয়ার্ড|Password/).fill("test1234");
await page.getByRole("button", { name: /অ্যাকাউন্ট খুলুন|Sign up/ }).click();
await page.waitForURL(/\/$|\/discover/, { timeout: 8000 }).catch(() => {});

// reader views the story -> counted once
await goto("/stories/qatest/qa-ভিউ-গল্প");
await page.waitForTimeout(1500);
check("view count shows 1", (await page.locator("main").innerText()).includes("1 ভিউ"));
await page.reload();
await page.waitForTimeout(1500);
check("repeat view not double-counted", (await page.locator("main").innerText()).includes("1 ভিউ"));

// most-viewed sort option exists and works
await goto("/discover");
await page.getByLabel(/সাজান|Sort/).selectOption("most_viewed");
await page.waitForTimeout(800);
check("most-viewed sort loads", (await page.locator("main").innerText()).includes("QA ভিউ গল্প"));

// card shows the view count
check("card shows view count", (await page.locator("main").innerText()).includes("1 ভিউ"));

// author self-view does not inflate
await page.getByRole("button", { name: /Q/ }).first().click().catch(() => {});
await page.getByRole("menuitem", { name: /সাইন আউট|Sign out/ }).click().catch(() => {});
await page.waitForTimeout(800);
await goto("/login");
await page.getByLabel(/ইমেইল|Email/).fill("qatest@example.com");
await page.getByLabel(/পাসওয়ার্ড|Password/).fill("test1234");
await page.getByRole("button", { name: /সাইন ইন|Sign in/ }).first().click();
await page.waitForTimeout(1000);
await goto("/stories/qatest/qa-ভিউ-গল্প");
await page.waitForTimeout(1500);
check("author self-view not counted", (await page.locator("main").innerText()).includes("1 ভিউ"));

// ---------- mobile viewport ----------
await page.setViewportSize({ width: 390, height: 844 });
await goto("/");
await page.waitForTimeout(600);
check("mobile bottom nav visible", await page.getByRole("navigation", { name: "Mobile" }).isVisible());
await page.screenshot({ path: "/tmp/pwtest/mobile-home.png" });
await goto("/stories/nusrat_rahman/borshar-chithi/chhader-ghor");
await page.waitForTimeout(600);
await page.screenshot({ path: "/tmp/pwtest/mobile-reader.png" });
const mobileNoHScroll = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
check("mobile reader no horizontal scroll", mobileNoHScroll);

console.log("\n--- console/page errors ---");
console.log(errors.length ? errors.slice(0, 10).join("\n") : "(none)");

await browser.close();
const fails = results.filter((r) => r[0] === "FAIL").length;
console.log(`\n${results.length - fails}/${results.length} passed`);
process.exit(fails ? 1 : 0);
