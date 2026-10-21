import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useApp } from "../lib/app-context";
import { Layout } from "../components/layout";
import { Badge, Button, ButtonLink, Card, EmptyState, Modal, Spinner, Textarea } from "../components/ui";
import { formatDate, timeAgo } from "../lib/utils";
import type { Appeal, Report, ReportTarget } from "../lib/types";

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

  async function restore() {
    setBusy(true);
    try {
      if (targetType === "story") await dp.restoreStory(targetId);
      else if (targetType === "chapter") await dp.restoreChapter(targetId);
      else if (targetType === "comment") await dp.restoreComment(targetId);
      else if (targetType === "keepsake") await dp.restoreKeepsake(targetId);
      setConfirm(false);
      onDone();
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

export function AdminPage() {
  const { t, locale, dp } = useApp();
  const [tab, setTab] = useState<"queue" | "appeals" | "resolved" | "audit">("queue");

  const reportsQuery = useQuery({ queryKey: ["reports"], queryFn: () => dp.listReports() });
  const appealsQuery = useQuery({
    queryKey: ["appeals"],
    queryFn: () => dp.listAppeals(),
    enabled: tab === "appeals",
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
        </div>

        <div className="mt-6">
          {tab === "appeals" ? (
            appealsQuery.isLoading ? <Spinner /> : appeals.length ? (
              <div className="flex flex-col gap-4">
                {appeals.map((a) => <AppealCard key={a.id} appeal={a} />)}
              </div>
            ) : (
              <EmptyState title={t("appeals", "empty")} />
            )
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
