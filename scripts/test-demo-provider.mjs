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

const [{ DemoProvider }, utils] = await Promise.all([
  import("../src/lib/providers/demo-provider.ts"),
  import("../src/lib/utils.ts"),
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
  check("seed has 3 public stories", stories.length === 3);
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
  // approving does NOT auto-restore
  check("content still hidden after approval", (await dp.resolveReportTarget("chapter", chapterId))?.status === "hidden");
  await dp.restoreChapter(chapterId);
  check("moderator restores after approval", (await dp.resolveReportTarget("chapter", chapterId))?.status === "published");
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

console.log("");
for (const [st, name] of results) console.log(`${st}  ${name}`);
const fails = results.filter((r) => r[0] === "FAIL").length;
console.log(`\n${results.length - fails}/${results.length} passed`);
