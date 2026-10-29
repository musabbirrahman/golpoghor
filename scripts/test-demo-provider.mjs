/**
 * Headless smoke test of the DemoProvider data layer.
 * Run: node scripts/test-demo-provider.mjs
 */
import { register } from "node:module";
register("./ts-resolve.mjs", import.meta.url);

// --- minimal browser shims -------------------------------------------------
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
  get length() { return store.size; },
  key: (i) => [...store.keys()][i] ?? null,
};
globalThis.window = globalThis;

const [{ DemoProvider }, utils, card, cache] = await Promise.all([
  import("../src/lib/providers/demo-provider.ts"),
  import("../src/lib/utils.ts"),
  import("../src/lib/keepsake-card.ts"),
  import("../src/lib/signed-url-cache.ts"),
]);
const { paragraphsToDoc } = utils;

const dp = new DemoProvider();
const results = [];
const check = (name, cond) => {
  results.push([cond ? "PASS" : "FAIL", name]);
  if (!cond) process.exitCode = 1;
};

// 1. seed loaded
{
  const { stories } = await dp.listStories({ limit: 50 });
  check("seed has 4 public stories", stories.length === 4);
  check("Bangla story present", stories.some((s) => s.title === "বর্ষার চিঠি"));
  const bn = stories.find((s) => s.slug === "borshar-chithi");
  check("seed story has author joined", !!bn?.author?.username);
  check("seed story has chapter count", (bn?.chapter_count ?? 0) === 3);
}

// 2. draft chapter hidden from guests
{
  const s = (await dp.listStories({ q: "বর্ষার চিঠি" })).stories[0];
  const ch = await dp.listChapters(s.id, { publishedOnly: true });
  check("guest sees 3 published chapters", ch.length === 3);
  check("draft chapter not listed", !ch.some((c) => c.slug === "khosra-pata"));
  const direct = await dp.getChapterBySlug(s.id, "khosra-pata", { publishedOnly: true });
  check("draft chapter not fetchable by guest", direct === null);
}

// 2b. chapter lists are light (V4-04): list fields only, no bodies —
// the reader/editor load bodies one chapter at a time.
{
  const s = (await dp.listStories({ q: "বর্ষার চিঠি" })).stories[0];
  const ch = await dp.listChapters(s.id, { publishedOnly: true });
  check("chapter list carries list fields", ch.every((c) =>
    typeof c.id === "string" && typeof c.title === "string" && typeof c.slug === "string" &&
    typeof c.position === "number" && typeof c.status === "string" &&
    typeof c.word_count === "number" && "published_at" in c));
  check("chapter list has no body_json", ch.every((c) => !("body_json" in c)));
  check("chapter list has no body_text", ch.every((c) => !("body_text" in c)));
  const full = await dp.getChapterBySlug(s.id, ch[0].slug, { publishedOnly: true });
  check("single-chapter fetch still returns the body", !!full?.body_json && typeof full?.body_text === "string");
}

// 3. search (bn + en + author)
{
  const r1 = await dp.listStories({ q: "বর্ষা" });
  check("bangla search finds story", r1.stories.some((s) => s.slug === "borshar-chithi"));
  const r2 = await dp.listStories({ q: "dhaka" });
  check("english search finds story", r2.stories.some((s) => s.slug === "a-map-of-old-dhaka"));
  const r3 = await dp.listStories({ q: "nusrat_rahman" });
  check("author search finds stories", r3.stories.length === 2);
  const r4 = await dp.listStories({ language: "bn" });
  check("language filter", r4.stories.every((s) => s.language === "bn") && r4.total === 2);
}

// 3b. featured stories (seed: first two published stories featured 1, 2)
{
  const picks = await dp.listAllFeatured();
  check("seed has 2 featured stories", picks.length === 2);
  check("seed featured positions are 1, 2", picks.map((s) => s.featured_position).join(",") === "1,2");
  const shelf = await dp.listFeaturedStories(4);
  check("shelf shows 4 (picks + newest fill)", shelf.length === 4);
  check("shelf starts with picks in order", shelf[0].id === picks[0].id && shelf[1].id === picks[1].id);
  check("shelf fill excludes picks", !shelf.slice(2).some((s) => picks.some((p) => p.id === s.id)));
  check("shelf is all public", shelf.every((s) => s.status === "ongoing" || s.status === "complete"));
  const feat = await dp.listStories({ sort: "featured" });
  check("featured sort returns picks in order, no fill", feat.stories.length === 2 && feat.stories[0].id === picks[0].id && feat.stories[1].id === picks[1].id);

  // moderator: feature a third story, swap it to first, then unfeature
  await dp.signIn("moderator@golpoghor.demo", "golpoghor-demo-2026");
  const pub = await dp.listStories({});
  const third = pub.stories.find((s) => !picks.some((p) => p.id === s.id));
  await dp.setFeaturedPosition(third.id, 3);
  let after = await dp.listAllFeatured();
  check("featuring appends at position 3", after.length === 3 && after[2].id === third.id);
  await dp.setFeaturedPosition(third.id, 1);
  await dp.setFeaturedPosition(picks[0].id, 3);
  after = await dp.listAllFeatured();
  check("swap moves third story first", after[0].id === third.id && after[2].id === picks[0].id);
  await dp.setFeaturedPosition(third.id, null);
  after = await dp.listAllFeatured();
  check("unfeature removes from list", after.length === 2 && !after.some((s) => s.id === third.id));
  await dp.signOut();

  // author cannot feature (demo mirror of the DB guard trigger)
  await dp.signIn("tanvir@golpoghor.demo", "golpoghor-demo-2026");
  let blocked = false;
  try { await dp.setFeaturedPosition(third.id, 1); } catch (e) { blocked = e?.code === "notAllowed"; }
  check("author cannot feature (guard)", blocked);
  await dp.signOut();
}

// 3c. curated shelves (Phase 3b)
{
  let shelves = await dp.listCuratedShelves();
  check("no curated shelves at seed", shelves.length === 0);
  await dp.signIn("moderator@golpoghor.demo", "golpoghor-demo-2026");
  const pub = await dp.listStories({});
  const [a, b] = pub.stories;
  const shelf = await dp.createShelf("Editor's picks", "vertical");
  check("shelf created at position 1, vertical", shelf.position === 1 && shelf.layout === "vertical" && shelf.stories.length === 0);
  await dp.addShelfItem(shelf.id, a.id);
  await dp.addShelfItem(shelf.id, b.id);
  await dp.addShelfItem(shelf.id, a.id);
  shelves = await dp.listCuratedShelves();
  check("items append in order, duplicate ignored", shelves[0].stories.length === 2 && shelves[0].stories[0].id === a.id && shelves[0].stories[1].id === b.id);
  await dp.setShelfItemPosition(shelf.id, b.id, 1);
  await dp.setShelfItemPosition(shelf.id, a.id, 2);
  shelves = await dp.listCuratedShelves();
  check("item swap reorders", shelves[0].stories[0].id === b.id && shelves[0].stories[1].id === a.id);
  await dp.removeShelfItem(shelf.id, b.id);
  shelves = await dp.listCuratedShelves();
  check("item removal leaves the rest", shelves[0].stories.length === 1 && shelves[0].stories[0].id === a.id);
  await dp.updateShelf(shelf.id, { name: "Renamed", layout: "horizontal" });
  shelves = await dp.listCuratedShelves();
  check("rename + relayout apply", shelves[0].name === "Renamed" && shelves[0].layout === "horizontal");
  const second = await dp.createShelf("Second", "horizontal");
  check("second shelf at position 2", second.position === 2);
  await dp.updateShelf(second.id, { position: 1 });
  await dp.updateShelf(shelf.id, { position: 2 });
  shelves = await dp.listCuratedShelves();
  check("shelf swap reorders", shelves[0].id === second.id && shelves[1].id === shelf.id);
  await dp.deleteShelf(second.id);
  shelves = await dp.listCuratedShelves();
  check("shelf delete removes it (items cascade)", shelves.length === 1 && shelves[0].id === shelf.id);
  await dp.signOut();
  await dp.signIn("tanvir@golpoghor.demo", "golpoghor-demo-2026");
  let blocked = false;
  try { await dp.createShelf("Nope", "horizontal"); } catch (e) { blocked = e?.code === "notAllowed"; }
  check("author cannot create shelves (guard)", blocked);
  await dp.signOut();
}

// 4. signup + signin
{
  await dp.signUp({ email: "test@example.com", password: "secret12", username: "test_author", displayName: "Test Author" });
  const sess = await dp.getSession();
  check("signup creates session", !!sess?.user?.id);
  const prof = await dp.getProfile(sess.user.id);
  check("profile created with reader role", prof?.role === "reader" && prof?.username === "test_author");
  await dp.signOut();
  check("signout clears session", (await dp.getSession()) === null);
  await dp.signIn("test@example.com", "secret12");
  check("signin works", !!(await dp.getSession()));
  let failed = false;
  try { await dp.signIn("test@example.com", "wrong"); } catch { failed = true; }
  check("wrong password rejected", failed);
}

// 5. authoring: story -> chapter -> autosave -> publish
let storyId, chapterId;
{
  const story = await dp.createStory({
    title: "আমার প্রথম গল্প",
    summary: "একটি পরীক্ষামূলক গল্প।",
    language: "bn",
    genre: "ছোটগল্প",
    tags: ["পরীক্ষা"],
  });
  storyId = story.id;
  check("story created as draft", story.status === "draft" && story.slug === "আমার-প্রথম-গল্প");
  const mine = await dp.listStories({ includeDrafts: true });
  check("dashboard lists own draft", mine.stories.some((s) => s.id === storyId));
  const pub = await dp.listStories({});
  check("draft invisible publicly", !pub.stories.some((s) => s.id === storyId));

  const ch = await dp.createChapter(storyId, {
    title: "প্রথম অধ্যায়",
    body: paragraphsToDoc(["বৃষ্টি পড়ছে। জানালার কাচে ফোঁটা ফোঁটা জল।", "মিশ্র text with English words।"]),
  });
  chapterId = ch.id;
  check("chapter created as draft, position 0", ch.status === "draft" && ch.position === 0);
  check("word count computed", ch.word_count > 5);

  // autosave update (simulates editor debounce save)
  const updated = await dp.updateChapter(chapterId, {
    body: paragraphsToDoc(["বৃষ্টি পড়ছে। জানালার কাচে ফোঁটা ফোঁটা জল।", "নতুন লাইন যোগ হলো।"]),
  });
  check("autosave updates body_text", updated.body_text.includes("নতুন লাইন"));

  const published = await dp.updateChapter(chapterId, { status: "published" });
  check("chapter published", published.status === "published" && !!published.published_at);
  await dp.updateStory(storyId, { status: "ongoing" });
  const live = await dp.getStory(storyId);
  check("story published", live?.status === "ongoing");
  const pub2 = await dp.listStories({ q: "আমার প্রথম গল্প" });
  check("published story publicly visible", pub2.stories.some((s) => s.id === storyId));
}

// 6. reading: progress, reading list, like, follow, comment
{
  await dp.saveProgress(storyId, chapterId, { scrollRatio: 0.42, blockIndex: 7, blockOffset: 0.25 });
  const prog = await dp.getProgress(storyId);
  check("progress saved", prog?.chapter_id === chapterId && Math.abs((prog?.scroll_ratio ?? 0) - 0.42) < 1e-9);
  check("progress anchor saved", prog?.block_index === 7 && Math.abs((prog?.block_offset ?? 0) - 0.25) < 1e-9);
  const inprog = await dp.getInProgressStories();
  check("in-progress lists story", inprog.some((x) => x.story.id === storyId));

  check("reading list toggle on", (await dp.toggleReadingList(storyId)) === true);
  check("in reading list", await dp.isInReadingList(storyId));
  const rl = await dp.getReadingList();
  check("reading list returns story", rl.some((s) => s.id === storyId));
  check("reading list toggle off", (await dp.toggleReadingList(storyId)) === false);

  check("like toggle on", (await dp.toggleLike(storyId)) === true);
  check("like count 1", (await dp.getLikeCount(storyId)) === 1);

  const nusrat = await dp.getProfileByUsername("nusrat_rahman");
  check("follow toggle on", (await dp.toggleFollow(nusrat.id)) === true);
  check("follower count 1", (await dp.getFollowerCount(nusrat.id)) === 1);
  const following = await dp.getFollowing((await dp.getSession()).user.id);
  check("following list includes nusrat", following.some((p) => p.id === nusrat.id));
  let selfFail = false;
  try { await dp.toggleFollow((await dp.getSession()).user.id); } catch { selfFail = true; }
  check("self-follow rejected", selfFail);

  const comment = await dp.createComment(chapterId, "চমৎকার লেখা! Loved the rain imagery।");
  check("comment created", comment.body.includes("চমৎকার"));
  const comments = await dp.listComments(chapterId);
  check("comment listed", comments.length === 1);
  await dp.deleteComment(comment.id);
  check("comment deleted", (await dp.listComments(chapterId)).length === 0);
}

// 7. reports + moderation (as moderator)
{
  const me = (await dp.getSession()).user.id;
  const rep = await dp.createReport("story", storyId, "test reason", "details here");
  check("report filed", rep.status === "open");
  let blocked = false;
  try { await dp.listReports(); } catch { blocked = true; }
  check("non-moderator cannot list reports", blocked);

  await dp.signOut();
  await dp.signIn("moderator@golpoghor.demo", "golpoghor-demo-2026");
  const queue = await dp.listReports("open");
  check("moderator sees report", queue.some((r) => r.id === rep.id));
  const target = await dp.resolveReportTarget("story", storyId);
  check("target resolves with url", !!target?.url?.includes("/stories/"));
  await dp.updateReport(rep.id, "in_review");
  await dp.moderateStory(storyId, "hidden");
  const hidden = await dp.getStory(storyId);
  check("story hidden", hidden?.status === "hidden");
  const events = await dp.listModerationEvents("story", storyId);
  check("audit event logged", events.some((e) => e.action === "hide_story"));
  await dp.moderateStory(storyId, "ongoing");
  await dp.updateReport(rep.id, "resolved");
  check("report resolved", (await dp.listReports("resolved")).some((r) => r.id === rep.id));

  // privilege: moderator cannot self-promote, author cannot moderate
  await dp.signOut();
  await dp.signIn("test@example.com", "secret12");
  let modBlocked = false;
  try { await dp.moderateStory(storyId, "hidden"); } catch { modBlocked = true; }
  check("author cannot moderate", modBlocked);
  const ownStory = await dp.getStory(storyId);
  check("author still owns story", ownStory?.author_id === me);
}

// 8. cross-user isolation: another user cannot edit the story
{
  await dp.signOut();
  await dp.signUp({ email: "intruder@example.com", password: "secret12", username: "intruder", displayName: "Intruder" });
  let blocked = false;
  try { await dp.updateStory(storyId, { title: "Hacked" }); } catch { blocked = true; }
  check("non-owner cannot edit story", blocked);
  blocked = false;
  try { await dp.deleteChapter(chapterId); } catch { blocked = true; }
  check("non-owner cannot delete chapter", blocked);
  const s = await dp.getStoryBySlug("test_author", "আমার-প্রথম-গল্প");
  check("public slug lookup works", s?.id === storyId);
}

// 9. restore controls
{
  await dp.signOut();
  await dp.signIn("moderator@golpoghor.demo", "golpoghor-demo-2026");
  await dp.moderateStory(storyId, "hidden");
  check("story hidden again", (await dp.getStory(storyId))?.status === "hidden");
  await dp.restoreStory(storyId);
  check("story restored to pre-hide status", (await dp.getStory(storyId))?.status === "ongoing");
  check("restore event logged", (await dp.listModerationEvents("story", storyId)).some((e) => e.action === "restore_story"));
  let fail = false;
  try { await dp.restoreStory(storyId); } catch { fail = true; }
  check("restore non-hidden rejected", fail);
  fail = false;
  try { await dp.restoreChapter("00000000-0000-0000-0000-000000000000"); } catch { fail = true; }
  check("restore missing chapter rejected", fail);

  await dp.moderateChapter(chapterId, "hidden");
  check("chapter hidden", (await dp.resolveReportTarget("chapter", chapterId))?.status === "hidden");
  await dp.restoreChapter(chapterId);
  check("chapter restored to published", (await dp.resolveReportTarget("chapter", chapterId))?.status === "published");

  // comment hide + restore
  await dp.signOut();
  await dp.signIn("intruder@example.com", "secret12");
  const cm = await dp.createComment(chapterId, "restore me");
  await dp.signOut();
  await dp.signIn("moderator@golpoghor.demo", "golpoghor-demo-2026");
  await dp.moderateComment(cm.id, "hidden");
  check("comment hidden", (await dp.resolveReportTarget("comment", cm.id))?.status === "hidden");
  await dp.restoreComment(cm.id);
  check("comment restored to visible", (await dp.resolveReportTarget("comment", cm.id))?.status === "visible");
  // non-moderator cannot restore
  await dp.signOut();
  await dp.signIn("intruder@example.com", "secret12");
  fail = false;
  try { await dp.restoreComment(cm.id); } catch { fail = true; }
  check("non-moderator cannot restore", fail);
}

// 10. appeals
let appealId;
{
  // moderator hides the author's chapter; author appeals
  await dp.signOut();
  await dp.signIn("moderator@golpoghor.demo", "golpoghor-demo-2026");
  await dp.moderateChapter(chapterId, "hidden");
  await dp.signOut();
  await dp.signIn("test@example.com", "secret12");
  const ap = await dp.createAppeal("chapter", chapterId, "এটি ভুল করে লুকানো হয়েছে।");
  appealId = ap.id;
  check("appeal created pending", ap.status === "pending");
  let fail = false;
  try { await dp.createAppeal("chapter", chapterId, "again"); } catch { fail = true; }
  check("duplicate pending appeal rejected", fail);
  fail = false;
  try { await dp.createAppeal("story", storyId, "not hidden"); } catch { fail = true; }
  check("appeal of visible content rejected", fail);
  const mine = await dp.listMyAppeals();
  check("writer sees own appeal", mine.some((a) => a.id === appealId));
  // non-owner cannot appeal
  await dp.signOut();
  await dp.signIn("intruder@example.com", "secret12");
  fail = false;
  try { await dp.createAppeal("chapter", chapterId, "not mine"); } catch { fail = true; }
  check("non-owner appeal rejected", fail);
  fail = false;
  try { await dp.listAppeals(); } catch { fail = true; }
  check("non-moderator cannot list appeals", fail);

  // moderator decides
  await dp.signOut();
  await dp.signIn("moderator@golpoghor.demo", "golpoghor-demo-2026");
  check("moderator sees pending appeal", (await dp.listAppeals("pending")).some((a) => a.id === appealId));
  const decided = await dp.decideAppeal(appealId, "approved", "ঠিক আছে, ফিরিয়ে আনছি।");
  check("appeal approved with note", decided.status === "approved" && decided.decision_note.includes("ঠিক আছে"));
  check("appeal decision audited", (await dp.listModerationEvents("chapter", chapterId)).some((e) => e.action === "appeal_approved"));
  // approving auto-restores (the takedown was wrong) — Round 1 fix
  check("content restored after approval", (await dp.resolveReportTarget("chapter", chapterId))?.status === "published");
  // manual restore still works (queue RestoreButton path)
  await dp.moderateChapter(chapterId, "hidden");
  await dp.restoreChapter(chapterId);
  check("moderator restores manually", (await dp.resolveReportTarget("chapter", chapterId))?.status === "published");
  // writer sees the decision
  await dp.signOut();
  await dp.signIn("test@example.com", "secret12");
  check("writer sees decision", (await dp.listMyAppeals()).some((a) => a.id === appealId && a.status === "approved"));
}

// 11. notifications
{
  // follow author -> new chapter notification
  await dp.signOut();
  await dp.signIn("intruder@example.com", "secret12");
  const author = await dp.getProfileByUsername("test_author");
  await dp.toggleFollow(author.id);
  await dp.signOut();
  await dp.signIn("test@example.com", "secret12");
  const ch2 = await dp.createChapter(storyId, { title: "দ্বিতীয় অধ্যায়", body: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "আরও গল্প।" }] }] } });
  await dp.updateChapter(ch2.id, { status: "published" });
  await dp.signOut();
  await dp.signIn("intruder@example.com", "secret12");
  const notifs = await dp.listNotifications();
  check("follower notified of new chapter", notifs.some((n) => n.type === "new_chapter" && n.data.chapterTitle === "দ্বিতীয় অধ্যায়"));
  check("notification links to chapter", notifs.some((n) => n.type === "new_chapter" && (n.link ?? "").includes(ch2.slug)));
  check("unread count > 0", (await dp.getUnreadNotificationCount()) > 0);
  const first = notifs.find((n) => n.type === "new_chapter");
  await dp.markNotificationRead(first.id, true);
  check("mark read works", (await dp.listNotifications({ unreadOnly: true })).every((n) => n.id !== first.id));
  await dp.markAllNotificationsRead();
  check("mark all read works", (await dp.getUnreadNotificationCount()) === 0);

  // opt-out respected
  await dp.updateNotificationPrefs({ new_chapter: false });
  await dp.signOut();
  await dp.signIn("test@example.com", "secret12");
  const ch3 = await dp.createChapter(storyId, { title: "তৃতীয় অধ্যায়", body: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "শেষ।" }] }] } });
  await dp.updateChapter(ch3.id, { status: "published" });
  await dp.signOut();
  await dp.signIn("intruder@example.com", "secret12");
  check("opt-out suppresses notification", !(await dp.listNotifications()).some((n) => n.type === "new_chapter" && n.data.chapterTitle === "তৃতীয় অধ্যায়"));
  await dp.updateNotificationPrefs({ new_chapter: true });

  // report -> moderator notified; resolve -> reporter notified
  const rep2 = await dp.createReport("chapter", ch3.id, "test", "");
  await dp.signOut();
  await dp.signIn("moderator@golpoghor.demo", "golpoghor-demo-2026");
  check("moderator notified of report", (await dp.listNotifications()).some((n) => n.type === "report_received"));
  await dp.updateReport(rep2.id, "resolved");
  await dp.signOut();
  await dp.signIn("intruder@example.com", "secret12");
  check("reporter notified of resolution", (await dp.listNotifications()).some((n) => n.type === "report_update" && n.data.status === "resolved"));

  // hide -> author notified; appeal -> moderator + writer notified
  await dp.signOut();
  await dp.signIn("moderator@golpoghor.demo", "golpoghor-demo-2026");
  await dp.moderateChapter(ch3.id, "hidden");
  await dp.signOut();
  await dp.signIn("test@example.com", "secret12");
  check("author notified of hide", (await dp.listNotifications()).some((n) => n.type === "content_hidden"));
  const ap2 = await dp.createAppeal("chapter", ch3.id, "please review");
  await dp.signOut();
  await dp.signIn("moderator@golpoghor.demo", "golpoghor-demo-2026");
  check("moderator notified of appeal", (await dp.listNotifications()).some((n) => n.type === "appeal_submitted"));
  await dp.decideAppeal(ap2.id, "declined", "not this time");
  await dp.signOut();
  await dp.signIn("test@example.com", "secret12");
  const dec = (await dp.listNotifications()).find((n) => n.type === "appeal_decision");
  check("writer notified of appeal decision", !!dec && dec.data.decision === "declined");
  // cannot notify someone else's inbox
  let fail = false;
  try { await dp.markNotificationRead("00000000-0000-0000-0000-000000000000", true); } catch { fail = true; }
  check("cannot mark missing notification", fail);

  // admin message: moderator sends free text to one user; recipient sees it
  await dp.signOut();
  await dp.signIn("moderator@golpoghor.demo", "golpoghor-demo-2026");
  await dp.sendAdminMessage("test_author", "Hello from the founder", "Welcome to GolpoNeer.", null);
  await dp.signOut();
  await dp.signIn("test@example.com", "secret12");
  const adminMsg = (await dp.listNotifications()).find((n) => n.type === "admin_message");
  check("admin message delivered", !!adminMsg && adminMsg.data.title === "Hello from the founder" && adminMsg.data.body === "Welcome to GolpoNeer.");
  // unknown username refused
  await dp.signOut();
  await dp.signIn("moderator@golpoghor.demo", "golpoghor-demo-2026");
  let msgFail = false;
  try { await dp.sendAdminMessage("no_such_user", "Hi", "Hello"); } catch { msgFail = true; }
  check("admin message to unknown user refused", msgFail);
}


// ---------------------------------------------------------------- views
{
  // author = test@example.com, reader = intruder, moderator as needed
  await dp.signOut();
  await dp.signIn("test@example.com", "secret12");
  const me = (await dp.getSession()).user.id;
  const { stories } = await dp.listStories({ limit: 5 });
  const target = stories.find((x) => x.author_id !== me);
  check("view test story exists", !!target);

  // guest (signed out) is not tracked
  await dp.signOut();
  check("guest view not counted", (await dp.recordStoryView(target.id)) === false);

  // another signed-in reader counts once per day
  await dp.signIn("intruder@example.com", "secret12");
  const before = target.view_count;
  check("reader view counted", (await dp.recordStoryView(target.id)) === true);
  const after = (await dp.getStoryBySlug(target.author.username, target.slug)).view_count;
  check("view_count incremented by 1", after === before + 1);

  // same-day repeat does not inflate
  check("repeat view same day not counted", (await dp.recordStoryView(target.id)) === false);
  const after2 = (await dp.getStoryBySlug(target.author.username, target.slug)).view_count;
  check("view_count unchanged on repeat", after2 === after);

  // author viewing own story does not count
  await dp.signOut();
  await dp.signIn("test@example.com", "secret12");
  const mine = (await dp.listStories({ limit: 50, includeDrafts: true })).stories.find((x) => x.author_id === me && (x.status === "ongoing" || x.status === "complete"));
  if (mine) {
    check("self view not counted", (await dp.recordStoryView(mine.id)) === false);
  } else {
    check("self view story present", false);
  }

  // draft stories never count, even for non-authors (called directly by id)
  const myDraft = await dp.createStory({ title: "Draft only", slug: "draft-only-x", summary: "t", language: "en", genre: "general", tags: [], content_notice: "" });
  check("draft view not counted", (await dp.recordStoryView(myDraft.id)) === false);

  // most_viewed sorts by view_count desc, only public stories
  const mv = await dp.listStories({ sort: "most_viewed", limit: 50 });
  check("most_viewed only public", mv.stories.every((x) => x.status === "ongoing" || x.status === "complete"));
  const counts = mv.stories.map((x) => x.view_count);
  check("most_viewed sorted desc", counts.every((c, i) => i === 0 || counts[i - 1] >= c));
  check("most_viewed puts viewed story first", (() => {
    // deterministic: every story ahead of target must have >= its count
    const tCount = (mv.stories.find((x) => x.id === target.id) ?? { view_count: -1 }).view_count;
    const idx = mv.stories.findIndex((x) => x.id === target.id);
    return idx >= 0 && mv.stories.slice(0, idx).every((x) => x.view_count >= tCount);
  })());
}

// ------------------------------------------------- zero-chapter publish
{
  await dp.signOut();
  await dp.signIn("test@example.com", "secret12");
  const me = (await dp.getSession()).user.id;

  // 1. publishing a story with NO chapters is blocked in the data layer
  const s0 = await dp.createStory({ title: "No chapter story", slug: "no-chapter-story", summary: "t", language: "en", genre: "general", tags: [], content_notice: "" });
  let blocked = false;
  try { await dp.updateStory(s0.id, { status: "ongoing" }); } catch (e) { blocked = e.code === "noPublishedChapters"; }
  check("publish with zero chapters blocked", blocked);
  check("story stays draft", (await dp.getStory(s0.id)).status === "draft");
  check("zero-chapter story not public", !(await dp.listStories({ limit: 100 })).stories.some((x) => x.id === s0.id));
  check("zero-chapter story invisible to guests", (await dp.getStoryBySlug("test", "no-chapter-story")) === null);
  check("owner can still see own draft", !!(await dp.getStory(s0.id)));

  // 2. publishing with one published chapter succeeds
  const ch = await dp.createChapter(s0.id, { title: "Ch 1", slug: "ch-1" });
  await dp.updateChapter(ch.id, { title: "Ch 1", body: paragraphsToDoc(["hello"]), status: "published" });
  const pub = await dp.updateStory(s0.id, { status: "ongoing" });
  check("publish with one chapter works", pub.status === "ongoing");
  check("published story is public", (await dp.listStories({ limit: 100 })).stories.some((x) => x.id === s0.id));

  // 3. removing the last published chapter hides the story publicly
  await dp.updateChapter(ch.id, { status: "unpublished" });
  check("story gone from public list", !(await dp.listStories({ limit: 100 })).stories.some((x) => x.id === s0.id));
  check("story gone from public search", !(await dp.listStories({ q: "No chapter story", limit: 100 })).stories.some((x) => x.id === s0.id));
  check("story invisible to guests", (await dp.getStoryBySlug("test", "no-chapter-story")) === null);
  check("owner still sees it", !!(await dp.getStory(s0.id)));
  check("status stays ongoing (visibility is derived)", (await dp.getStory(s0.id)).status === "ongoing");

  // 4. moderator cannot restore a chapterless hidden story to public
  await dp.signOut();
  await dp.signIn("moderator@golpoghor.demo", "golpoghor-demo-2026");
  await dp.moderateStory(s0.id, "hidden");
  let restoreBlocked = false;
  try { await dp.restoreStory(s0.id); } catch (e) { restoreBlocked = e.code === "noPublishedChapters"; }
  check("restore of chapterless story blocked", restoreBlocked);

  // 5. moderator hiding the last published chapter removes it publicly
  await dp.signOut();
  await dp.signIn("test@example.com", "secret12");
  await dp.updateChapter(ch.id, { title: "Ch 1", body: paragraphsToDoc(["hello"]), status: "published" });
  await dp.signOut();
  await dp.signIn("moderator@golpoghor.demo", "golpoghor-demo-2026");
  await dp.restoreStory(s0.id); // chapter exists again -> restore works
  check("restore works with chapter", (await dp.listStories({ limit: 100 })).stories.some((x) => x.id === s0.id));
  await dp.moderateChapter(ch.id, "hidden");
  check("hidden last chapter -> story not public", !(await dp.listStories({ limit: 100 })).stories.some((x) => x.id === s0.id));
  // writer is told the story consequence
  await dp.signOut();
  await dp.signIn("test@example.com", "secret12");
  const hn = (await dp.listNotifications()).find((n) => n.type === "content_hidden" && n.data.targetType === "chapter");
  check("writer notified of chapter hide", !!hn);
  check("notification explains story now hidden", hn?.data.storyHidden === "true");
}

// 19. account self-service (V4-07): rename + reservation + cooldown,
// password change, and full deletion — mirroring the Postgres functions.
{
  const code = async (fn) => {
    try { await fn(); return null; } catch (e) { return e?.code ?? "threw"; }
  };
  await dp.signUp({ email: "renamer@example.com", password: "secret12", username: "rename_author", displayName: "Renamer" });
  const story = await dp.createStory({ title: "Rename Test Story", summary: "x", language: "en", genre: "Mystery", tags: [] });
  await dp.createChapter(story.id, { title: "One", body: paragraphsToDoc(["Some body text here."]) });
  await dp.signUp({ email: "other@example.com", password: "secret12", username: "other_handle", displayName: "Other" });
  await dp.signIn("renamer@example.com", "secret12");

  check("rename: invalid format refused", (await code(() => dp.changeUsername("Bad Name!"))) === "usernameInvalid");
  check("rename: own current name refused", (await code(() => dp.changeUsername("rename_author"))) === "usernameSame");
  check("rename: taken name refused", (await code(() => dp.changeUsername("other_handle"))) === "usernameTaken");
  check("rename: valid free name succeeds", (await code(() => dp.changeUsername("renamed_author"))) === null);
  check("old handle no longer resolves as a profile", (await dp.getProfileByUsername("rename_author")) === null);
  check("new handle resolves", (await dp.getProfileByUsername("renamed_author"))?.username === "renamed_author");
  check("old handle redirects to the new one", (await dp.resolveUsername("rename_author")) === "renamed_author");
  check("current handle needs no redirect", (await dp.resolveUsername("renamed_author")) === null);
  check("unknown handle has no redirect", (await dp.resolveUsername("nobody_here")) === null);
  check("rename: immediate second change hits the cooldown", (await code(() => dp.changeUsername("third_name"))) === "usernameCooldown");

  await dp.signIn("other@example.com", "secret12");
  check("rename: another user cannot take the reserved handle", (await code(() => dp.changeUsername("rename_author"))) === "usernameReserved");
  check("signup: a fresh account cannot take the reserved handle",
    (await code(() => dp.signUp({ email: "third@example.com", password: "secret12", username: "rename_author", displayName: "Third" }))) === "usernameReserved");

  // Backdate the cooldown in the stored DB and reload, as if 31 days passed.
  const raw = JSON.parse(store.get("golpoghor-demo-v1"));
  const prof = raw.profiles.find((p) => p.username === "renamed_author");
  prof.username_changed_at = new Date(Date.now() - 31 * 86400000).toISOString();
  store.set("golpoghor-demo-v1", JSON.stringify(raw));
  const dp2 = new DemoProvider();
  await dp2.signIn("renamer@example.com", "secret12");
  check("rename: owner reclaims their own old handle after cooldown", (await code(() => dp2.changeUsername("rename_author"))) === null);
  check("reclaim swaps the redirect", (await dp2.resolveUsername("renamed_author")) === "rename_author");

  check("password: change succeeds in session", (await code(() => dp2.updatePassword("newsecret1"))) === null);
  await dp2.signOut();
  check("password: old password no longer signs in", (await code(() => dp2.signIn("renamer@example.com", "secret12"))) === "signInFailed");
  await dp2.signIn("renamer@example.com", "newsecret1");
  check("password: new password signs in", !!(await dp2.getSession()));

  const authorId = (await dp2.getSession()).user.id;
  check("delete: story present before deletion", (await dp2.listStories({ authorId, includeDrafts: true })).stories.some((s) => s.id === story.id));
  await dp2.deleteAccount();
  check("delete: session cleared", (await dp2.getSession()) === null);
  check("delete: profile gone", (await dp2.getProfileByUsername("rename_author")) === null);
  await dp2.signIn("other@example.com", "secret12");
  check("delete: stories gone with the account", (await dp2.listStories({ authorId })).stories.length === 0);
  await dp2.signOut();
  check("delete: redirects removed with the account", (await dp2.resolveUsername("renamed_author")) === null);
  check("delete: sign-in no longer possible", (await code(() => dp2.signIn("renamer@example.com", "newsecret1"))) === "signInFailed");
  check("delete: other users untouched", (await dp2.getProfileByUsername("other_handle"))?.username === "other_handle");
}

// Story slug redirects: a rename records the old slug, and old slugs
// resolve to the current slug (mirroring the SQL trigger behaviour).
{
  await dp.signUp({ email: "slugger@example.com", password: "secret12", username: "slug_author", displayName: "Slugger" });
  const story = await dp.createStory({ title: "Slug Test Story", summary: "x", language: "en", genre: "Mystery", tags: [] });
  const authorId = (await dp.getSession()).user.id;
  const oldSlug = story.slug;
  check("slug redirect: no redirect before any rename", (await dp.resolveStorySlug(authorId, oldSlug)) === null);
  await dp.updateStory(story.id, { slug: "renamed-slug" });
  check("slug redirect: old slug resolves to the new slug", (await dp.resolveStorySlug(authorId, oldSlug)) === "renamed-slug");
  check("slug redirect: live story found at the new slug", (await dp.getStoryBySlug("slug_author", "renamed-slug"))?.id === story.id);
  check("slug redirect: old slug no longer resolves live", (await dp.getStoryBySlug("slug_author", oldSlug)) === null);
  await dp.updateStory(story.id, { slug: "second-slug" });
  check("slug redirect: first slug still resolves to the latest slug", (await dp.resolveStorySlug(authorId, oldSlug)) === "second-slug");
  check("slug redirect: intermediate slug resolves to the latest slug", (await dp.resolveStorySlug(authorId, "renamed-slug")) === "second-slug");
  check("slug redirect: unknown slug resolves to null", (await dp.resolveStorySlug(authorId, "never-existed")) === null);
  await dp.deleteStory(story.id);
  check("slug redirect: rows removed with the story", (await dp.resolveStorySlug(authorId, oldSlug)) === null);
}

// Slug re-take + rename-back (Argon Medium): claiming a slug clears its
// stale redirects, so a deleted previous owner never misdirects.
{
  await dp.signUp({ email: "retaker@example.com", password: "secret12", username: "retake_author", displayName: "Retaker" });
  const first = await dp.createStory({ title: "Monsoon", summary: "x", language: "en", genre: "Mystery", tags: [] });
  const authorId = (await dp.getSession()).user.id;
  await dp.updateStory(first.id, { slug: "monsoon-revised" });
  check("slug retake: old slug recorded", (await dp.resolveStorySlug(authorId, "monsoon")) === "monsoon-revised");
  const second = await dp.createStory({ title: "Monsoon", summary: "y", language: "en", genre: "Mystery", tags: [] });
  await dp.deleteStory(second.id);
  check("slug retake: deleted previous owner does not misdirect", (await dp.resolveStorySlug(authorId, "monsoon")) === null);
  await dp.updateStory(first.id, { slug: "monsoon" });
  check("slug rename-back: live story found at the reclaimed slug", (await dp.getStoryBySlug("retake_author", "monsoon"))?.id === first.id);
  check("slug rename-back: no self-redirect residue", (await dp.resolveStorySlug(authorId, "monsoon")) === null);
  check("slug rename-back: intermediate slug resolves to the live slug", (await dp.resolveStorySlug(authorId, "monsoon-revised")) === "monsoon");
}

// 20. write throttles (V4-17): rapid-fire comments/reports are refused
// after the per-hour limit, per user, mirroring the Postgres triggers.
{
  const code = async (fn) => {
    try { await fn(); return null; } catch (e) { return e?.code ?? "threw"; }
  };
  await dp.signUp({ email: "spammy@example.com", password: "secret12", username: "spammy", displayName: "Spammy" });
  const story = (await dp.listStories({ q: "বর্ষার চিঠি" })).stories[0];
  const chapter = (await dp.listChapters(story.id, { publishedOnly: true }))[0];
  let commentFails = 0;
  for (let i = 0; i < 30; i++) {
    if ((await code(() => dp.createComment(chapter.id, `comment ${i}`))) !== null) commentFails++;
  }
  check("throttle: 30 comments in an hour pass", commentFails === 0);
  check("throttle: the 31st comment is refused", (await code(() => dp.createComment(chapter.id, "one too many"))) === "rateLimited");
  let reportFails = 0;
  for (let i = 0; i < 10; i++) {
    if ((await code(() => dp.createReport("story", story.id, "spam", ""))) !== null) reportFails++;
  }
  check("throttle: 10 reports in an hour pass", reportFails === 0);
  check("throttle: the 11th report is refused", (await code(() => dp.createReport("story", story.id, "spam", ""))) === "rateLimited");
  await dp.signUp({ email: "calm@example.com", password: "secret12", username: "calm_user", displayName: "Calm" });
  check("throttle: another user is unaffected", (await code(() => dp.createComment(chapter.id, "hello"))) === null);
  await dp.signOut();
}

// 21. genre freeze (V4-14/D6): legacy English values group under the
// canonical taxonomy; filters accept either spelling.
{
  const code = async (fn) => {
    try { await fn(); return null; } catch (e) { return e?.code ?? "threw"; }
  };
  await dp.signUp({ email: "genre@example.com", password: "secret12", username: "genre_writer", displayName: "Genre Writer" });
  const st = await dp.createStory({ title: "Genre Grouping Tale", summary: "x", language: "en", genre: "Mystery", tags: [] });
  const ch = await dp.createChapter(st.id, { title: "One", body: paragraphsToDoc(["Mystery body text here."]) });
  await dp.updateChapter(ch.id, { status: "published" });
  await dp.updateStory(st.id, { status: "ongoing" });
  const genres = await dp.listGenres();
  check("genre: listGenres returns the canonical value", genres.includes("রহস্য"));
  check("genre: listGenres hides the legacy alias", !genres.includes("Mystery"));
  check("genre: filter by canonical finds the legacy story",
    (await dp.listStories({ genre: "রহস্য" })).stories.some((s) => s.id === st.id));
  check("genre: filter by legacy alias also finds it",
    (await dp.listStories({ genre: "Mystery" })).stories.some((s) => s.id === st.id));
  check("genre: unrelated genre filter excludes it",
    !(await dp.listStories({ genre: "হরর" })).stories.some((s) => s.id === st.id));
  await dp.signOut();
}

// 22. avatar upload (V4-22): demo stores a data URL as avatar_path and
// avatarUrl passes it through; type/size guards match the live provider.
{
  const code = async (fn) => {
    try { await fn(); return null; } catch (e) { return e?.code ?? "threw"; }
  };
  globalThis.FileReader = class {
    readAsDataURL() {
      this.result = "data:image/png;base64,iVBORw0KGgo=";
      this.onload?.();
    }
  };
  await dp.signUp({ email: "avatar@example.com", password: "secret12", username: "avatar_user", displayName: "Avatar User" });
  const me = (await dp.getSession()).user.id;
  const path = await dp.uploadAvatar({ type: "image/png", size: 2048 });
  check("avatar: upload returns a data URL in demo", typeof path === "string" && path.startsWith("data:image/png"));
  await dp.updateProfile(me, { avatar_path: path });
  check("avatar: profile carries the path", (await dp.getProfile(me))?.avatar_path === path);
  check("avatar: avatarUrl resolves the data URL", dp.avatarUrl(path) === path);
  check("avatar: avatarUrl of null is null", dp.avatarUrl(null) === null);
  check("avatar: non-image refused", (await code(() => dp.uploadAvatar({ type: "text/plain", size: 10 }))) === "generic");
  check("avatar: oversize refused", (await code(() => dp.uploadAvatar({ type: "image/png", size: 2 * 1024 * 1024 }))) === "generic");
  await dp.signOut();
}

// 23. keepsakes (V4-27a): private foundation — owner CRUD, snapshot
// attribution, K1 cap, readability gate, publish matrix, projection.
{
  const code = async (fn) => {
    try { await fn(); return null; } catch (e) { return e?.code ?? "threw"; }
  };
  await dp.signUp({ email: "keeper-author@example.com", password: "secret12", username: "keeper_author", displayName: "Keeper Author" });
  const st = await dp.createStory({ title: "Kept Tale", summary: "x", language: "en", genre: "general", tags: [] });
  const ch = await dp.createChapter(st.id, { title: "One", body: paragraphsToDoc(["A line worth keeping, and more."]) });
  await dp.updateChapter(ch.id, { status: "published" });
  await dp.updateStory(st.id, { status: "ongoing" });
  const st2 = await dp.createStory({ title: "Other Tale", summary: "x", language: "en", genre: "general", tags: [] });
  const ch2 = await dp.createChapter(st2.id, { title: "One", body: paragraphsToDoc(["Another story's line."]) });
  await dp.updateChapter(ch2.id, { status: "published" });
  await dp.updateStory(st2.id, { status: "ongoing" });
  const draft = await dp.createStory({ title: "Draft Tale", summary: "x", language: "en", genre: "general", tags: [] });
  await dp.signOut();
  await dp.signUp({ email: "keeper-reader@example.com", password: "secret12", username: "keeper_reader", displayName: "Keeper Reader" });
  check("keepsake: draft source is not readable to a reader",
    (await code(() => dp.createKeepsake({ storyId: draft.id, excerpt: "nope" }))) === "keepsakeSourceNotReadable");
  check("keepsake: empty excerpt refused",
    (await code(() => dp.createKeepsake({ storyId: st.id, excerpt: "  " }))) === "invalidInput");
  check("keepsake: 1001-char excerpt refused (K1)",
    (await code(() => dp.createKeepsake({ storyId: st.id, excerpt: "x".repeat(1001) }))) === "invalidInput");
  check("keepsake: unknown template refused",
    (await code(() => dp.createKeepsake({ storyId: st.id, excerpt: "ok", template: "nope" }))) === "invalidInput");
  check("keepsake: chapter from another story refused",
    (await code(() => dp.createKeepsake({ storyId: st.id, chapterId: ch2.id, excerpt: "ok" }))) === "invalidInput");
  const k = await dp.createKeepsake({ storyId: st.id, chapterId: ch.id, excerpt: "A line worth keeping", template: "midnight", echo: "It stayed with me." });
  check("keepsake: created private with snapshot title/author",
    k.visibility === "private" && k.source_title === "Kept Tale" && k.source_author_name === "Keeper Author");
  check("keepsake: projection hides private cards", (await dp.listPublicKeepsakes()).every((p) => p.id !== k.id));
  check("keepsake: publish from another author's uncovered original is refused with the licence code",
    (await code(() => dp.publishKeepsake(k.id))) === "keepsakeNotEligibleLicence");
  check("keepsake: owner list shows it", (await dp.listMyKeepsakes()).some((x) => x.id === k.id));
  await dp.signOut();
  await dp.signIn("keeper-author@example.com", "secret12");
  check("keepsake: other user cannot see it", (await dp.getKeepsake(k.id)) === null);
  check("keepsake: other user cannot update it",
    (await code(() => dp.updateKeepsake(k.id, { excerpt: "hijack" }))) === "notAuthor");
  check("keepsake: other user cannot delete it",
    (await code(() => dp.deleteKeepsake(k.id))) === "notAuthor");
  check("keepsake: author list is empty", (await dp.listMyKeepsakes()).length === 0);
  const own = await dp.createKeepsake({ storyId: st.id, excerpt: "My own line", echo: "Mine." });
  check("keepsake: author can save from own draft", (await dp.createKeepsake({ storyId: draft.id, excerpt: "draft line" })).story_id === draft.id);
  const pub = await dp.publishKeepsake(own.id);
  check("keepsake: own-story publish succeeds with basis",
    pub.visibility === "public" && pub.eligibility_basis === "own-story");
  const shown = (await dp.listPublicKeepsakes()).find((p) => p.id === own.id);
  check("keepsake: projection shows it, echo gated off by default",
    !!shown && shown.echo === null && shown.source_title === "Kept Tale");
  await dp.updateKeepsake(own.id, { echo_public: true });
  check("keepsake: echo appears only after per-keepsake opt-in",
    (await dp.listPublicKeepsakes()).find((p) => p.id === own.id)?.echo === "Mine.");
  await dp.updateStory(st.id, { title: "Renamed Tale" });
  check("keepsake: snapshot is not rewritten by a story edit",
    (await dp.getKeepsake(own.id)).source_title === "Kept Tale");
  await dp.updateStory(st.id, { status: "hidden" });
  check("keepsake: projection drops it when the source goes private",
    !(await dp.listPublicKeepsakes()).some((p) => p.id === own.id));
  await dp.updateStory(st.id, { status: "ongoing" });
  check("keepsake: projection restores it when the source returns",
    (await dp.listPublicKeepsakes()).some((p) => p.id === own.id));
  await dp.deleteKeepsake(own.id);
  check("keepsake: delete removes it everywhere",
    !(await dp.listMyKeepsakes()).some((x) => x.id === own.id) &&
    !(await dp.listPublicKeepsakes()).some((p) => p.id === own.id));
  await dp.signOut();
}

// 24. keepsakes studio helpers (V4-27b, Node-safe pure functions).
{
  const { normalizeExcerpt, keepsakeAttribution, CARD_TEMPLATES } = card;
  check("studio: normalize collapses spaces but keeps line breaks",
    normalizeExcerpt("  a   b\n\nc  ") === "a b\n\nc");
  check("studio: normalize caps at 1000 on a word boundary",
    (() => {
      const out = normalizeExcerpt("word ".repeat(300));
      return out.length <= 1000 && !out.endsWith(" ") && out.split(" ").every((w) => w === "word");
    })());
  check("studio: six templates with distinct palettes",
    Object.keys(CARD_TEMPLATES).length === 6 &&
    new Set(Object.values(CARD_TEMPLATES).map((p) => p.bg)).size === 6);
  check("studio: attribution from story metadata, absent author is empty",
    keepsakeAttribution({ title: "T", author: { display_name: "A" } }).author === "A" &&
    keepsakeAttribution({ title: "T", author: null }).author === "");
}

// 25. attribution metadata (V4-28): conditional fields round-trip in both
// providers' demo mirror; snapshot + card credit translator separately.
{
  await dp.signUp({ email: "attr@example.com", password: "secret12", username: "attr_author", displayName: "Attr Author" });
  const tr = await dp.createStory({
    title: "Translated Tale", summary: "x", language: "en", genre: "general", tags: [],
    origin_type: "translation", original_author: "Old Master", original_title: "Old Title",
    translator_name: "Attr Author", edition_source: "Gutenberg #123",
  });
  check("attr: translation fields round-trip",
    tr.origin_type === "translation" && tr.original_author === "Old Master" &&
    tr.translator_name === "Attr Author" && tr.edition_source === "Gutenberg #123");
  const ch = await dp.createChapter(tr.id, { title: "One", body: paragraphsToDoc(["Translated line here."]) });
  await dp.updateChapter(ch.id, { status: "published" });
  await dp.updateStory(tr.id, { status: "ongoing" });
  const k = await dp.createKeepsake({ storyId: tr.id, excerpt: "Translated line here." });
  check("attr: snapshot carries original + translator + edition",
    k.source_original_author === "Old Master" && k.source_translator_name === "Attr Author" &&
    k.source_edition === "Gutenberg #123");
  const { keepsakeAttribution: attr } = card;
  check("attr: card credits original author and translator as different people",
    attr(tr, "en").author === "Old Master · Translated by Attr Author");
  check("attr: card in Bangla uses Bangla credit words",
    attr(tr, "bn").author === "Old Master · অনুবাদ: Attr Author");
  await dp.updateStory(tr.id, { origin_type: "original", original_author: null, original_title: null, translator_name: null, edition_source: null });
  const back = await dp.getStory(tr.id);
  check("attr: switching to original clears attribution fields",
    back.origin_type === "original" && back.original_author === null && back.translator_name === null);
  const plain = await dp.createStory({ title: "Plain Tale", summary: "x", language: "en", genre: "general", tags: [] });
  check("attr: new stories default to original with no extra fields",
    plain.origin_type === "original" && plain.original_author === null);
  await dp.signOut();
}

// 26. echo display + edit (Library): echo saved at creation is listed,
// editable by its owner, clearable, and never editable by another user.
{
  await dp.signUp({ email: "echo@example.com", password: "secret12", username: "echo_author", displayName: "Echo Author" });
  const s = await dp.createStory({ title: "Echo Tale", summary: "x", language: "en", genre: "general", tags: [] });
  const ch = await dp.createChapter(s.id, { title: "One", body: paragraphsToDoc(["An echo line."]) });
  await dp.updateChapter(ch.id, { status: "published" });
  await dp.updateStory(s.id, { status: "ongoing" });
  const k = await dp.createKeepsake({ storyId: s.id, excerpt: "An echo line.", echo: "This line stayed with me." });
  const mine = await dp.listMyKeepsakes();
  check("echo: saved echo is listed with the keepsake",
    mine.some((x) => x.id === k.id && x.echo === "This line stayed with me."));
  const edited = await dp.updateKeepsake(k.id, { echo: "Edited echo." });
  check("echo: owner can edit the echo", edited.echo === "Edited echo.");
  const cleared = await dp.updateKeepsake(k.id, { echo: null });
  check("echo: echo can be cleared", cleared.echo === null);
  await dp.signOut();
  await dp.signUp({ email: "echo2@example.com", password: "secret12", username: "echo_other", displayName: "Echo Other" });
  let blocked = false;
  try { await dp.updateKeepsake(k.id, { echo: "Hijack." }); } catch { blocked = true; }
  check("echo: another user cannot edit someone else's echo", blocked);
  await dp.signOut();
}

// 27. poem line breaks survive (card renderer + studio normalization).
{
  const { normalizeExcerpt } = card;
  check("poem: blank lines take half height on the card",
    card.cardLineHeight("", 44) === 38.5 && card.cardLineHeight("text", 44) === 77);
  const stubCtx = { measureText: (s) => ({ width: s.length * 10 }) };
  check("poem: canvas wrap keeps explicit lines and stanza gaps",
    JSON.stringify(card.wrapText(stubCtx, "short line\nlonger second line\n\nstanza two", 100)) ===
    JSON.stringify(["short line", "longer", "second", "line", "", "stanza two"]));
  check("poem: line breaks and stanza gaps are preserved",
    normalizeExcerpt("line one\nline two\n\nline four") === "line one\nline two\n\nline four");
  check("poem: spaces collapse within a line, breaks stay",
    normalizeExcerpt("  too   many   spaces\nnext   line  ") === "too many spaces\nnext line");
  check("poem: leading/trailing blank lines trimmed, inner gap kept to one",
    normalizeExcerpt("\n\nfirst\n\n\n\nsecond\n\n") === "first\n\nsecond");
  const long = "a".repeat(400) + "\n" + "b".repeat(400) + "\n" + "c".repeat(400);
  const capped = normalizeExcerpt(long);
  check("poem: 1000-char cap cuts at a line boundary, keeps earlier breaks",
    capped.length <= 1000 && capped.includes("\n") && !capped.includes("c"));
  await dp.signUp({ email: "poem@example.com", password: "secret12", username: "poem_author", displayName: "Poem Author" });
  const s = await dp.createStory({ title: "Poem Tale", summary: "x", language: "bn", genre: "general", tags: [] });
  const ch = await dp.createChapter(s.id, { title: "One", body: paragraphsToDoc(["Poem line."]) });
  await dp.updateChapter(ch.id, { status: "published" });
  await dp.updateStory(s.id, { status: "ongoing" });
  const k = await dp.createKeepsake({ storyId: s.id, excerpt: "first line\nsecond line\n\nthird stanza" });
  const mine = await dp.listMyKeepsakes();
  check("poem: stored keepsake excerpt keeps its line breaks",
    mine.some((x) => x.id === k.id && x.excerpt === "first line\nsecond line\n\nthird stanza"));
  await dp.signOut();
}

// 28. keepsakes public sharing (V4-27c): publish matrix, public page,
// unpublish, licence accept/withdraw (future-only default), moderation.
{
  const code = async (fn) => {
    try { await fn(); return null; } catch (e) { return e?.code ?? "threw"; }
  };
  // Author + original story; reader publishes from it.
  await dp.signUp({ email: "pub-author@example.com", password: "secret12", username: "pub_author", displayName: "Pub Author" });
  const st = await dp.createStory({ title: "Shared Tale", summary: "x", language: "en", genre: "general", tags: [] });
  const ch = await dp.createChapter(st.id, { title: "One", body: paragraphsToDoc(["A line for the world."]) });
  await dp.updateChapter(ch.id, { status: "published" });
  await dp.updateStory(st.id, { status: "ongoing" });
  await dp.signOut();
  await dp.signUp({ email: "pub-reader@example.com", password: "secret12", username: "pub_reader", displayName: "Pub Reader" });
  const me = (await dp.getSession()).user.id;
  const k = await dp.createKeepsake({ storyId: st.id, excerpt: "A line for the world." });
  check("27c: uncovered original publish refused (licence code)",
    (await code(() => dp.publishKeepsake(k.id))) === "keepsakeNotEligibleLicence");
  // Licence accept is author-only.
  check("27c: non-author cannot accept the licence",
    (await code(() => dp.acceptKeepsakeLicence(st.id))) === "notAuthor");
  await dp.signOut();
  await dp.signIn("pub-author@example.com", "secret12");
  const lic = await dp.acceptKeepsakeLicence(st.id);
  check("27c: author accepts licence", lic.covered === true);
  await dp.signOut();
  await dp.signIn("pub-reader@example.com", "secret12");
  const pub = await dp.publishKeepsake(k.id);
  check("27c: covered story publishes with licence basis + slug",
    pub.visibility === "public" && pub.eligibility_basis === "licence" && !!pub.slug);
  const page = await dp.getPublicKeepsake(pub.slug);
  check("27c: public page serves the projection row",
    !!page && page.excerpt === "A line for the world." && page.source_slug === st.slug);
  check("27c: public page hides the echo without opt-in", page.echo === null);
  // Echo opt-in flows through.
  await dp.updateKeepsake(k.id, { echo: "It stayed.", echo_public: true });
  check("27c: public page shows echo after opt-in",
    (await dp.getPublicKeepsake(pub.slug)).echo === "It stayed.");
  // Withdrawal: new publishes blocked, already-public stays (draft default).
  await dp.signOut();
  await dp.signIn("pub-author@example.com", "secret12");
  await dp.withdrawKeepsakeLicence(st.id);
  check("27c: licence withdrawn", (await dp.getKeepsakeLicence(st.id)).covered === false);
  await dp.signOut();
  await dp.signIn("pub-reader@example.com", "secret12");
  const k2 = await dp.createKeepsake({ storyId: st.id, excerpt: "A second line." });
  check("27c: post-withdrawal publish blocked",
    (await code(() => dp.publishKeepsake(k2.id))) === "keepsakeNotEligibleLicence");
  check("27c: already-public keepsake stays public after withdrawal (future-only)",
    !!(await dp.getPublicKeepsake(pub.slug)));
  // Unpublish revokes the page on next read.
  await dp.unpublishKeepsake(k.id);
  check("27c: unpublish removes the public page",
    (await dp.getPublicKeepsake(pub.slug)) === null);
  // Verified-PD path: any reader publishes, no licence anywhere.
  const classic = (await dp.listStories({ limit: 50 })).stories.find((s) => s.slug === "demo-classic-tale");
  const kc = await dp.createKeepsake({ storyId: classic.id, excerpt: "It was an old tale, told by the river, of a traveller who carried nothing but a lantern and a promise." });
  const pubc = await dp.publishKeepsake(kc.id);
  check("27c: verified-PD publishes with public-domain basis",
    pubc.visibility === "public" && pubc.eligibility_basis === "public-domain");
  // Moderation: report → restrict → page down → restore → page back.
  const rep = await dp.createReport("keepsake", kc.id, "Test report", "");
  check("27c: keepsake report filed", rep.target_type === "keepsake");
  await dp.signOut();
  await dp.signIn("moderator@golpoghor.demo", "golpoghor-demo-2026");
  await dp.restrictKeepsake(kc.id);
  check("27c: moderator restrict takes the public page down",
    (await dp.getPublicKeepsake(pubc.slug)) === null);
  await dp.restoreKeepsake(kc.id);
  check("27c: moderator restore brings the public page back",
    !!(await dp.getPublicKeepsake(pubc.slug)));
  const target = await dp.resolveReportTarget("keepsake", kc.id);
  check("27c: report target resolves to the keepsake excerpt",
    !!target && target.label.startsWith("Keepsake:"));
  await dp.signOut();
  // Own-story publish still works.
  await dp.signIn("pub-author@example.com", "secret12");
  const own = await dp.createKeepsake({ storyId: st.id, excerpt: "My own line." });
  const pubOwn = await dp.publishKeepsake(own.id);
  check("27c: own-story publish works with own-story basis",
    pubOwn.visibility === "public" && pubOwn.eligibility_basis === "own-story");
  await dp.signOut();
}

// 29. keepsakes shelf (27c follow-up): projection list is newest-first
// and never includes private cards.
{
  await dp.signUp({ email: "shelf@example.com", password: "secret12", username: "shelf_user", displayName: "Shelf User" });
  const st = await dp.createStory({ title: "Shelf Tale", summary: "x", language: "en", genre: "general", tags: [] });
  const ch = await dp.createChapter(st.id, { title: "One", body: paragraphsToDoc(["First shelf line."]) });
  await dp.updateChapter(ch.id, { status: "published" });
  await dp.updateStory(st.id, { status: "ongoing" });
  const a = await dp.createKeepsake({ storyId: st.id, excerpt: "First shelf line." });
  const b = await dp.createKeepsake({ storyId: st.id, excerpt: "Private shelf line." });
  await dp.publishKeepsake(a.id);
  const list = await dp.listPublicKeepsakes();
  check("shelf: published card listed, private card absent",
    list.some((x) => x.id === a.id) && !list.some((x) => x.id === b.id));
  const sorted = [...list].sort((x, y) => (y.published_at ?? "").localeCompare(x.published_at ?? ""));
  check("shelf: list orders newest first",
    list.every((x, i) => x.id === sorted[i].id));
  await dp.signOut();
}

// 30. keeper credit (27c follow-up): the public projection carries the
// keeper's display name; private cards never expose it.
{
  await dp.signUp({ email: "keeper2@example.com", password: "secret12", username: "keeper_two", displayName: "Keeper Two" });
  const st = await dp.createStory({ title: "Keeper Tale", summary: "x", language: "en", genre: "general", tags: [] });
  const ch = await dp.createChapter(st.id, { title: "One", body: paragraphsToDoc(["A kept line."]) });
  await dp.updateChapter(ch.id, { status: "published" });
  await dp.updateStory(st.id, { status: "ongoing" });
  const k = await dp.createKeepsake({ storyId: st.id, excerpt: "A kept line." });
  const pub = await dp.publishKeepsake(k.id);
  const page = await dp.getPublicKeepsake(pub.slug);
  check("keeper: public page carries the keeper display name",
    !!page && page.keeper_name === "Keeper Two");
  check("keeper: shelf row carries the keeper display name",
    (await dp.listPublicKeepsakes()).some((x) => x.id === k.id && x.keeper_name === "Keeper Two"));
  await dp.signOut();
}

// 31. admin metrics (V4-12): numbers match independent reads, and move
// exactly with the actions that should move them.
{
  const code = async (fn) => {
    try { await fn(); return null; } catch (e) { return e?.code ?? "threw"; }
  };
  await dp.signIn("moderator@golpoghor.demo", "golpoghor-demo-2026");
  const m0 = await dp.getAdminMetrics();
  check("metrics: all fields are non-negative numbers",
    [m0.signups, m0.storiesPublished, m0.chaptersPublished, m0.views7d, m0.views30d, m0.openReports, m0.appealsPending]
      .every((v) => typeof v === "number" && v >= 0));
  check("metrics: 7-day views never exceed 30-day views", m0.views7d <= m0.views30d);
  const openNow = (await dp.listReports()).filter((r) => r.status === "open" || r.status === "in_review").length;
  check("metrics: open reports match the report queue", m0.openReports === openNow);
  const pendingNow = (await dp.listAppeals()).filter((a) => a.status === "pending").length;
  check("metrics: pending appeals match the appeals list", m0.appealsPending === pendingNow);
  await dp.signOut();

  // A counted view moves both windows by exactly one (or zero if already
  // counted today by this reader — the return value says which).
  await dp.signIn("tanvir@golpoghor.demo", "golpoghor-demo-2026");
  const mine = (await dp.getSession()).user.id;
  const target = (await dp.listStories({ limit: 50 })).stories.find((s) => s.author_id !== mine);
  const counted = await dp.recordStoryView(target.id);
  await dp.signOut();
  await dp.signIn("moderator@golpoghor.demo", "golpoghor-demo-2026");
  const m1 = await dp.getAdminMetrics();
  check("metrics: a counted view moves views7d by one", m1.views7d === m0.views7d + (counted ? 1 : 0));
  check("metrics: a counted view moves views30d by one", m1.views30d === m0.views30d + (counted ? 1 : 0));
  await dp.signOut();

  // A new signup, a newly published story, and a newly published chapter
  // each move exactly their own counter.
  await dp.signUp({ email: "metrics@example.com", password: "secret12", username: "metrics_user", displayName: "Metrics User" });
  const st = await dp.createStory({ title: "Metrics Tale", summary: "x", language: "en", genre: "general", tags: [] });
  const ch = await dp.createChapter(st.id, { title: "One", body: paragraphsToDoc(["A line."]) });
  await dp.updateChapter(ch.id, { status: "published" });
  await dp.updateStory(st.id, { status: "ongoing" });
  await dp.signOut();
  await dp.signIn("moderator@golpoghor.demo", "golpoghor-demo-2026");
  const m2 = await dp.getAdminMetrics();
  check("metrics: a new signup moves signups by one", m2.signups === m0.signups + 1);
  check("metrics: a newly published story moves storiesPublished by one", m2.storiesPublished === m0.storiesPublished + 1);
  check("metrics: a newly published chapter moves chaptersPublished by one", m2.chaptersPublished === m0.chaptersPublished + 1);
  await dp.signOut();

  // Non-moderators cannot read metrics at all.
  await dp.signIn("tanvir@golpoghor.demo", "golpoghor-demo-2026");
  check("metrics: non-moderator refused", (await code(() => dp.getAdminMetrics())) === "notModerator");
  await dp.signOut();
}

// 32. comment editing (V4-15): owner-only, visible-only, edited marker.
{
  const code = async (fn) => {
    try { await fn(); return null; } catch (e) { return e?.code ?? "threw"; }
  };
  await dp.signIn("tanvir@golpoghor.demo", "golpoghor-demo-2026");
  const story = (await dp.listStories({ q: "বর্ষার চিঠি" })).stories[0];
  const chapter = (await dp.listChapters(story.id, { publishedOnly: true }))[0];
  const c = await dp.createComment(chapter.id, "first draft of this thought");
  check("comment edit: fresh comment has no edited marker", !c.edited_at);
  const edited = await dp.updateComment(c.id, "revised thought");
  check("comment edit: owner edit changes the body", edited.body === "revised thought");
  check("comment edit: owner edit sets edited_at", !!edited.edited_at);
  const listed = (await dp.listComments(chapter.id)).find((x) => x.id === c.id);
  check("comment edit: listed comment carries the marker", !!listed?.edited_at);
  await dp.signOut();

  await dp.signIn("nusrat@golpoghor.demo", "golpoghor-demo-2026");
  check("comment edit: another user refused",
    (await code(() => dp.updateComment(c.id, "hijacked"))) === "notAuthor");
  await dp.signOut();

  await dp.signIn("tanvir@golpoghor.demo", "golpoghor-demo-2026");
  check("comment edit: empty edit refused",
    (await code(() => dp.updateComment(c.id, "   "))) === "generic");
  await dp.signOut();

  await dp.signIn("moderator@golpoghor.demo", "golpoghor-demo-2026");
  await dp.moderateComment(c.id, "hidden");
  await dp.signOut();
  await dp.signIn("tanvir@golpoghor.demo", "golpoghor-demo-2026");
  check("comment edit: hidden comment cannot be edited",
    (await code(() => dp.updateComment(c.id, "back from hiding"))) === "generic");
  const stillHidden = (await dp.listComments(chapter.id)).some((x) => x.id === c.id);
  check("comment edit: hidden comment stays hidden after refused edit", !stillHidden);
  await dp.signOut();
}

// 33. chapter reordering (V4-20): up/down swaps neighbours, ends are
// no-ops, and only the story author may move chapters.
{
  const code = async (fn) => {
    try { await fn(); return null; } catch (e) { return e?.code ?? "threw"; }
  };
  await dp.signUp({ email: "reorder@example.com", password: "secret12", username: "reorder_user", displayName: "Reorder User" });
  const st = await dp.createStory({ title: "Reorder Tale", summary: "x", language: "en", genre: "general", tags: [] });
  const one = await dp.createChapter(st.id, { title: "One", body: paragraphsToDoc(["First."]) });
  const two = await dp.createChapter(st.id, { title: "Two", body: paragraphsToDoc(["Second."]) });
  const three = await dp.createChapter(st.id, { title: "Three", body: paragraphsToDoc(["Third."]) });
  const order = async () => (await dp.listChapters(st.id, { publishedOnly: false })).map((c) => c.title);
  check("reorder: initial order is creation order", (await order()).join(",") === "One,Two,Three");
  await dp.moveChapter(two.id, "up");
  check("reorder: middle chapter moves up", (await order()).join(",") === "Two,One,Three");
  await dp.moveChapter(two.id, "up");
  check("reorder: moving the first chapter up is a no-op", (await order()).join(",") === "Two,One,Three");
  await dp.moveChapter(three.id, "down");
  check("reorder: moving the last chapter down is a no-op", (await order()).join(",") === "Two,One,Three");
  await dp.moveChapter(one.id, "down");
  check("reorder: middle chapter moves down", (await order()).join(",") === "Two,Three,One");
  await dp.signOut();
  await dp.signIn("tanvir@golpoghor.demo", "golpoghor-demo-2026");
  check("reorder: non-author refused",
    (await code(() => dp.moveChapter(two.id, "up"))) === "notAuthor");
  await dp.signOut();
}

// Phase 1A: cover thumbnails (demo parity of the guard state machine)
{
  const { thumbPath } = utils;
  check("thumb: derives thumb- name", thumbPath("uid123/1699999-abc.jpeg") === "uid123/thumb-1699999-abc.jpeg");
  check("thumb: data: URL has no thumb", thumbPath("data:image/png;base64,AAA") === null);
  check("thumb: path without folder has no thumb", thumbPath("cover.jpeg") === null);
  check("thumb: existing thumb is not re-derived", thumbPath("uid123/thumb-1699999-abc.jpeg") === null);
  const tiny = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
  const other = { id: "x", author_id: "someone-else", cover_path: tiny };
  check("thumb: signed-out backfill refused", (await dp.ensureCoverThumbnail(other)) === "refused");
  await dp.signUp({ email: "thumb@example.com", password: "secret12", username: "thumb_user", displayName: "Thumb User" });
  const me = (await dp.getSession())?.user.id;
  check("thumb: non-author backfill refused", (await dp.ensureCoverThumbnail(other)) === "refused");
  check("thumb: missing thumbnail reads null", (await dp.coverThumbUrl(tiny)) === null);
  const mine = { id: "y", author_id: me, cover_path: tiny };
  check("thumb: owner backfill creates", (await dp.ensureCoverThumbnail(mine)) === "created");
  check("thumb: created thumbnail readable", (await dp.coverThumbUrl(tiny)) === tiny);
  check("thumb: second backfill is already, not a retry", (await dp.ensureCoverThumbnail(mine)) === "already");
  const demoCover = { id: "z", author_id: me, cover_path: "demo:Some Title:en" };
  check("thumb: generated placeholder has no derivation, refused", (await dp.ensureCoverThumbnail(demoCover)) === "refused");
  const storageLike = { id: "w", author_id: me, cover_path: "someuid/cover.jpeg" };
  check("thumb: non-data storage path fails in demo", (await dp.ensureCoverThumbnail(storageLike)) === "failed");
  check("thumb: failed backfill stays failed, no loop", (await dp.ensureCoverThumbnail(storageLike)) === "failed");
  const real = await dp.createStory({ title: "Thumb Tale", summary: "x", language: "en", genre: "general", tags: [] });
  const tiny2 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
  const withCover = await dp.updateStory(real.id, { cover_path: tiny2 });
  check("thumb: real story backfill creates", (await dp.ensureCoverThumbnail(withCover)) === "created");
  await dp.deleteAccount();
  check("thumb: account deletion clears thumbnails", (await dp.coverThumbUrl(tiny2)) === null);
}

// Phase 1B: persisted signed-URL cache (pure helpers + demo parity)
{
  const { signedUrlCacheKey, isFresh, readCachedUrl, writeCachedUrl, dropCachedUrl, clearCachedUrls, countCachedUrls, SIGNED_URL_TTL_MS, SIGNED_URL_REFRESH_MARGIN_MS } = cache;
  const now = Date.now();
  check("urlcache: key distinguishes bucket",
    signedUrlCacheKey("covers", "anon", "u/f") !== signedUrlCacheKey("avatars", "anon", "u/f"));
  check("urlcache: key distinguishes auth context",
    signedUrlCacheKey("covers", "anon", "u/f") !== signedUrlCacheKey("covers", "uid1", "u/f"));
  check("urlcache: key distinguishes thumb from original",
    signedUrlCacheKey("covers", "anon", "u/f") !== signedUrlCacheKey("covers", "anon", "u/thumb-f"));
  check("urlcache: key carries version prefix",
    signedUrlCacheKey("covers", "anon", "u/f").startsWith("gh:coverurl:v1:"));
  check("urlcache: fresh at mint", isFresh(now, now) === true);
  check("urlcache: fresh just inside margin",
    isFresh(now - (SIGNED_URL_TTL_MS - SIGNED_URL_REFRESH_MARGIN_MS - 1000), now) === true);
  check("urlcache: stale past margin",
    isFresh(now - (SIGNED_URL_TTL_MS - SIGNED_URL_REFRESH_MARGIN_MS + 1000), now) === false);
  check("urlcache: rejects garbage savedAt",
    isFresh(NaN, now) === false && isFresh(0, now) === false && isFresh(-5, now) === false);
  check("urlcache: future savedAt rejected (Argon finding 3)",
    isFresh(now + 1000, now) === false);
  clearCachedUrls();
  writeCachedUrl("covers", "anon", "u1/cover.jpg", "https://example.com/signed?token=abc");
  check("urlcache: write then read round-trips",
    readCachedUrl("covers", "anon", "u1/cover.jpg") === "https://example.com/signed?token=abc");
  check("urlcache: other auth cannot read it",
    readCachedUrl("covers", "uid1", "u1/cover.jpg") === null);
  dropCachedUrl("covers", "anon", "u1/cover.jpg");
  check("urlcache: drop removes entry",
    readCachedUrl("covers", "anon", "u1/cover.jpg") === null);
  const staleKey = signedUrlCacheKey("covers", "anon", "u1/old.jpg");
  globalThis.localStorage.setItem(staleKey, JSON.stringify({ u: "https://example.com/old", t: now - SIGNED_URL_TTL_MS }));
  check("urlcache: stale entry reads null", readCachedUrl("covers", "anon", "u1/old.jpg") === null);
  const badKey = signedUrlCacheKey("covers", "anon", "u1/bad.jpg");
  globalThis.localStorage.setItem(badKey, "not-json");
  check("urlcache: corrupt entry reads null", readCachedUrl("covers", "anon", "u1/bad.jpg") === null);
  globalThis.localStorage.setItem(badKey, JSON.stringify({ u: "data:text/plain,hi", t: now }));
  check("urlcache: non-http URL rejected", readCachedUrl("covers", "anon", "u1/bad.jpg") === null);
  clearCachedUrls();
  writeCachedUrl("captest", "anon", "c/1.jpg", "https://example.com/1", 3);
  writeCachedUrl("captest", "anon", "c/2.jpg", "https://example.com/2", 3);
  writeCachedUrl("captest", "anon", "c/3.jpg", "https://example.com/3", 3);
  writeCachedUrl("captest", "anon", "c/4.jpg", "https://example.com/4", 3);
  check("urlcache: cap enforced", countCachedUrls() === 3);
  check("urlcache: cap evicts oldest, keeps newest",
    readCachedUrl("captest", "anon", "c/1.jpg") === null &&
    readCachedUrl("captest", "anon", "c/4.jpg") === "https://example.com/4");
  check("urlcache: demo invalidate resolves",
    (await dp.invalidateCoverUrl("u1/cover.jpg")) === undefined);
  clearCachedUrls();
  check("urlcache: clear empties cache", countCachedUrls() === 0);
}

console.log("");
for (const [st, name] of results) console.log(`${st}  ${name}`);
const fails = results.filter((r) => r[0] === "FAIL").length;
console.log(`\n${results.length - fails}/${results.length} passed`);
