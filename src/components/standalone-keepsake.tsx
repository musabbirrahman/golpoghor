import { useEffect, useRef, useState } from "react";
import { useApp } from "../lib/app-context";
import { Button, Input, Modal, Textarea } from "./ui";
import { KEEPSAKE_TEMPLATES } from "../lib/data-provider";
import type { KeepsakeTemplate } from "../lib/types";
import {
  CARD_TEMPLATES,
  downloadKeepsakePNG,
  normalizeExcerpt,
  renderKeepsakeCard,
} from "../lib/keepsake-card";

const TEMPLATE_I18N: Record<KeepsakeTemplate, string> = {
  "classic-paper": "templateClassicPaper",
  midnight: "templateMidnight",
  "quiet-garden": "templateQuietGarden",
  "old-letters": "templateOldLetters",
  "modern-ink": "templateModernInk",
  neer: "templateNeer",
};

/**
 * Standalone keepsake maker, opened from the public shelf. No story,
 * no text selection: the reader writes their own words, picks a
 * design, and downloads the card. Download-only by design — a
 * story-less keepsake has no source to save under, so it never
 * enters the library or the shelf.
 */
export function StandaloneKeepsake({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { t, profile } = useApp();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [words, setWords] = useState("");
  const [title, setTitle] = useState("");
  const [template, setTemplate] = useState<KeepsakeTemplate>("classic-paper");
  const [trimmed, setTrimmed] = useState(false);

  // Fresh state every time the maker opens.
  useEffect(() => {
    if (!open) return;
    setWords("");
    setTitle("");
    setTemplate("classic-paper");
    setTrimmed(false);
  }, [open ]);

  // Preview = the export-resolution canvas itself, shown scaled.
  useEffect(() => {
    if (!open || !canvasRef.current) return;
    let cancelled = false;
    renderKeepsakeCard(canvasRef.current, {
      excerpt: words,
      title: title.trim(),
      author: profile?.display_name ?? "",
      template,
    })
      .then((r) => {
        if (!cancelled) setTrimmed(r.trimmed);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [open, words, title, template, profile?.display_name]);

  const download = () => {
    if (!canvasRef.current) return;
    downloadKeepsakePNG(canvasRef.current, "golponeer-my-keepsake.png");
  };

  return (
    <Modal open={open} onClose={onClose} title={t("keepsakes", "makeOwnTitle")}>
      <div className="max-h-[80vh] overflow-y-auto px-1">
        <label className="text-sm font-medium" htmlFor="own-words">
          {t("keepsakes", "ownWordsLabel")} · {words.length} / 1000 {t("keepsakes", "chars")}
        </label>
        <Textarea
          id="own-words"
          rows={4}
          value={words}
          onChange={(e) => setWords(normalizeExcerpt(e.target.value))}
          placeholder={t("keepsakes", "ownWordsPlaceholder")}
          className="mt-1"
        />
        {trimmed && <p className="mt-1 text-xs text-ink-faint">{t("keepsakes", "trimmedNote")}</p>}

        <label className="mt-4 block text-sm font-medium" htmlFor="own-title">
          {t("keepsakes", "ownTitleLabel")}
        </label>
        <Input
          id="own-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t("keepsakes", "ownTitlePlaceholder")}
          maxLength={200}
          className="mt-1"
        />

        <p className="mt-4 text-sm font-medium">{t("keepsakes", "templateLabel")}</p>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
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
          aria-label={t("keepsakes", "makeOwnTitle")}
        />

        <p className="mt-3 text-sm text-ink-soft">{t("keepsakes", "ownDownloadNote")}</p>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={download} disabled={!words.trim()}>
            {t("keepsakes", "download")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
