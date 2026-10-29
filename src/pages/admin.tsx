import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useApp } from "../lib/app-context";
import { Layout } from "../components/layout";
import { Badge, Button, ButtonLink, Card, EmptyState, Input, Label, Modal, Spinner, Textarea } from "../components/ui";
import { AppError, formatDate, timeAgo } from "../lib/utils";
import type { Appeal, CuratedShelf, Report, ReportTarget, ShelfLayout, Story } from "../lib/types";
import { storyPath } from "../components/story-card";

function RequireModerator({ children }: { children: React.ReactNode }) {
  const { t, session, sessionLoading, isModerator } = useApp();
  if (sessionLoading) return <Layout><Spinner /></Layout>;
  if (!session || !isModerator) {
    return (
      <Layout>
        <EmptyState
          title={t("errors", !session ? "signInRequired" : "notModerator")}
          action={<ButtonLink to="/">{t("nav", "home")}</ButtonLink>}
        />
      </Layout>
    );
  }
  return <>{children}</>;
}

function useTarget(type: ReportTarget, id: string) {
  const { dp } = useApp();
  return useQuery({
    queryKey: ["reportTarget", type, id],
    queryFn: () => dp.resolveReportTarget(type, id),
  });
}

function TargetLink({ type, id }: { type: ReportTarget; id: string }) {
  const { data, isLoading } = useTarget(type, id);
  if (isLoading) return <span className="text-xs text-ink-faint">…</span>;
  if (!data) return <span className="text-xs text-clay">({type} — deleted?)</span>;
  return data.url ? (
    <Link to={data.url} className="text-sm font-medium text-river hover:underline">{data.label}</Link>
  ) : (
    <span className="text-sm">{data.label}</span>
  );
}

/** Restore button with a confirmation step (restoring makes content public again). */
function RestoreButton({ targetType, targetId, onDone }: { targetType: ReportTarget; targetId: string; onDone: () => void }) {
  const { t, dp } = useApp();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function restore() {
    setBusy(true);
    setError(null);
    try {
      if (targetType === "story") await dp.restoreStory(targetId);
      else if (targetType === "chapter") await dp.restoreChapter(targetId);
      else if (targetType === "comment") await dp.restoreComment(targetId);
      else if (targetType === "keepsake") await dp.restoreKeepsake(targetId);
      setConfirm(false);
      onDone();
    } catch (e) {
      // Was try/finally with no catch: a failed restore left the modal
      // open with no explanation. Now the failure is shown, and the
      // moderator can retry or close.
      setError(e instanceof AppError ? t("errors", e.code) : t("errors", "generic"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button size="sm" variant="secondary" disabled={busy} onClick={() => setConfirm(true)}>
        {t("moderation", "restore")}
      </Button>
      <Modal open={confirm} onClose={() => setConfirm(false)} title={t("moderation", "restoreConfirmTitle")}>
        <p className="text-sm text-ink-soft">{t("moderation", "restoreConfirmBody")}</p>
        {error && <p className="mt-3 text-sm text-clay">{error}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setConfirm(false)}>{t("common", "cancel")}</Button>
          <Button disabled={busy} onClick={restore}>{t("common", "confirm")}</Button>
        </div>
      </Modal>
    </>
  );
}

function ContentStatusBadge({ status }: { status: string | null | undefined }) {
  const { t } = useApp();
  if (!status) return null;
  if (status === "hidden") return <Badge tone="clay">{t("story", "hidden")}</Badge>;
  if (status === "visible") return <Badge tone="sage">{t("moderation", "resolved")}</Badge>;
  return <Badge>{status}</Badge>;
}

function ReportCard({ report }: { report: Report }) {
  const { t, locale, dp } = useApp();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const target = useTarget(report.target_type, report.target_id);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["reports"] });
    queryClient.invalidateQueries({ queryKey: ["audit"] });
    queryClient.invalidateQueries({ queryKey: ["reportTarget"] });
  };

  async function act(label: string, fn: () => Promise<unknown>) {
    setBusy(label);
    try {
      await fn();
      refresh();
    } finally {
      setBusy(null);
    }
  }

  const statusTone = { open: "clay", in_review: "gold", resolved: "sage", dismissed: "sage" } as const;
  const isHidden = target.data?.status === "hidden";
  const isRestricted = target.data?.status === "restricted";
  const restorable = ((report.target_type === "story" || report.target_type === "chapter" || report.target_type === "comment") && isHidden)
    || (report.target_type === "keepsake" && isRestricted);

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={statusTone[report.status]}>{t("moderation", report.status === "open" ? "open" : report.status === "in_review" ? "inReview" : report.status === "resolved" ? "resolved" : "dismissed")}</Badge>
        <Badge>{report.target_type}</Badge>
        <ContentStatusBadge status={target.data?.status} />
        <span className="ml-auto text-xs text-ink-faint">{timeAgo(report.created_at, locale)}</span>
      </div>

      <div className="mt-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">{t("moderation", "target")}</p>
        <TargetLink type={report.target_type} id={report.target_id} />
      </div>

      <div className="mt-2">
        <p className="text-sm"><strong>{t("reports", "reason")}:</strong> {report.reason}</p>
        {report.details && <p className="mt-1 text-sm text-ink-soft">{report.details}</p>}
      </div>

      <div className="mt-4 flex flex-wrap gap-2 border-t border-ink/10 pt-4">
        {report.status === "open" && (
          <Button size="sm" variant="secondary" disabled={!!busy}
            onClick={() => act("review", () => dp.updateReport(report.id, "in_review"))}>
            {t("moderation", "markInReview")}
          </Button>
        )}
        {(report.status === "open" || report.status === "in_review") && (
          <>
            {report.target_type === "story" && !isHidden && (
              <Button size="sm" variant="danger" disabled={!!busy}
                onClick={() => act("hide", () => dp.moderateStory(report.target_id, "hidden"))}>
                {t("moderation", "hideStory")}
              </Button>
            )}
            {report.target_type === "chapter" && !isHidden && (
              <Button size="sm" variant="danger" disabled={!!busy}
                onClick={() => act("hide", () => dp.moderateChapter(report.target_id, "hidden"))}>
                {t("moderation", "hideChapter")}
              </Button>
            )}
            {report.target_type === "comment" && !isHidden && (
              <Button size="sm" variant="danger" disabled={!!busy}
                onClick={() => act("hide", () => dp.moderateComment(report.target_id, "hidden"))}>
                {t("moderation", "hideComment")}
              </Button>
            )}
            {report.target_type === "keepsake" && !isRestricted && (
              <Button size="sm" variant="danger" disabled={!!busy}
                onClick={() => act("restrict", () => dp.restrictKeepsake(report.target_id))}>
                {t("moderation", "restrictKeepsake")}
              </Button>
            )}
            <Button size="sm" variant="secondary" disabled={!!busy}
              onClick={() => act("resolve", () => dp.updateReport(report.id, "resolved"))}>
              {t("moderation", "markResolved")}
            </Button>
            <Button size="sm" variant="ghost" disabled={!!busy}
              onClick={() => act("dismiss", () => dp.updateReport(report.id, "dismissed"))}>
              {t("moderation", "dismiss")}
            </Button>
          </>
        )}
        {restorable && (
          <RestoreButton targetType={report.target_type} targetId={report.target_id} onDone={refresh} />
        )}
        {busy && <span className="self-center text-xs text-ink-faint">{t("common", "loading")}</span>}
      </div>
    </Card>
  );
}

function AppealCard({ appeal }: { appeal: Appeal }) {
  const { t, locale, dp } = useApp();
  const queryClient = useQueryClient();
  const [deciding, setDeciding] = useState<"approved" | "declined" | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const target = useTarget(appeal.target_type, appeal.target_id);
  // Fallback restore only if auto-restore did not complete. Appeals only
  // ever target stories/chapters/comments (AppealTarget excludes
  // keepsakes), and those hide with status "hidden" — so the gate is
  // just "still hidden". Without it, every approved card shows a Restore
  // button that fails (the target is already public after auto-restore).
  const restorable = target.data?.status === "hidden";

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["appeals"] });
    queryClient.invalidateQueries({ queryKey: ["audit"] });
    queryClient.invalidateQueries({ queryKey: ["reportTarget"] });
  };

  async function decide() {
    if (!deciding) return;
    setBusy(true);
    try {
      await dp.decideAppeal(appeal.id, deciding, note);
      setDeciding(null);
      setNote("");
      refresh();
    } finally {
      setBusy(false);
    }
  }

  const tone = appeal.status === "pending" ? "gold" : appeal.status === "approved" ? "sage" : "clay";

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={tone}>{t("appeals", appeal.status)}</Badge>
        <Badge>{appeal.target_type}</Badge>
        <span className="ml-auto text-xs text-ink-faint">{timeAgo(appeal.created_at, locale)}</span>
      </div>

      <div className="mt-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">{t("moderation", "target")}</p>
        {appeal.target_url ? (
          <Link to={appeal.target_url} className="text-sm font-medium text-river hover:underline">
            {appeal.target_label ?? appeal.target_id}
          </Link>
        ) : (
          <span className="text-sm">{appeal.target_label ?? appeal.target_id}</span>
        )}
        <p className="mt-1 text-xs text-ink-faint">
          {appeal.author?.display_name ?? appeal.author_id.slice(0, 8)}
          {appeal.author ? ` (@${appeal.author.username})` : ""}
        </p>
      </div>

      <div className="mt-2">
        <p className="text-sm"><strong>{t("appeals", "reason")}:</strong> {appeal.reason}</p>
        {appeal.status !== "pending" && appeal.decision_note && (
          <p className="mt-1 text-sm text-ink-soft">
            <strong>{t("appeals", "decidedNote")}:</strong> {appeal.decision_note}
          </p>
        )}
      </div>

      {appeal.status === "pending" && (
        <div className="mt-4 flex flex-wrap gap-2 border-t border-ink/10 pt-4">
          <Button size="sm" onClick={() => setDeciding("approved")}>{t("appeals", "approve")}</Button>
          <Button size="sm" variant="danger" onClick={() => setDeciding("declined")}>{t("appeals", "decline")}</Button>
        </div>
      )}

      {appeal.status === "approved" && restorable && (
        <div className="mt-4 flex flex-wrap gap-2 border-t border-ink/10 pt-4">
          <RestoreButton targetType={appeal.target_type} targetId={appeal.target_id} onDone={refresh} />
        </div>
      )}

      <Modal
        open={deciding !== null}
        onClose={() => setDeciding(null)}
        title={deciding === "approved" ? t("appeals", "approve") : t("appeals", "decline")}
      >
        <p className="text-sm text-ink-soft">{t("appeals", "approveNote")}</p>
        <label className="mt-3 block text-sm font-medium text-ink-soft" htmlFor={`appeal-note-${appeal.id}`}>
          {t("appeals", "decisionNote")}
        </label>
        <Textarea
          id={`appeal-note-${appeal.id}`}
          rows={3}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t("appeals", "decisionNotePlaceholder")}
        />
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setDeciding(null)}>{t("common", "cancel")}</Button>
          <Button variant={deciding === "declined" ? "danger" : "primary"} disabled={busy} onClick={decide}>
            {t("common", "confirm")}
          </Button>
        </div>
      </Modal>
    </Card>
  );
}

function FeaturedTab() {
  const { t, dp } = useApp();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const featuredQuery = useQuery({ queryKey: ["admin-featured"], queryFn: () => dp.listAllFeatured() });
  const publicQuery = useQuery({ queryKey: ["admin-public-stories"], queryFn: () => dp.listStories({ limit: 100 }) });

  const featured = featuredQuery.data ?? [];
  const featuredIds = new Set(featured.map((s) => s.id));
  const candidates = (publicQuery.data?.stories ?? []).filter((s) => !featuredIds.has(s.id));

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["admin-featured"] });
    queryClient.invalidateQueries({ queryKey: ["admin-public-stories"] });
    queryClient.invalidateQueries({ queryKey: ["stories"] });
  };

  async function act(label: string, fn: () => Promise<unknown>) {
    setBusy(label);
    setError(null);
    try {
      await fn();
      refresh();
    } catch (e: any) {
      setError(e?.code ?? "generic");
    } finally {
      setBusy(null);
    }
  }

  async function feature() {
    if (!selected) return;
    const pos = Math.max(0, ...featured.map((s) => s.featured_position ?? 0)) + 1;
    await act("feature", () => dp.setFeaturedPosition(selected, pos));
    setSelected("");
  }

  async function move(story: Story, dir: -1 | 1) {
    const idx = featured.findIndex((s) => s.id === story.id);
    const neighbor = featured[idx + dir];
    if (idx < 0 || !neighbor) return;
    const a = story.featured_position ?? 0;
    const b = neighbor.featured_position ?? 0;
    // No unique constraint on positions, so a plain two-step swap cannot collide.
    await act("move", async () => {
      await dp.setFeaturedPosition(story.id, b);
      await dp.setFeaturedPosition(neighbor.id, a);
    });
  }

  async function remove(story: Story) {
    const pos = story.featured_position ?? 0;
    await act("remove", async () => {
      await dp.setFeaturedPosition(story.id, null);
      // Renumber so positions stay dense 1..N.
      for (const s of featured) {
        if (s.id !== story.id && (s.featured_position ?? 0) > pos) {
          await dp.setFeaturedPosition(s.id, (s.featured_position ?? 0) - 1);
        }
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="p-5">
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label={t("moderation", "featureStory")}
            className="rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm focus:border-river focus:outline-none"
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
          >
            <option value="">{t("moderation", "chooseStory")}</option>
            {candidates.map((s) => (
              <option key={s.id} value={s.id}>{s.title}</option>
            ))}
          </select>
          <Button size="sm" disabled={!selected || busy !== null} onClick={feature}>
            {t("moderation", "featureStory")}
          </Button>
        </div>
        {error ? <p className="mt-2 text-sm text-clay">{t("errors", error)}</p> : null}
      </Card>
      {featuredQuery.isLoading ? (
        <Spinner />
      ) : featured.length ? (
        <Card className="divide-y divide-ink/10">
          {featured.map((s, i) => (
            <div key={s.id} className="flex flex-wrap items-center gap-2 px-5 py-3 text-sm">
              <span className="font-serif font-bold">#{s.featured_position}</span>
              <Link to={storyPath(s)} className="font-medium hover:underline">{s.title}</Link>
              <span className="text-ink-faint">{s.author?.display_name ?? ""}</span>
              <span className="ml-auto flex gap-2">
                <Button size="sm" variant="secondary" disabled={i === 0 || busy !== null} onClick={() => move(s, -1)}>
                  ↑ {t("moderation", "moveUp")}
                </Button>
                <Button size="sm" variant="secondary" disabled={i === featured.length - 1 || busy !== null} onClick={() => move(s, 1)}>
                  ↓ {t("moderation", "moveDown")}
                </Button>
                <Button size="sm" variant="danger" disabled={busy !== null} onClick={() => remove(s)}>
                  {t("moderation", "removeFeatured")}
                </Button>
              </span>
            </div>
          ))}
        </Card>
      ) : (
        <EmptyState title={t("moderation", "featuredEmpty")} />
      )}
    </div>
  );
}

function ShelfEditor({ shelf, shelves, publicStories, refresh }: { shelf: CuratedShelf; shelves: CuratedShelf[]; publicStories: Story[]; refresh: () => void }) {
  const { t, dp } = useApp();
  const [name, setName] = useState(shelf.name);
  const [layout, setLayout] = useState<ShelfLayout>(shelf.layout);
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const inShelf = new Set(shelf.stories.map((s) => s.id));
  const candidates = publicStories.filter((s) => !inShelf.has(s.id));

  async function act(label: string, fn: () => Promise<unknown>) {
    setBusy(label);
    setError(null);
    try {
      await fn();
      refresh();
    } catch (e: any) {
      setError(e?.code ?? "generic");
    } finally {
      setBusy(null);
    }
  }

  async function save() {
    await act("save", () => dp.updateShelf(shelf.id, { name, layout }));
  }

  async function moveShelf(dir: -1 | 1) {
    const idx = shelves.findIndex((s) => s.id === shelf.id);
    const neighbor = shelves[idx + dir];
    if (idx < 0 || !neighbor) return;
    await act("move", async () => {
      await dp.updateShelf(shelf.id, { position: neighbor.position });
      await dp.updateShelf(neighbor.id, { position: shelf.position });
    });
  }

  async function removeShelf() {
    const pos = shelf.position;
    await act("delete", async () => {
      await dp.deleteShelf(shelf.id);
      for (const s of shelves) {
        if (s.id !== shelf.id && s.position > pos) await dp.updateShelf(s.id, { position: s.position - 1 });
      }
    });
  }

  async function addItem() {
    if (!selected) return;
    await act("add", () => dp.addShelfItem(shelf.id, selected));
    setSelected("");
  }

  async function moveItem(story: Story, dir: -1 | 1) {
    const idx = shelf.stories.findIndex((s) => s.id === story.id);
    const neighbor = shelf.stories[idx + dir];
    if (idx < 0 || !neighbor) return;
    await act("moveItem", async () => {
      await dp.setShelfItemPosition(shelf.id, story.id, idx + dir + 1);
      await dp.setShelfItemPosition(shelf.id, neighbor.id, idx + 1);
    });
  }

  async function removeItem(story: Story) {
    const idx = shelf.stories.findIndex((s) => s.id === story.id);
    await act("removeItem", async () => {
      await dp.removeShelfItem(shelf.id, story.id);
      for (let i = idx + 1; i < shelf.stories.length; i++) {
        await dp.setShelfItemPosition(shelf.id, shelf.stories[i].id, i);
      }
    });
  }

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center gap-2">
        <input
          aria-label={t("moderation", "shelfName")}
          className="min-w-0 flex-1 rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm focus:border-river focus:outline-none"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <select
          aria-label={t("moderation", "shelfLayout")}
          className="rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm focus:border-river focus:outline-none"
          value={layout}
          onChange={(e) => setLayout(e.target.value as ShelfLayout)}
        >
          <option value="horizontal">{t("moderation", "layoutHorizontal")}</option>
          <option value="vertical">{t("moderation", "layoutVertical")}</option>
        </select>
        <Button size="sm" disabled={busy !== null || !name.trim()} onClick={save}>
          {t("moderation", "saveShelf")}
        </Button>
        <Button size="sm" variant="secondary" disabled={shelves[0]?.id === shelf.id || busy !== null} onClick={() => moveShelf(-1)}>
          ↑ {t("moderation", "moveUp")}
        </Button>
        <Button size="sm" variant="secondary" disabled={shelves[shelves.length - 1]?.id === shelf.id || busy !== null} onClick={() => moveShelf(1)}>
          ↓ {t("moderation", "moveDown")}
        </Button>
        <Button size="sm" variant="danger" disabled={busy !== null} onClick={removeShelf}>
          {t("moderation", "deleteShelf")}
        </Button>
      </div>
      {error ? <p className="mt-2 text-sm text-clay">{t("errors", error)}</p> : null}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <select
          aria-label={t("moderation", "addStoryToShelf")}
          className="rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm focus:border-river focus:outline-none"
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
        >
          <option value="">{t("moderation", "chooseStory")}</option>
          {candidates.map((s) => (
            <option key={s.id} value={s.id}>{s.title}</option>
          ))}
        </select>
        <Button size="sm" disabled={!selected || busy !== null} onClick={addItem}>
          {t("moderation", "addStoryToShelf")}
        </Button>
      </div>
      {shelf.stories.length ? (
        <div className="mt-4 divide-y divide-ink/10 border-t border-ink/10">
          {shelf.stories.map((s, i) => (
            <div key={s.id} className="flex flex-wrap items-center gap-2 py-3 text-sm">
              <span className="font-serif font-bold">#{i + 1}</span>
              <Link to={storyPath(s)} className="font-medium hover:underline">{s.title}</Link>
              <span className="text-ink-faint">{s.author?.display_name ?? ""}</span>
              <span className="ml-auto flex gap-2">
                <Button size="sm" variant="secondary" disabled={i === 0 || busy !== null} onClick={() => moveItem(s, -1)}>
                  ↑ {t("moderation", "moveUp")}
                </Button>
                <Button size="sm" variant="secondary" disabled={i === shelf.stories.length - 1 || busy !== null} onClick={() => moveItem(s, 1)}>
                  ↓ {t("moderation", "moveDown")}
                </Button>
                <Button size="sm" variant="danger" disabled={busy !== null} onClick={() => removeItem(s)}>
                  {t("moderation", "removeShelfItem")}
                </Button>
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </Card>
  );
}

function ShelvesTab() {
  const { t, dp } = useApp();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [layout, setLayout] = useState<ShelfLayout>("horizontal");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const shelvesQuery = useQuery({ queryKey: ["admin-shelves"], queryFn: () => dp.listCuratedShelves() });
  const publicQuery = useQuery({ queryKey: ["admin-public-stories"], queryFn: () => dp.listStories({ limit: 100 }) });

  const shelves = shelvesQuery.data ?? [];
  const publicStories = publicQuery.data?.stories ?? [];

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["admin-shelves"] });
    queryClient.invalidateQueries({ queryKey: ["curated-shelves"] });
    queryClient.invalidateQueries({ queryKey: ["stories"] });
  };

  async function create() {
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await dp.createShelf(name, layout);
      setName("");
      setLayout("horizontal");
      refresh();
    } catch (e: any) {
      setError(e?.code ?? "generic");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="p-5">
        <div className="flex flex-wrap items-center gap-2">
          <input
            aria-label={t("moderation", "shelfName")}
            className="min-w-0 flex-1 rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm focus:border-river focus:outline-none"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("moderation", "shelfNamePlaceholder")}
          />
          <select
            aria-label={t("moderation", "shelfLayout")}
            className="rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm focus:border-river focus:outline-none"
            value={layout}
            onChange={(e) => setLayout(e.target.value as ShelfLayout)}
          >
            <option value="horizontal">{t("moderation", "layoutHorizontal")}</option>
            <option value="vertical">{t("moderation", "layoutVertical")}</option>
          </select>
          <Button size="sm" disabled={!name.trim() || busy} onClick={create}>
            {t("moderation", "createShelf")}
          </Button>
        </div>
        {error ? <p className="mt-2 text-sm text-clay">{t("errors", error)}</p> : null}
      </Card>
      {shelvesQuery.isLoading ? (
        <Spinner />
      ) : shelves.length ? (
        shelves.map((s) => <ShelfEditor key={s.id} shelf={s} shelves={shelves} publicStories={publicStories} refresh={refresh} />)
      ) : (
        <EmptyState title={t("moderation", "shelvesEmpty")} />
      )}
    </div>
  );
}

function MessageTab() {
  const { t, dp } = useApp();
  const [username, setUsername] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function send() {
    setBusy(true);
    setError(null);
    setSent(false);
    try {
      await dp.sendAdminMessage(username, title, body, link || null);
      setSent(true);
      setUsername("");
      setTitle("");
      setBody("");
      setLink("");
    } catch (e: any) {
      setError(e?.code ?? "generic");
    } finally {
      setBusy(false);
    }
  }

  const valid = username.trim() !== "" && title.trim() !== "" && body.trim() !== "";

  return (
    <Card className="max-w-xl p-5">
      <div className="flex flex-col gap-4">
        <div>
          <Label htmlFor="msg-username">{t("moderation", "messageUsername")}</Label>
          <Input id="msg-username" value={username} onChange={(e) => setUsername(e.target.value)} placeholder={t("moderation", "messageUsernamePlaceholder")} />
        </div>
        <div>
          <Label htmlFor="msg-title">{t("moderation", "messageTitle")}</Label>
          <Input id="msg-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} placeholder={t("moderation", "messageTitlePlaceholder")} />
        </div>
        <div>
          <Label htmlFor="msg-body">{t("moderation", "messageBody")}</Label>
          <Textarea id="msg-body" value={body} onChange={(e) => setBody(e.target.value)} maxLength={2000} rows={5} placeholder={t("moderation", "messageBodyPlaceholder")} />
        </div>
        <div>
          <Label htmlFor="msg-link">{t("moderation", "messageLink")}</Label>
          <Input id="msg-link" value={link} onChange={(e) => setLink(e.target.value)} placeholder={t("moderation", "messageLinkPlaceholder")} />
          <p className="mt-1 text-xs text-ink-faint">{t("moderation", "messageLinkHint")}</p>
        </div>
        {error ? <p className="text-sm text-clay">{t("errors", error)}</p> : null}
        {sent ? <p className="text-sm text-river-dark">{t("moderation", "messageSent")}</p> : null}
        <div>
          <Button onClick={send} disabled={!valid || busy}>{t("moderation", "messageSend")}</Button>
        </div>
      </div>
    </Card>
  );
}

export function AdminPage() {
  const { t, locale, dp } = useApp();
  const [tab, setTab] = useState<"queue" | "appeals" | "resolved" | "audit" | "metrics" | "featured" | "shelves" | "message">("queue");

  const reportsQuery = useQuery({ queryKey: ["reports"], queryFn: () => dp.listReports() });
  const metricsQuery = useQuery({
    queryKey: ["admin-metrics"],
    queryFn: () => dp.getAdminMetrics(),
    enabled: tab === "metrics",
  });
  const appealsQuery = useQuery({
    queryKey: ["appeals"],
    queryFn: () => dp.listAppeals(),
    // No tab gate: the Appeals tab badge shows pendingAppeals.length,
    // and a tab-gated query reads 0 until the tab is first clicked.
  });
  const auditQuery = useQuery({
    queryKey: ["audit"],
    queryFn: () => dp.listModerationEvents(),
    enabled: tab === "audit",
  });

  const reports = reportsQuery.data ?? [];
  const queue = reports.filter((r) => r.status === "open" || r.status === "in_review");
  const resolved = reports.filter((r) => r.status === "resolved" || r.status === "dismissed");
  const appeals = appealsQuery.data ?? [];
  const pendingAppeals = appeals.filter((a) => a.status === "pending");

  const tabBtn = (active: boolean) =>
    `rounded-lg px-4 py-2 text-sm font-medium ${active ? "bg-river text-white" : "bg-sage text-ink hover:bg-sage-dark"}`;

  return (
    <RequireModerator>
      <Layout>
        <h1 className="mt-6 font-serif text-3xl font-bold">{t("moderation", "title")}</h1>

        <div className="mt-4 flex flex-wrap gap-2" role="tablist">
          <button role="tab" aria-selected={tab === "queue"} className={tabBtn(tab === "queue")} onClick={() => setTab("queue")}>
            {t("moderation", "queue")} ({queue.length})
          </button>
          <button role="tab" aria-selected={tab === "appeals"} className={tabBtn(tab === "appeals")} onClick={() => setTab("appeals")}>
            {t("appeals", "title")} ({pendingAppeals.length})
          </button>
          <button role="tab" aria-selected={tab === "resolved"} className={tabBtn(tab === "resolved")} onClick={() => setTab("resolved")}>
            {t("moderation", "resolved")} ({resolved.length})
          </button>
          <button role="tab" aria-selected={tab === "audit"} className={tabBtn(tab === "audit")} onClick={() => setTab("audit")}>
            {t("moderation", "audit")}
          </button>
          <button role="tab" aria-selected={tab === "metrics"} className={tabBtn(tab === "metrics")} onClick={() => setTab("metrics")}>
            {t("moderation", "metrics")}
          </button>
          <button role="tab" aria-selected={tab === "featured"} className={tabBtn(tab === "featured")} onClick={() => setTab("featured")}>
            {t("moderation", "featured")}
          </button>
          <button role="tab" aria-selected={tab === "shelves"} className={tabBtn(tab === "shelves")} onClick={() => setTab("shelves")}>
            {t("moderation", "shelves")}
          </button>
          <button role="tab" aria-selected={tab === "message"} className={tabBtn(tab === "message")} onClick={() => setTab("message")}>
            {t("moderation", "message")}
          </button>
        </div>

        <div className="mt-6">
          {tab === "metrics" ? (
            metricsQuery.isLoading ? <Spinner /> : metricsQuery.data ? (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                {([
                  ["metricsSignups", metricsQuery.data.signups],
                  ["metricsStories", metricsQuery.data.storiesPublished],
                  ["metricsChapters", metricsQuery.data.chaptersPublished],
                  ["metricsViews7d", metricsQuery.data.views7d],
                  ["metricsViews30d", metricsQuery.data.views30d],
                  ["metricsOpenReports", metricsQuery.data.openReports],
                  ["metricsAppealsPending", metricsQuery.data.appealsPending],
                ] as const).map(([key, value]) => (
                  <Card key={key} className="p-5">
                    <p className="font-serif text-3xl font-bold">{value}</p>
                    <p className="mt-1 text-sm text-ink-soft">{t("moderation", key)}</p>
                  </Card>
                ))}
              </div>
            ) : (
              <EmptyState title={t("moderation", "empty")} />
            )
          ) : tab === "appeals" ? (
            appealsQuery.isLoading ? <Spinner /> : appeals.length ? (
              <div className="flex flex-col gap-4">
                {appeals.map((a) => <AppealCard key={a.id} appeal={a} />)}
              </div>
            ) : (
              <EmptyState title={t("appeals", "empty")} />
            )
          ) : tab === "featured" ? (
            <FeaturedTab />
          ) : tab === "shelves" ? (
            <ShelvesTab />
          ) : tab === "message" ? (
            <MessageTab />
          ) : tab !== "audit" ? (
            reportsQuery.isLoading ? <Spinner /> : (tab === "queue" ? queue : resolved).length ? (
              <div className="flex flex-col gap-4">
                {(tab === "queue" ? queue : resolved).map((r) => <ReportCard key={r.id} report={r} />)}
              </div>
            ) : (
              <EmptyState title={t("moderation", "empty")} />
            )
          ) : auditQuery.isLoading ? (
            <Spinner />
          ) : auditQuery.data?.length ? (
            <Card className="divide-y divide-ink/10">
              {auditQuery.data.map((e) => (
                <div key={e.id} className="flex flex-wrap items-center gap-2 px-5 py-3 text-sm">
                  <Badge tone="river">{e.action}</Badge>
                  <span className="text-ink-faint">{e.target_type}</span>
                  <TargetLink type={e.target_type as ReportTarget} id={e.target_id} />
                  <span className="ml-auto text-xs text-ink-faint">
                    {t("moderation", "by")} {e.moderator?.display_name ?? e.moderator_id.slice(0, 8)} · {formatDate(e.created_at, locale)}
                  </span>
                </div>
              ))}
            </Card>
          ) : (
            <EmptyState title={t("moderation", "empty")} />
          )}
        </div>
      </Layout>
    </RequireModerator>
  );
}
