/**
 * Demo DataProvider backed by localStorage.
 *
 * Lets the whole app run (and be verified) with zero credentials.
 * Security model mirrors the Supabase RLS policies in code: ownership
 * checks, role checks, draft invisibility.
 *
 * DEMO ONLY — passwords use a non-cryptographic hash and everything lives
 * in the browser. Never use this provider with real user data.
 */
import type {
  Appeal,
  AppealStatus,
  AppealTarget,
  AppNotification,
  Chapter,
  Comment,
  ModerationEvent,
  NotificationPrefs,
  NotificationType,
  Profile,
  ReadingProgress,
  Report,
  ReportStatus,
  ReportTarget,
  Session,
  Story,
} from "../types";
import type {
  ChapterInput,
  DataProvider,
  StoryFilters,
  StoryInput,
} from "../data-provider";
import { resolveNotificationPrefs } from "../data-provider";
import { SEED_AUTHORS, SEED_STORIES, DEMO_PASSWORD } from "../demo-content";
import {
  AppError,
  countWords,
  docToText,
  paragraphsToDoc,
  slugify,
} from "../utils";

const LS_KEY = "golpoghor-demo-v1";

interface DemoUser {
  id: string;
  email: string;
  passwordHash: string;
}
interface DemoDB {
  users: DemoUser[];
  profiles: Profile[];
  stories: Story[];
  chapters: Chapter[];
  follows: { follower_id: string; author_id: string; created_at: string }[];
  readingList: { user_id: string; story_id: string; created_at: string }[];
  progress: ReadingProgress[];
  likes: { user_id: string; story_id: string; created_at: string }[];
  comments: Comment[];
  reports: Report[];
  events: ModerationEvent[];
  appeals: Appeal[];
  notifications: AppNotification[];
  storyViews: { story_id: string; viewer_id: string; viewed_on: string; created_at: string }[];
  sessionUserId: string | null;
}

/** Non-cryptographic demo hash. Do not use for real passwords. */
function hashPassword(pw: string, salt: string): string {
  let h1 = 0x811c9dc5 ^ salt.length;
  const s = salt + ":" + pw;
  for (let i = 0; i < s.length; i++) {
    h1 ^= s.charCodeAt(i);
    h1 = Math.imul(h1, 0x01000193);
  }
  return `demo$${(h1 >>> 0).toString(16)}`;
}

const uuid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `00000000-0000-4000-8000-${Math.random().toString(16).slice(2).padEnd(12, "0")}`;

const daysAgo = (d: number) => new Date(Date.now() - d * 86400000).toISOString();

function seed(): DemoDB {
  const users: DemoUser[] = SEED_AUTHORS.map((a) => ({
    id: a.id,
    email: a.email,
    passwordHash: hashPassword(DEMO_PASSWORD, a.id),
  }));
  const profiles: Profile[] = SEED_AUTHORS.map((a) => ({
    id: a.id,
    username: a.username,
    display_name: a.display_name,
    bio: a.bio,
    avatar_path: null,
    locale: a.locale,
    role: a.role,
    notification_prefs: {},
    created_at: daysAgo(30),
    updated_at: daysAgo(30),
  }));
  const stories: Story[] = [];
  const chapters: Chapter[] = [];
  let day = 12;
  for (const s of SEED_STORIES) {
    const author = profiles.find((p) => p.username === s.author_username)!;
    const storyId = uuid();
    const published = s.status !== "draft";
    stories.push({
      id: storyId,
      author_id: author.id,
      title: s.title,
      slug: s.slug,
      summary: s.summary,
      language: s.language,
      genre: s.genre,
      tags: s.tags,
      status: s.status,
      content_notice: s.content_notice,
      cover_path: `demo:${encodeURIComponent(s.title)}:${s.language}`,
      view_count: 40 + Math.floor(Math.random() * 400),
      created_at: daysAgo(day + 6),
      updated_at: daysAgo(Math.max(day - 2, 1)),
      published_at: published ? daysAgo(day) : null,
    });
    s.chapters.forEach((c, i) => {
      const bodyText = c.paragraphs.join("\n\n");
      chapters.push({
        id: uuid(),
        story_id: storyId,
        title: c.title,
        slug: c.slug,
        body_json: paragraphsToDoc(c.paragraphs),
        body_text: bodyText,
        position: i,
        status: c.status,
        word_count: countWords(bodyText),
        published_at: c.status === "published" ? daysAgo(Math.max(day - i, 1)) : null,
        created_at: daysAgo(day + 5 - i),
        updated_at: daysAgo(Math.max(day - i, 1)),
      });
    });
    day -= 2;
  }
  return {
    users,
    profiles,
    stories,
    chapters,
    follows: [],
    readingList: [],
    progress: [],
    likes: [],
    comments: [],
    reports: [],
    events: [],
    appeals: [],
    notifications: [],
    storyViews: [],
    sessionUserId: null,
  };
}

/** Elegant generated cover (SVG data URI) for demo stories. */
export function demoCover(title: string, language: "bn" | "en"): string {
  const short = title.length > 26 ? title.slice(0, 26) + "…" : title;
  const bg = language === "bn" ? "#285C4B" : "#26332F";
  const accent = "#C28A42";
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='600' height='800' viewBox='0 0 600 800'>` +
    `<rect width='600' height='800' fill='${bg}'/>` +
    `<rect x='40' y='40' width='520' height='720' fill='none' stroke='${accent}' stroke-width='3'/>` +
    `<rect x='56' y='56' width='488' height='688' fill='none' stroke='${accent}' stroke-width='1' opacity='0.6'/>` +
    `<text x='300' y='380' text-anchor='middle' font-family='Georgia, "Noto Serif Bengali", serif' font-size='44' fill='#F7F3E9'>` +
    `${short.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</text>` +
    `<line x1='220' y1='440' x2='380' y2='440' stroke='${accent}' stroke-width='2'/>` +
    `<text x='300' y='490' text-anchor='middle' font-family='Georgia, serif' font-size='24' letter-spacing='6' fill='${accent}'>গল্পঘর</text>` +
    `</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export class DemoProvider implements DataProvider {
  readonly kind = "demo" as const;
  private db: DemoDB;
  private listeners = new Set<(s: Session | null) => void>();

  constructor() {
    this.db = this.load();
  }

  private load(): DemoDB {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        const db = JSON.parse(raw) as DemoDB;
        if (db && Array.isArray(db.stories)) {
          // forward-fill fields added after the first seed
          db.appeals ??= [];
          db.notifications ??= [];
          db.storyViews ??= [];
          for (const p of db.profiles) p.notification_prefs ??= {};
          return db;
        }
      }
    } catch {
      /* corrupted — reseed */
    }
    const db = seed();
    this.persist(db);
    return db;
  }

  private persist(db: DemoDB = this.db): void {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(db));
    } catch {
      /* storage full — app keeps working in memory */
    }
  }

  /** Reset demo data (used by tests / settings). */
  resetDemo(): void {
    localStorage.removeItem(LS_KEY);
    this.db = seed();
    this.emit();
  }

  private emit(): void {
    const s = this.sessionSync();
    for (const cb of this.listeners) cb(s);
  }

  private sessionSync(): Session | null {
    const id = this.db.sessionUserId;
    if (!id) return null;
    const u = this.db.users.find((x) => x.id === id);
    return u ? { user: { id: u.id, email: u.email } } : null;
  }

  // ------------------------------------------------------------- auth
  async getSession(): Promise<Session | null> {
    return this.sessionSync();
  }

  onAuthChange(cb: (s: Session | null) => void): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  async signUp(input: { email: string; password: string; username: string; displayName: string }) {
    const username = input.username.trim().toLowerCase();
    if (!/^[a-z0-9_]{3,30}$/.test(username)) throw new AppError("invalidUsername", "Invalid username");
    if (input.password.length < 6) throw new AppError("weakPassword", "Password too short");
    const email = input.email.trim().toLowerCase();
    if (this.db.users.some((u) => u.email === email)) throw new AppError("emailTaken", "Email taken");
    if (this.db.profiles.some((p) => p.username === username)) throw new AppError("usernameTaken", "Username taken");
    const id = uuid();
    this.db.users.push({ id, email, passwordHash: hashPassword(input.password, id) });
    this.db.profiles.push({
      id,
      username,
      display_name: input.displayName.trim() || username,
      bio: "",
      avatar_path: null,
      locale: "bn",
      role: "reader",
      notification_prefs: {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    this.db.sessionUserId = id;
    this.persist();
    this.emit();
    return { needsEmailConfirmation: false };
  }

  async signIn(email: string, password: string): Promise<void> {
    const em = email.trim().toLowerCase();
    const u = this.db.users.find((x) => x.email === em);
    if (!u || u.passwordHash !== hashPassword(password, u.id))
      throw new AppError("signInFailed", "Invalid email or password");
    this.db.sessionUserId = u.id;
    this.persist();
    this.emit();
  }

  async signOut(): Promise<void> {
    this.db.sessionUserId = null;
    this.persist();
    this.emit();
  }

  async ensureOwnProfile(): Promise<void> {
    // Demo mode creates the profile at signup; nothing to heal.
  }

  async resetPassword(email: string): Promise<void> {
    // Demo: pretend the email was sent. The demo account password is documented.
    const em = email.trim().toLowerCase();
    if (!this.db.users.some((x) => x.email === em)) throw new AppError("generic", "No account with that email");
  }

  async updatePassword(newPassword: string): Promise<void> {
    if (newPassword.length < 6) throw new AppError("weakPassword", "Password too short");
    const s = this.sessionSync();
    if (!s) throw new AppError("signInRequired", "Sign in required");
    const u = this.db.users.find((x) => x.id === s.user.id)!;
    u.passwordHash = hashPassword(newPassword, u.id);
    this.persist();
  }

  // ---------------------------------------------------------- profiles
  async getProfile(id: string): Promise<Profile | null> {
    return this.db.profiles.find((p) => p.id === id) ?? null;
  }

  async getProfileByUsername(username: string): Promise<Profile | null> {
    return this.db.profiles.find((p) => p.username === username.toLowerCase()) ?? null;
  }

  async updateProfile(
    id: string,
    patch: Partial<Pick<Profile, "display_name" | "bio" | "locale" | "notification_prefs">>
  ): Promise<Profile> {
    const me = await this.requireUid();
    if (me !== id) throw new AppError("notAuthor", "You can only edit your own profile");
    const p = this.db.profiles.find((x) => x.id === id);
    if (!p) throw new AppError("notFound", "Profile not found");
    if (patch.display_name !== undefined) p.display_name = patch.display_name.trim().slice(0, 80);
    if (patch.bio !== undefined) p.bio = patch.bio.trim().slice(0, 500);
    if (patch.locale !== undefined) p.locale = patch.locale;
    if (patch.notification_prefs !== undefined) {
      const cur = resolveNotificationPrefs(p.notification_prefs);
      p.notification_prefs = { ...cur, ...patch.notification_prefs };
    }
    p.updated_at = new Date().toISOString();
    this.persist();
    return { ...p };
  }

  // ----------------------------------------------------------- stories
  private withAuthor(s: Story): Story {
    const author = this.db.profiles.find((p) => p.id === s.author_id);
    return { ...s, author };
  }

  /** A story is public only when published AND having a published chapter. */
  private isPublicStory(s: Story): boolean {
    return (
      (s.status === "ongoing" || s.status === "complete") &&
      this.db.chapters.some((c) => c.story_id === s.id && c.status === "published")
    );
  }

  private publishedChapterCount(storyId: string): number {
    return this.db.chapters.filter((c) => c.story_id === storyId && c.status === "published").length;
  }

  /** Publishing gate: a story needs at least one published chapter. */
  private requirePublishable(storyId: string): void {
    if (this.publishedChapterCount(storyId) === 0)
      throw new AppError("noPublishedChapters", "Publish at least one chapter first");
  }

  private attachCounts(stories: Story[]): void {
    for (const s of stories) {
      s.chapter_count = this.db.chapters.filter((c) => c.story_id === s.id && c.status === "published").length;
      s.like_count = this.db.likes.filter((l) => l.story_id === s.id).length;
    }
  }

  async listStories(f: StoryFilters): Promise<{ stories: Story[]; total: number }> {
    const me = this.sessionSync()?.user.id ?? null;
    let rows = this.db.stories.slice();
    if (f.includeDrafts) {
      if (!me) rows = [];
      else rows = rows.filter((s) => s.author_id === me);
    } else {
      rows = rows.filter((s) => this.isPublicStory(s));
    }
    if (f.authorId) rows = rows.filter((s) => s.author_id === f.authorId);
    if (f.language) rows = rows.filter((s) => s.language === f.language);
    if (f.genre) rows = rows.filter((s) => s.genre === f.genre);
    {
      const tag = f.tag;
      if (tag) rows = rows.filter((s) => s.tags.includes(tag));
    }
    if (f.q) {
      const term = f.q.trim().toLowerCase();
      if (term) {
        rows = rows.filter((s) => {
          const author = this.db.profiles.find((p) => p.id === s.author_id);
          return (
            s.title.toLowerCase().includes(term) ||
            s.summary.toLowerCase().includes(term) ||
            s.tags.some((t) => t.toLowerCase().includes(term)) ||
            (author &&
              (author.username.includes(term) || author.display_name.toLowerCase().includes(term)))
          );
        });
      }
    }
    rows.sort((a, b) => {
      if (f.sort === "popular") return b.view_count - a.view_count;
      if (f.sort === "most_viewed")
        return b.view_count - a.view_count || (b.published_at ?? b.created_at).localeCompare(a.published_at ?? a.created_at);
      return (b.published_at ?? b.created_at).localeCompare(a.published_at ?? a.created_at);
    });
    const total = rows.length;
    const limit = f.limit ?? 24;
    const offset = f.offset ?? 0;
    const page = rows.slice(offset, offset + limit).map((s) => this.withAuthor(s));
    this.attachCounts(page);
    return { stories: page, total };
  }

  async getStory(id: string): Promise<Story | null> {
    const s = this.db.stories.find((x) => x.id === id);
    if (!s) return null;
    const out = this.withAuthor(s);
    this.attachCounts([out]);
    return out;
  }

  async getStoryBySlug(authorUsername: string, slug: string): Promise<Story | null> {
    const profile = await this.getProfileByUsername(authorUsername);
    if (!profile) return null;
    const s = this.db.stories.find((x) => x.author_id === profile.id && x.slug === slug);
    if (!s) return null;
    const me = this.sessionSync()?.user.id ?? null;
    const isOwner = me === s.author_id;
    if (!isOwner && !this.isPublicStory(s)) return null;
    const out = this.withAuthor(s);
    this.attachCounts([out]);
    return out;
  }

  private async requireUid(): Promise<string> {
    const s = this.sessionSync();
    if (!s) throw new AppError("signInRequired", "Sign in required");
    return s.user.id;
  }

  private requireOwner(story: Story, me: string): void {
    if (story.author_id !== me) throw new AppError("notAuthor", "Only the author can do that");
  }

  async createStory(input: StoryInput): Promise<Story> {
    const me = await this.requireUid();
    if (!input.title.trim()) throw new AppError("emptyTitle", "Title required");
    const slug = slugify(input.slug || input.title);
    if (this.db.stories.some((s) => s.author_id === me && s.slug === slug))
      throw new AppError("conflict", "You already have a story with this slug");
    const now = new Date().toISOString();
    const story: Story = {
      id: uuid(),
      author_id: me,
      title: input.title.trim().slice(0, 200),
      slug,
      summary: input.summary.trim().slice(0, 2000),
      language: input.language,
      genre: input.genre.trim().slice(0, 60) || "general",
      tags: input.tags.map((t) => t.trim()).filter(Boolean).slice(0, 10),
      status: "draft",
      content_notice: (input.content_notice ?? "").trim().slice(0, 500),
      cover_path: null,
      view_count: 0,
      created_at: now,
      updated_at: now,
      published_at: null,
    };
    this.db.stories.push(story);
    this.persist();
    return this.withAuthor(story);
  }

  async updateStory(id: string, patch: Partial<StoryInput & { status: Story["status"]; cover_path: string | null }>): Promise<Story> {
    const me = await this.requireUid();
    const s = this.db.stories.find((x) => x.id === id);
    if (!s) throw new AppError("notFound", "Story not found");
    const actor = this.db.profiles.find((p) => p.id === me);
    const isMod = actor?.role === "moderator" || actor?.role === "admin";
    if (!isMod) this.requireOwner(s, me);
    else if (patch.status === undefined) this.requireOwner(s, me); // mods may only flip status
    if (patch.title !== undefined) {
      if (!patch.title.trim()) throw new AppError("emptyTitle", "Title required");
      s.title = patch.title.trim().slice(0, 200);
    }
    if (patch.slug !== undefined) s.slug = slugify(patch.slug || s.title);
    if (patch.summary !== undefined) s.summary = patch.summary.trim().slice(0, 2000);
    if (patch.language !== undefined) s.language = patch.language;
    if (patch.genre !== undefined) s.genre = patch.genre.trim().slice(0, 60) || "general";
    if (patch.tags !== undefined) s.tags = patch.tags.map((t) => t.trim()).filter(Boolean).slice(0, 10);
    if (patch.content_notice !== undefined) s.content_notice = patch.content_notice.trim().slice(0, 500);
    if (patch.cover_path !== undefined) s.cover_path = patch.cover_path;
    if (patch.status !== undefined) {
      const allowed: Story["status"][] = ["draft", "ongoing", "complete", "hidden"];
      if (!allowed.includes(patch.status)) throw new AppError("generic", "Invalid status");
      // state machine: draft -> ongoing/complete; ongoing <-> complete; any -> hidden (mods); hidden -> ongoing/complete
      // Publishing (entering ongoing/complete from anything else) needs a published chapter.
      const enteringPublic =
        (patch.status === "ongoing" || patch.status === "complete") &&
        s.status !== "ongoing" && s.status !== "complete";
      if (enteringPublic) this.requirePublishable(id);
      s.status = patch.status;
      if ((patch.status === "ongoing" || patch.status === "complete") && !s.published_at)
        s.published_at = new Date().toISOString();
    }
    s.updated_at = new Date().toISOString();
    this.persist();
    return this.withAuthor({ ...s });
  }

  async deleteStory(id: string): Promise<void> {
    const me = await this.requireUid();
    const i = this.db.stories.findIndex((x) => x.id === id);
    if (i < 0) throw new AppError("notFound", "Story not found");
    this.requireOwner(this.db.stories[i], me);
    this.db.stories.splice(i, 1);
    this.db.chapters = this.db.chapters.filter((c) => c.story_id !== id);
    this.db.readingList = this.db.readingList.filter((r) => r.story_id !== id);
    this.db.likes = this.db.likes.filter((l) => l.story_id !== id);
    this.db.progress = this.db.progress.filter((p) => p.story_id !== id);
    this.persist();
  }

  async listGenres(): Promise<string[]> {
    const set = new Set<string>();
    for (const s of this.db.stories) {
      if (this.isPublicStory(s)) set.add(s.genre);
    }
    return [...set].sort();
  }

  // ---------------------------------------------------------- chapters
  private storyOfChapter(chapterId: string): Story {
    const c = this.db.chapters.find((x) => x.id === chapterId);
    if (!c) throw new AppError("notFound", "Chapter not found");
    const s = this.db.stories.find((x) => x.id === c.story_id);
    if (!s) throw new AppError("notFound", "Story not found");
    return s;
  }

  async listChapters(storyId: string, opts?: { publishedOnly?: boolean }): Promise<Chapter[]> {
    const publishedOnly = opts?.publishedOnly !== false;
    const me = this.sessionSync()?.user.id ?? null;
    const story = this.db.stories.find((s) => s.id === storyId);
    if (!story) return [];
    if (!publishedOnly && story.author_id !== me) throw new AppError("notAuthor", "Only the author can view drafts");
    return this.db.chapters
      .filter((c) => c.story_id === storyId && (!publishedOnly || c.status === "published"))
      .sort((a, b) => a.position - b.position)
      .map((c) => ({ ...c }));
  }

  async getChapterBySlug(storyId: string, slug: string, opts?: { publishedOnly?: boolean }): Promise<Chapter | null> {
    const publishedOnly = opts?.publishedOnly !== false;
    const c = this.db.chapters.find((x) => x.story_id === storyId && x.slug === slug);
    if (!c) return null;
    if (publishedOnly && c.status !== "published") {
      const me = this.sessionSync()?.user.id ?? null;
      const story = this.db.stories.find((s) => s.id === storyId);
      if (!story || story.author_id !== me) return null;
    }
    return { ...c, story: this.withAuthor(this.db.stories.find((s) => s.id === storyId)!) };
  }

  async getChapter(id: string): Promise<Chapter | null> {
    const c = this.db.chapters.find((x) => x.id === id);
    if (!c) return null;
    const story = this.db.stories.find((s) => s.id === c.story_id)!;
    return { ...c, story: this.withAuthor(story) };
  }

  async createChapter(storyId: string, input: ChapterInput): Promise<Chapter> {
    const me = await this.requireUid();
    const story = this.db.stories.find((s) => s.id === storyId);
    if (!story) throw new AppError("notFound", "Story not found");
    this.requireOwner(story, me);
    if (!input.title.trim()) throw new AppError("emptyTitle", "Chapter title required");
    const slug = slugify(input.slug || input.title);
    if (this.db.chapters.some((c) => c.story_id === storyId && c.slug === slug))
      throw new AppError("conflict", "Chapter slug already used in this story");
    const text = docToText(input.body);
    const now = new Date().toISOString();
    const position = this.db.chapters.filter((c) => c.story_id === storyId).length;
    const ch: Chapter = {
      id: uuid(),
      story_id: storyId,
      title: input.title.trim().slice(0, 200),
      slug,
      body_json: input.body,
      body_text: text,
      position,
      status: "draft",
      word_count: countWords(text),
      published_at: null,
      created_at: now,
      updated_at: now,
    };
    this.db.chapters.push(ch);
    story.updated_at = now;
    this.persist();
    return { ...ch };
  }

  async updateChapter(id: string, patch: Partial<ChapterInput & { status: Chapter["status"] }>): Promise<Chapter> {
    const me = await this.requireUid();
    const c = this.db.chapters.find((x) => x.id === id);
    if (!c) throw new AppError("notFound", "Chapter not found");
    const story = this.storyOfChapter(id);
    const prevStatus = c.status;
    const actor = this.db.profiles.find((p) => p.id === me);
    const isMod = actor?.role === "moderator" || actor?.role === "admin";
    if (!isMod) this.requireOwner(story, me);
    else if (patch.status === undefined) this.requireOwner(story, me);
    if (patch.title !== undefined) {
      if (!patch.title.trim()) throw new AppError("emptyTitle", "Chapter title required");
      c.title = patch.title.trim().slice(0, 200);
    }
    if (patch.slug !== undefined) c.slug = slugify(patch.slug || c.title);
    if (patch.body !== undefined) {
      c.body_json = patch.body;
      c.body_text = docToText(patch.body);
      c.word_count = countWords(c.body_text);
    }
    if (patch.status !== undefined) {
      const allowed: Chapter["status"][] = ["draft", "published", "unpublished", "hidden"];
      if (!allowed.includes(patch.status)) throw new AppError("generic", "Invalid status");
      if (patch.status === "published") {
        if (!c.title.trim() || !c.body_text.trim()) throw new AppError("emptyChapter", "Write something before publishing");
        c.published_at = c.published_at ?? new Date().toISOString();
      }
      c.status = patch.status;
    }
    const becamePublished = patch.status === "published" && prevStatus !== "published";
    c.updated_at = new Date().toISOString();
    story.updated_at = c.updated_at;
    if (becamePublished) this.notifyNewChapter(story.author_id, story, c);
    this.persist();
    return { ...c };
  }

  async deleteChapter(id: string): Promise<void> {
    const me = await this.requireUid();
    const i = this.db.chapters.findIndex((x) => x.id === id);
    if (i < 0) throw new AppError("notFound", "Chapter not found");
    this.requireOwner(this.storyOfChapter(id), me);
    const [removed] = this.db.chapters.splice(i, 1);
    // resequence positions
    this.db.chapters
      .filter((c) => c.story_id === removed.story_id)
      .sort((a, b) => a.position - b.position)
      .forEach((c, idx) => (c.position = idx));
    this.persist();
  }

  // ------------------------------------------------------------ social
  async isFollowing(authorId: string): Promise<boolean> {
    const me = this.sessionSync()?.user.id;
    if (!me) return false;
    return this.db.follows.some((f) => f.follower_id === me && f.author_id === authorId);
  }

  async toggleFollow(authorId: string): Promise<boolean> {
    const me = await this.requireUid();
    if (me === authorId) throw new AppError("generic", "You cannot follow yourself");
    const i = this.db.follows.findIndex((f) => f.follower_id === me && f.author_id === authorId);
    if (i >= 0) {
      this.db.follows.splice(i, 1);
      this.persist();
      return false;
    }
    this.db.follows.push({ follower_id: me, author_id: authorId, created_at: new Date().toISOString() });
    this.persist();
    return true;
  }

  async getFollowerCount(authorId: string): Promise<number> {
    return this.db.follows.filter((f) => f.author_id === authorId).length;
  }

  async getFollowing(userId: string): Promise<Profile[]> {
    const ids = this.db.follows.filter((f) => f.follower_id === userId).map((f) => f.author_id);
    return this.db.profiles.filter((p) => ids.includes(p.id)).map((p) => ({ ...p }));
  }

  async hasLiked(storyId: string): Promise<boolean> {
    const me = this.sessionSync()?.user.id;
    if (!me) return false;
    return this.db.likes.some((l) => l.user_id === me && l.story_id === storyId);
  }

  async toggleLike(storyId: string): Promise<boolean> {
    const me = await this.requireUid();
    const i = this.db.likes.findIndex((l) => l.user_id === me && l.story_id === storyId);
    if (i >= 0) {
      this.db.likes.splice(i, 1);
      this.persist();
      return false;
    }
    this.db.likes.push({ user_id: me, story_id: storyId, created_at: new Date().toISOString() });
    this.persist();
    return true;
  }

  async getLikeCount(storyId: string): Promise<number> {
    return this.db.likes.filter((l) => l.story_id === storyId).length;
  }

  async isInReadingList(storyId: string): Promise<boolean> {
    const me = this.sessionSync()?.user.id;
    if (!me) return false;
    return this.db.readingList.some((r) => r.user_id === me && r.story_id === storyId);
  }

  async toggleReadingList(storyId: string): Promise<boolean> {
    const me = await this.requireUid();
    const i = this.db.readingList.findIndex((r) => r.user_id === me && r.story_id === storyId);
    if (i >= 0) {
      this.db.readingList.splice(i, 1);
      this.persist();
      return false;
    }
    this.db.readingList.push({ user_id: me, story_id: storyId, created_at: new Date().toISOString() });
    this.persist();
    return true;
  }

  async getReadingList(): Promise<Story[]> {
    const me = await this.requireUid();
    const ids = this.db.readingList
      .filter((r) => r.user_id === me)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map((r) => r.story_id);
    const stories = ids
      .map((id) => this.db.stories.find((s) => s.id === id))
      .filter((s): s is Story => !!s && this.isPublicStory(s))
      .map((s) => this.withAuthor(s));
    this.attachCounts(stories);
    return stories;
  }

  async getProgress(storyId: string): Promise<ReadingProgress | null> {
    const me = this.sessionSync()?.user.id;
    if (!me) return null;
    return this.db.progress.find((p) => p.user_id === me && p.story_id === storyId) ?? null;
  }

  async saveProgress(storyId: string, chapterId: string | null, scrollRatio: number): Promise<void> {
    const me = this.sessionSync()?.user.id;
    if (!me) return;
    const now = new Date().toISOString();
    const existing = this.db.progress.find((p) => p.user_id === me && p.story_id === storyId);
    if (existing) {
      existing.chapter_id = chapterId;
      existing.scroll_ratio = Math.min(1, Math.max(0, scrollRatio));
      existing.updated_at = now;
    } else {
      this.db.progress.push({ user_id: me, story_id: storyId, chapter_id: chapterId, scroll_ratio: scrollRatio, updated_at: now });
    }
    this.persist();
  }

  async getInProgressStories(): Promise<{ story: Story; progress: ReadingProgress }[]> {    const me = await this.requireUid();
    return this.db.progress
      .filter((p) => p.user_id === me)
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
      .slice(0, 20)
      .map((p) => {
        const s = this.db.stories.find((x) => x.id === p.story_id);
        if (!s || !this.isPublicStory(s)) return null;
        const story = this.withAuthor(s);
        this.attachCounts([story]);
        return { story, progress: { ...p } };
      })
      .filter((x): x is { story: Story; progress: ReadingProgress } => !!x);
  }

  // ------------------------------------------------------- story views
  async recordStoryView(storyId: string): Promise<boolean> {
    const s = this.db.stories.find((x) => x.id === storyId);
    if (!s) return false;
    const me = this.sessionSync()?.user.id ?? null;
    if (!me) return false; // guests are not tracked (no IP storage)
    if (me === s.author_id) return false; // no self views
    if (!this.isPublicStory(s)) return false; // drafts/hidden/unpublished never count
    const today = new Date().toISOString().slice(0, 10); // UTC date
    if (
      this.db.storyViews.some(
        (v) => v.story_id === storyId && v.viewer_id === me && v.viewed_on === today
      )
    )
      return false; // already counted today
    this.db.storyViews.push({
      story_id: storyId,
      viewer_id: me,
      viewed_on: today,
      created_at: new Date().toISOString(),
    });
    s.view_count += 1;
    this.persist();
    return true;
  }

  // ---------------------------------------------------------- comments
  async listComments(chapterId: string): Promise<Comment[]> {
    return this.db.comments
      .filter((c) => c.chapter_id === chapterId && c.status === "visible")
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map((c) => ({ ...c, author: this.db.profiles.find((p) => p.id === c.author_id) }));
  }

  async createComment(chapterId: string, body: string): Promise<Comment> {
    const me = await this.requireUid();
    const text = body.trim();
    if (!text) throw new AppError("generic", "Comment is empty");
    if (text.length > 2000) throw new AppError("generic", "Comment too long");
    const ch = this.db.chapters.find((c) => c.id === chapterId);
    if (!ch || ch.status !== "published") throw new AppError("notFound", "Chapter not found");
    const now = new Date().toISOString();
    const comment: Comment = {
      id: uuid(),
      chapter_id: chapterId,
      author_id: me,
      body: text,
      status: "visible",
      created_at: now,
      updated_at: now,
    };
    this.db.comments.push(comment);
    this.persist();
    return { ...comment, author: this.db.profiles.find((p) => p.id === me) };
  }

  async deleteComment(id: string): Promise<void> {
    const me = await this.requireUid();
    const i = this.db.comments.findIndex((c) => c.id === id);
    if (i < 0) throw new AppError("notFound", "Comment not found");
    const c = this.db.comments[i];
    const actor = this.db.profiles.find((p) => p.id === me);
    const isMod = actor?.role === "moderator" || actor?.role === "admin";
    if (c.author_id !== me && !isMod) throw new AppError("notAuthor", "You can only delete your own comment");
    this.db.comments.splice(i, 1);
    this.persist();
  }

  // ----------------------------------------------------------- reports
  private requireModerator(me: string): Profile {
    const p = this.db.profiles.find((x) => x.id === me);
    if (!p || (p.role !== "moderator" && p.role !== "admin"))
      throw new AppError("notModerator", "Moderator only");
    return p;
  }

  // ----------------------------------------------------- notifications
  private prefsOf(userId: string): Required<NotificationPrefs> {
    const p = this.db.profiles.find((x) => x.id === userId);
    return resolveNotificationPrefs(p?.notification_prefs);
  }

  private pushNotification(
    userId: string,
    type: NotificationType,
    data: Record<string, string>,
    link: string | null
  ): void {
    if (!this.db.profiles.some((p) => p.id === userId)) return;
    this.db.notifications.push({
      id: uuid(),
      user_id: userId,
      type,
      data,
      link,
      is_read: false,
      created_at: new Date().toISOString(),
    });
  }

  private notifyModerators(type: NotificationType, data: Record<string, string>, link: string | null): void {
    for (const p of this.db.profiles) {
      if ((p.role === "moderator" || p.role === "admin") && this.prefsOf(p.id).moderator_alerts) {
        this.pushNotification(p.id, type, data, link);
      }
    }
  }

  private storyPathOf(s: Story): string {
    const a = this.db.profiles.find((p) => p.id === s.author_id);
    return `/stories/${a?.username ?? "?"}/${s.slug}`;
  }

  private chapterPathOf(s: Story, c: Chapter): string {
    return `${this.storyPathOf(s)}/${c.slug}`;
  }

  /** Notify followers of an author about a newly published chapter. */
  private notifyNewChapter(authorId: string, story: Story, chapter: Chapter): void {
    const author = this.db.profiles.find((p) => p.id === authorId);
    const link = this.chapterPathOf(story, chapter);
    for (const f of this.db.follows) {
      if (f.author_id !== authorId || f.follower_id === authorId) continue;
      if (!this.prefsOf(f.follower_id).new_chapter) continue;
      this.pushNotification(f.follower_id, "new_chapter", {
        authorName: author?.display_name ?? "",
        authorUsername: author?.username ?? "",
        storyId: story.id,
        storyTitle: story.title,
        storySlug: story.slug,
        chapterTitle: chapter.title,
        chapterSlug: chapter.slug,
      }, link);
    }
  }

  async createReport(targetType: ReportTarget, targetId: string, reason: string, details: string): Promise<Report> {
    const me = await this.requireUid();
    // verify target exists
    const exists =
      (targetType === "story" && this.db.stories.some((s) => s.id === targetId)) ||
      (targetType === "chapter" && this.db.chapters.some((c) => c.id === targetId)) ||
      (targetType === "comment" && this.db.comments.some((c) => c.id === targetId)) ||
      (targetType === "profile" && this.db.profiles.some((p) => p.id === targetId));
    if (!exists) throw new AppError("notFound", "Reported item not found");
    const now = new Date().toISOString();
    const r: Report = {
      id: uuid(),
      reporter_id: me,
      target_type: targetType,
      target_id: targetId,
      reason: reason.trim().slice(0, 120),
      details: details.trim().slice(0, 2000),
      status: "open",
      created_at: now,
      resolved_at: null,
      resolved_by: null,
    };
    this.db.reports.push(r);
    const target = await this.resolveReportTarget(targetType, targetId);
    this.notifyModerators("report_received", {
      targetType,
      reason: r.reason,
      targetLabel: target?.label ?? "",
    }, "/admin/reports");
    this.persist();
    return { ...r };
  }

  async listReports(status?: ReportStatus): Promise<Report[]> {
    const me = await this.requireUid();
    this.requireModerator(me);
    return this.db.reports
      .filter((r) => !status || r.status === status)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, 100)
      .map((r) => ({ ...r }));
  }

  async updateReport(id: string, status: ReportStatus): Promise<Report> {
    const me = await this.requireUid();
    this.requireModerator(me);
    const r = this.db.reports.find((x) => x.id === id);
    if (!r) throw new AppError("notFound", "Report not found");
    r.status = status;
    if (status === "resolved" || status === "dismissed") {
      r.resolved_at = new Date().toISOString();
      r.resolved_by = me;
    } else {
      r.resolved_at = null;
      r.resolved_by = null;
    }
    if ((status === "in_review" || status === "resolved" || status === "dismissed") &&
        this.prefsOf(r.reporter_id).report_updates) {
      const target = await this.resolveReportTarget(r.target_type, r.target_id);
      this.pushNotification(r.reporter_id, "report_update", {
        targetLabel: target?.label ?? r.target_type,
        status,
      }, target?.url ?? null);
    }
    this.persist();
    return { ...r };
  }

  // -------------------------------------------------------- moderation
  async listModerationEvents(targetType?: ReportTarget, targetId?: string): Promise<ModerationEvent[]> {
    const me = await this.requireUid();
    this.requireModerator(me);
    return this.db.events
      .filter((e) => (!targetType || e.target_type === targetType) && (!targetId || e.target_id === targetId))
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, 100)
      .map((e) => ({ ...e, moderator: this.db.profiles.find((p) => p.id === e.moderator_id) }));
  }

  async logModerationEvent(action: string, targetType: ReportTarget, targetId: string, details: Record<string, unknown>): Promise<ModerationEvent> {
    const me = await this.requireUid();
    this.requireModerator(me);
    const e: ModerationEvent = {
      id: uuid(),
      moderator_id: me,
      action,
      target_type: targetType,
      target_id: targetId,
      details,
      created_at: new Date().toISOString(),
    };
    this.db.events.push(e);
    this.persist();
    return { ...e };
  }

  private async notifyContentAuthor(
    kind: "content_hidden" | "content_restored",
    targetType: ReportTarget,
    targetId: string,
    authorId: string,
    extra: Record<string, string> = {}
  ): Promise<void> {
    if (!this.prefsOf(authorId).moderation_updates) return;
    const t = await this.resolveReportTarget(targetType, targetId);
    this.pushNotification(authorId, kind, { targetType, targetLabel: t?.label ?? targetType, ...extra }, t?.url ?? null);
  }

  async moderateStory(id: string, status: "hidden" | "ongoing" | "complete"): Promise<void> {
    const me = await this.requireUid();
    this.requireModerator(me);
    const s = this.db.stories.find((x) => x.id === id);
    if (!s) throw new AppError("notFound", "Story not found");
    const from = s.status;
    const enteringPublic =
      (status === "ongoing" || status === "complete") &&
      s.status !== "ongoing" && s.status !== "complete";
    if (enteringPublic) this.requirePublishable(id);
    s.status = status;
    s.updated_at = new Date().toISOString();
    await this.logModerationEvent(status === "hidden" ? "hide_story" : "restore_story", "story", id, { from, to: status, by: me });
    if (status === "hidden") await this.notifyContentAuthor("content_hidden", "story", id, s.author_id);
    this.persist();
  }

  async moderateChapter(id: string, status: "hidden" | "published"): Promise<void> {
    const me = await this.requireUid();
    this.requireModerator(me);
    const c = this.db.chapters.find((x) => x.id === id);
    if (!c) throw new AppError("notFound", "Chapter not found");
    const from = c.status;
    c.status = status;
    c.updated_at = new Date().toISOString();
    await this.logModerationEvent(status === "hidden" ? "hide_chapter" : "restore_chapter", "chapter", id, { from, to: status, by: me });
    if (status === "hidden") {
      const s = this.db.stories.find((x) => x.id === c.story_id);
      if (s) {
        const storyGonePublic =
          (s.status === "ongoing" || s.status === "complete") && this.publishedChapterCount(s.id) === 0;
        await this.notifyContentAuthor(
          "content_hidden", "chapter", id, s.author_id,
          storyGonePublic ? { storyHidden: "true" } : {}
        );
      }
    }
    this.persist();
  }

  async moderateComment(id: string, status: "hidden" | "removed" | "visible"): Promise<void> {
    const me = await this.requireUid();
    this.requireModerator(me);
    const c = this.db.comments.find((x) => x.id === id);
    if (!c) throw new AppError("notFound", "Comment not found");
    const from = c.status;
    c.status = status;
    c.updated_at = new Date().toISOString();
    await this.logModerationEvent("moderate_comment", "comment", id, { from, to: status, by: me });
    if (status === "hidden") await this.notifyContentAuthor("content_hidden", "comment", id, c.author_id);
    this.persist();
  }

  /** Restore hidden content to its pre-hide visibility. Audited, notifies author. */
  async restoreStory(id: string): Promise<void> {
    const me = await this.requireUid();
    this.requireModerator(me);
    const s = this.db.stories.find((x) => x.id === id);
    if (!s) throw new AppError("notFound", "Story not found");
    if (s.status !== "hidden") throw new AppError("generic", "Story is not hidden");
    const to = this.preHideStatus("hide_story", id, "ongoing");
    this.requirePublishable(id);
    s.status = to;
    s.updated_at = new Date().toISOString();
    await this.logModerationEvent("restore_story", "story", id, { from: "hidden", to, by: me });
    await this.notifyContentAuthor("content_restored", "story", id, s.author_id);
    this.persist();
  }

  async restoreChapter(id: string): Promise<void> {
    const me = await this.requireUid();
    this.requireModerator(me);
    const c = this.db.chapters.find((x) => x.id === id);
    if (!c) throw new AppError("notFound", "Chapter not found");
    if (c.status !== "hidden") throw new AppError("generic", "Chapter is not hidden");
    c.status = "published";
    c.updated_at = new Date().toISOString();
    await this.logModerationEvent("restore_chapter", "chapter", id, { from: "hidden", to: "published", by: me });
    const s = this.db.stories.find((x) => x.id === c.story_id);
    if (s) await this.notifyContentAuthor("content_restored", "chapter", id, s.author_id);
    this.persist();
  }

  async restoreComment(id: string): Promise<void> {
    const me = await this.requireUid();
    this.requireModerator(me);
    const c = this.db.comments.find((x) => x.id === id);
    if (!c) throw new AppError("notFound", "Comment not found");
    if (c.status !== "hidden") throw new AppError("generic", "Comment is not hidden");
    c.status = "visible";
    c.updated_at = new Date().toISOString();
    await this.logModerationEvent("moderate_comment", "comment", id, { from: "hidden", to: "visible", by: me });
    await this.notifyContentAuthor("content_restored", "comment", id, c.author_id);
    this.persist();
  }

  // ------------------------------------------------------------ appeals
  private appealTargetOwner(targetType: AppealTarget, targetId: string): { ownerId: string; hidden: boolean } {
    if (targetType === "story") {
      const s = this.db.stories.find((x) => x.id === targetId);
      return { ownerId: s?.author_id ?? "", hidden: s?.status === "hidden" };
    }
    const c = this.db.chapters.find((x) => x.id === targetId);
    const s = c && this.db.stories.find((x) => x.id === c.story_id);
    return { ownerId: s?.author_id ?? "", hidden: c?.status === "hidden" };
  }

  async createAppeal(targetType: AppealTarget, targetId: string, reason: string): Promise<Appeal> {
    const me = await this.requireUid();
    const text = reason.trim();
    if (!text) throw new AppError("generic", "Please give a reason");
    if (text.length > 1000) throw new AppError("generic", "Reason too long");
    const t = this.appealTargetOwner(targetType, targetId);
    if (!t.ownerId) throw new AppError("notFound", "Content not found");
    if (t.ownerId !== me) throw new AppError("notAuthor", "Only the author can appeal");
    if (!t.hidden) throw new AppError("generic", "Only hidden content can be appealed");
    if (this.db.appeals.some((a) => a.target_type === targetType && a.target_id === targetId && a.status === "pending"))
      throw new AppError("generic", "An appeal is already pending for this content");
    const now = new Date().toISOString();
    const appeal: Appeal = {
      id: uuid(),
      author_id: me,
      target_type: targetType,
      target_id: targetId,
      reason: text,
      status: "pending",
      decision_note: "",
      decided_by: null,
      decided_at: null,
      created_at: now,
    };
    this.db.appeals.push(appeal);
    const target = await this.resolveReportTarget(targetType, targetId);
    const writer = this.db.profiles.find((p) => p.id === me);
    this.notifyModerators("appeal_submitted", {
      authorName: writer?.display_name ?? "",
      targetLabel: target?.label ?? targetType,
    }, "/admin/reports");
    this.persist();
    return { ...appeal };
  }

  private withAppealContext(a: Appeal): Appeal {
    const author = this.db.profiles.find((p) => p.id === a.author_id);
    // resolveReportTarget is async; for sync context build the label directly
    let target_label: string = a.target_type;
    let target_url: string | null = null;
    if (a.target_type === "story") {
      const s = this.db.stories.find((x) => x.id === a.target_id);
      if (s) {
        const au = this.db.profiles.find((p) => p.id === s.author_id);
        target_label = s.title;
        target_url = `/stories/${au?.username}/${s.slug}`;
      }
    } else {
      const c = this.db.chapters.find((x) => x.id === a.target_id);
      const s = c && this.db.stories.find((x) => x.id === c.story_id);
      if (c && s) {
        const au = this.db.profiles.find((p) => p.id === s.author_id);
        target_label = `${s.title} — ${c.title}`;
        target_url = `/stories/${au?.username}/${s.slug}/${c.slug}`;
      }
    }
    return { ...a, author, target_label, target_url };
  }

  async listMyAppeals(): Promise<Appeal[]> {
    const me = await this.requireUid();
    return this.db.appeals
      .filter((a) => a.author_id === me)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map((a) => this.withAppealContext(a));
  }

  async listAppeals(status?: AppealStatus): Promise<Appeal[]> {
    const me = await this.requireUid();
    this.requireModerator(me);
    return this.db.appeals
      .filter((a) => !status || a.status === status)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, 100)
      .map((a) => this.withAppealContext(a));
  }

  async decideAppeal(id: string, decision: "approved" | "declined", note: string): Promise<Appeal> {
    const me = await this.requireUid();
    this.requireModerator(me);
    const a = this.db.appeals.find((x) => x.id === id);
    if (!a) throw new AppError("notFound", "Appeal not found");
    if (a.status !== "pending") throw new AppError("generic", "Appeal already decided");
    const now = new Date().toISOString();
    a.status = decision;
    a.decision_note = note.trim().slice(0, 1000);
    a.decided_by = me;
    a.decided_at = now;
    await this.logModerationEvent(
      decision === "approved" ? "appeal_approved" : "appeal_declined",
      a.target_type,
      a.target_id,
      { appeal_id: a.id, note: a.decision_note, by: me }
    );
    if (this.prefsOf(a.author_id).moderation_updates) {
      const ctx = this.withAppealContext(a);
      this.pushNotification(a.author_id, "appeal_decision", {
        targetLabel: ctx.target_label ?? a.target_type,
        decision,
        note: a.decision_note,
      }, "/write");
    }
    this.persist();
    return this.withAppealContext(a);
  }

  // ------------------------------------------------------ notifications
  async listNotifications(opts?: { unreadOnly?: boolean; limit?: number }): Promise<AppNotification[]> {
    const me = await this.requireUid();
    return this.db.notifications
      .filter((n) => n.user_id === me && (!opts?.unreadOnly || !n.is_read))
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, opts?.limit ?? 50)
      .map((n) => ({ ...n }));
  }

  async getUnreadNotificationCount(): Promise<number> {
    const me = await this.requireUid();
    return this.db.notifications.filter((n) => n.user_id === me && !n.is_read).length;
  }

  async markNotificationRead(id: string, read = true): Promise<void> {
    const me = await this.requireUid();
    const n = this.db.notifications.find((x) => x.id === id);
    if (!n) throw new AppError("notFound", "Notification not found");
    if (n.user_id !== me) throw new AppError("notAuthor", "Not your notification");
    n.is_read = read;
    this.persist();
  }

  async markAllNotificationsRead(): Promise<void> {
    const me = await this.requireUid();
    for (const n of this.db.notifications) if (n.user_id === me) n.is_read = true;
    this.persist();
  }

  /** The status content had before it was hidden (from the audit trail). */
  private preHideStatus(hideAction: string, targetId: string, fallback: Story["status"]): Story["status"] {
    const ev = this.db.events
      .filter((e) => e.action === hideAction && e.target_id === targetId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
    const from = (ev?.details as Record<string, unknown> | undefined)?.from;
    return (typeof from === "string" && (["draft", "ongoing", "complete"] as string[]).includes(from))
      ? (from as Story["status"])
      : fallback;
  }

  async resolveReportTarget(
    targetType: ReportTarget,
    targetId: string
  ): Promise<{ label: string; url: string | null; status: string | null } | null> {
    if (targetType === "story") {
      const s = this.db.stories.find((x) => x.id === targetId);
      if (!s) return null;
      const a = this.db.profiles.find((p) => p.id === s.author_id);
      return { label: s.title, url: `/stories/${a?.username}/${s.slug}`, status: s.status };
    }
    if (targetType === "chapter") {
      const c = this.db.chapters.find((x) => x.id === targetId);
      const s = c && this.db.stories.find((x) => x.id === c.story_id);
      if (!c || !s) return null;
      const a = this.db.profiles.find((p) => p.id === s.author_id);
      return {
        label: `${s.title} — ${c.title}`,
        url: `/stories/${a?.username}/${s.slug}/${c.slug}`,
        status: c.status,
      };
    }
    if (targetType === "comment") {
      const cm = this.db.comments.find((x) => x.id === targetId);
      if (!cm) return null;
      const c = this.db.chapters.find((x) => x.id === cm.chapter_id);
      const s = c && this.db.stories.find((x) => x.id === c.story_id);
      const a = s && this.db.profiles.find((p) => p.id === s.author_id);
      const context = s && c ? ` (${s.title} — ${c.title})` : "";
      return {
        label: `Comment${context}: ${cm.body.slice(0, 80)}`,
        url: s && c && a ? `/stories/${a.username}/${s.slug}/${c.slug}` : null,
        status: cm.status,
      };
    }
    const p = this.db.profiles.find((x) => x.id === targetId);
    if (!p) return null;
    return { label: p.display_name, url: `/authors/${p.username}`, status: null };
  }

  // ----------------------------------------------------------- storage
  async uploadCover(file: File): Promise<string> {
    await this.requireUid();
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new AppError("generic", "Only JPG, PNG or WebP images");
    if (file.size > 2 * 1024 * 1024) throw new AppError("generic", "Image must be under 2 MB");
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = () => reject(new Error("read failed"));
      r.readAsDataURL(file);
    });
    return dataUrl; // demo: coverUrl passes data: URLs through
  }

  coverUrl(path: string | null): string | null {
    if (!path) return null;
    if (path.startsWith("data:")) return path;
    if (path.startsWith("demo:")) {
      const [, title, lang] = path.split(":");
      return demoCover(decodeURIComponent(title ?? ""), lang === "bn" ? "bn" : "en");
    }
    return path;
  }
}
