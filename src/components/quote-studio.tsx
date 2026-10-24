import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useApp } from "../lib/app-context";
import { Button, FieldError, Modal, Textarea } from "./ui";
import { AppError, slugify } from "../lib/utils";
import { KEEPSAKE_TEMPLATES } from "../lib/data-provider";
import type { KeepsakeTemplate, Story } from "../lib/types";
import {
  CARD_TEMPLATES,
  downloadKeepsakePNG,
  keepsakeAttribution,
  normalizeExcerpt,
  renderKeepsakeCard,
} from "../lib/keepsake-card";

/** Session-storage key for a signed-out selection that survives sign-in. */
export const PENDING_KEEP_KEY = "golponeer-pending-keepsake";

export interface PendingKeepsake {
  storyId: string;
  chapterId: string | null;
  excerpt: string;
  template: KeepsakeTemplate;
  echo: string;
  returnTo: string;
}

const TEMPLATE_I18N: Record<KeepsakeTemplate, string> = {
  "classic-paper": "templateClassicPaper",
  midnight: "templateMidnight",
  "quiet-garden": "templateQuietGarden",
  "old-letters": "templateOldLetters",
  "modern-ink": "templateModernInk",
  neer: "templateNeer",
};

export function QuoteStudio({
  open,
  onClose,
  story,
  chapterId,
  initialExcerpt,
  initialTemplate,
  initialEcho,
  returnTo,
  filenameBase,
}: {
  open: boolean;
  onClose: () => void;
  story: Pick<Story, "id" | "title" | "author">;
  chapterId: string | null;
  initialExcerpt: string;
  initialTemplate?: KeepsakeTemplate;
  initialEcho?: string;
  returnTo: string;
  /** ASCII slug for the download filename (Bangla names are dropped to
   * "download" by some download handlers — story slugs are Latin). */
  filenameBase: string;
}) {
  const { t, dp, session, locale } = useApp();
  const navigate = useNavigate();
  const queryClient = useQueryClient();  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [excerpt, setExcerpt] = useState(() => normalizeExcerpt(initialExcerpt));
  const [template, setTemplate] = useState<KeepsakeTemplate>(initialTemplate ?? "classic-paper");
  const [echo, setEcho] = useState(initialEcho ?? "");
  const [savedId, setSavedId] = useState<string | null>(null);
  const [published, setPublished] = useState(false);
  const [trimmed, setTrimmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Fresh state every time the studio opens for a new selection.
  useEffect(() => {
    if (!open) return;
    // Drop any lingering reader selection so the mobile OS selection
    // toolbar (Translate/Copy/search) dismisses instead of overlaying us.
    window.getSelection()?.removeAllRanges();
    setExcerpt(normalizeExcerpt(initialExcerpt));
    setTemplate(initialTemplate ?? "classic-paper");
    setEcho(initialEcho ?? "");
    setSavedId(null);
    setPublished(false);
    setError(null);
    setNotice(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open ]);

  // Preview = the export-resolution canvas itself, shown scaled (spike rule).
  useEffect(() => {
    if (!open || !canvasRef.current) return;
    let cancelled = false;
    const attr = keepsakeAttribution(story, locale);
    renderKeepsakeCard(canvasRef.current, { excerpt, title: attr.title, author: attr.author, template })
      .then((r) => {
        if (!cancelled) setTrimmed(r.trimmed);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [open, excerpt, template, story, locale]);

  const filename = `golponeer-keepsake-${slugify(filenameBase).slice(0, 40) || "story"}.png`;

  const stashAndSignIn = () => {
    const pending: PendingKeepsake = {
      storyId: story.id,
      chapterId,
      excerpt,
      template,
      echo,
      returnTo,
    };
    try {
      sessionStorage.setItem(PENDING_KEEP_KEY, JSON.stringify(pending));
    } catch {
      /* private mode — sign-in still works, the draft just won't restore */
    }
    navigate(`/login?next=${encodeURIComponent(returnTo)}`);
  };

  const save = async (): Promise<string> => {
    // Edits after "Save privately" used to be silently dropped (the
    // short-circuit returned the old id without writing anything).
    if (savedId) {
      const echoValue = echo.trim() ? echo.trim() : null;
      await dp.updateKeepsake(savedId, {
        excerpt,
        template,
        echo: echoValue,
        // Clearing the echo also clears its public flag (same rule as
        // the viewer's echo editor), so a later echo can't go public
        // on its own.
        ...(echoValue ? {} : { echo_public: false }),
      });
      setNotice(t("keepsakes", "saved"));
      queryClient.invalidateQueries({ queryKey: ["keepsakes"] });
      queryClient.invalidateQueries({ queryKey: ["public-keepsakes"] });
      queryClient.invalidateQueries({ queryKey: ["public-keepsake"] });
      return savedId;
    }
    const k = await dp.createKeepsake({
      storyId: story.id,
      chapterId,
      excerpt,
      template,
      echo: echo.trim() ? echo : null,
    });
    setSavedId(k.id);
    setNotice(t("keepsakes", "saved"));
    queryClient.invalidateQueries({ queryKey: ["keepsakes"] });
    return k.id;
  };

  const onSave = async () => {
    if (!session) {
      stashAndSignIn();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await save();
    } catch (e) {
      setError(e instanceof AppError ? t("errors", e.code) : t("errors", "generic"));
    } finally {
      setBusy(false);
    }
  };

  const onPublish = async () => {
    if (!session) {
      stashAndSignIn();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const id = await save();
      await dp.publishKeepsake(id);
      setPublished(true);
      queryClient.invalidateQueries({ queryKey: ["keepsakes"] });
      queryClient.invalidateQueries({ queryKey: ["public-keepsakes"] });
      queryClient.invalidateQueries({ queryKey: ["public-keepsake"] });
    } catch (e) {
      // Private save stands even when publishing is refused (K2).
      setError(e instanceof AppError ? t("errors", e.code) : t("errors", "generic"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={t("keepsakes", "title")}>
      <div className="max-h-[80vh] overflow-y-auto pr-1">
        <label className="text-sm font-medium" htmlFor="qs-excerpt">
          {t("keepsakes", "excerptLabel")} · {excerpt.length} / 1000 {t("keepsakes", "chars")}
        </label>
        <Textarea
          id="qs-excerpt"
          rows={4}
          value={excerpt}
          onChange={(e) => setExcerpt(normalizeExcerpt(e.target.value))}
          className="mt-1"
        />
        {trimmed && <p className="mt-1 text-xs text-ink-faint">{t("keepsakes", "trimmedNote")}</p>}

        <p className="mt-4 text-sm font-medium">{t("keepsakes", "templateLabel")}</p>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {KEEPSAKE_TEMPLATES.map((tpl) => {
            const pal = CARD_TEMPLATES[tpl];
            const active = tpl === template;
            return (
              <button
                key={tpl}
                onClick={() => setTemplate(tpl)}
                aria-pressed={active}
                className={`rounded-xl border-2 px-2 py-2 text-left text-xs font-medium ${
                  active ? "border-river" : "border-ink/10"
                }`}
                style={{ background: pal.bg, color: pal.ink }}
              >
                <span
                  className="mb-1 block h-3 w-3 rounded-full"
                  style={{ background: pal.accent }}
                  aria-hidden
                />
                {t("keepsakes", TEMPLATE_I18N[tpl])}
              </button>
            );
          })}
        </div>

        <canvas
          ref={canvasRef}
          className="mt-4 w-full rounded-xl shadow-card"
          aria-label={t("keepsakes", "title")}
        />

        <label className="mt-4 block text-sm font-medium" htmlFor="qs-echo">
          {t("keepsakes", "echoLabel")}
        </label>
        <Textarea
          id="qs-echo"
          rows={2}
          value={echo}
          onChange={(e) => setEcho(e.target.value)}
          placeholder={t("keepsakes", "echoPlaceholder")}
          className="mt-1"
        />

        {!session && <p className="mt-3 text-sm text-ink-soft">{t("keepsakes", "signInToSave")}</p>}
        {notice && <p className="mt-3 text-sm font-medium text-river">{notice}</p>}
        <FieldError message={error} />

        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={() => downloadKeepsakePNG(canvasRef.current!, filename)}>
            {t("keepsakes", "download")}
          </Button>
          <Button variant="secondary" onClick={onSave} disabled={busy || !excerpt}>
            {savedId ? t("keepsakes", "saved") : t("keepsakes", "savePrivate")}
          </Button>
          <Button variant="ghost" onClick={onPublish} disabled={busy || !excerpt || published}>
            {published ? t("keepsakes", "published") : t("keepsakes", "publish")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
