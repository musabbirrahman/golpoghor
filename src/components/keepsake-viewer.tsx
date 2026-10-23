import { useEffect, useRef, useState } from "react";
import { useApp } from "../lib/app-context";
import type { Keepsake } from "../lib/types";
import { CARD_TEMPLATES, keepsakeAttribution, renderKeepsakeCard } from "../lib/keepsake-card";
import { Button, ButtonLink, Modal } from "./ui";

/**
 * Full-card view for one of the owner's keepsakes, opened by tapping
 * a strip or shelf card — the private equivalent of the /k/ page.
 * Shows the rendered card canvas, the FULL excerpt and echo (no
 * truncation, no Show more/less), and every action: download,
 * publish/unpublish, echo editing, echo-public toggle, delete.
 */
export function KeepsakeViewer({
  keepsake,
  busy,
  error,
  onClose,
  onDownload,
  onPublish,
  onUnpublish,
  onDelete,
  onSaveEcho,
  onToggleEchoPublic,
}: {
  keepsake: Keepsake;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onDownload: (k: Keepsake, includeEcho: boolean) => void;
  onPublish: (k: Keepsake) => void;
  onUnpublish: (k: Keepsake) => void;
  onDelete: (k: Keepsake) => void;
  onSaveEcho: (k: Keepsake, draft: string) => Promise<void>;
  onToggleEchoPublic: (k: Keepsake, value: boolean) => Promise<void>;
}) {
  const { t, locale } = useApp();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [echoEdit, setEchoEdit] = useState(false);
  const [echoDraft, setEchoDraft] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Echo downloads are opt-in per tap (default off): an echo is a
  // private note, so it must never land on a shared image by accident.
  const [includeEcho, setIncludeEcho] = useState(false);
  const tpl = CARD_TEMPLATES[keepsake.template];
  const attr = keepsakeAttribution(
    {
      title: keepsake.source_title,
      author: { display_name: keepsake.source_author_name },
      original_author: keepsake.source_original_author,
      translator_name: keepsake.source_translator_name,
      adapter_name: keepsake.source_adapter_name,
    },
    locale
  );

  useEffect(() => {
    if (canvasRef.current) {
      renderKeepsakeCard(canvasRef.current, {
        excerpt: keepsake.excerpt,
        title: attr.title,
        author: attr.author,
        template: keepsake.template,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keepsake]);

  return (
    <Modal open onClose={onClose} title={t("keepsakes", "title")}>
      <div className="max-h-[75vh] overflow-y-auto px-1">
        <canvas ref={canvasRef} className="w-full rounded-xl shadow-card" aria-label={t("keepsakes", "title")} />
        {/* The canvas already carries the passage, title and author —
            repeating them below only buried the echo, so the echo is
            the first thing under the card now. */}
        {echoEdit ? (
          <div className="mt-4">
            <textarea
              aria-label={t("keepsakes", "echoLabel")}
              rows={3}
              maxLength={2000}
              className="w-full rounded-lg border border-sage-dark bg-white px-3 py-2 text-sm text-ink"
              value={echoDraft}
              onChange={(e) => setEchoDraft(e.target.value)}
              placeholder={t("keepsakes", "echoPlaceholder")}
            />
            <div className="mt-2 flex gap-2">
              <Button
                size="sm"
                disabled={busy}
                onClick={async () => {
                  try {
                    await onSaveEcho(keepsake, echoDraft);
                    setEchoEdit(false);
                  } catch {
                    // Error surfaces via the error prop; stay in edit mode.
                  }
                }}
              >
                {t("keepsakes", "saveEcho")}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEchoEdit(false)}>
                {t("keepsakes", "cancelEcho")}
              </Button>
            </div>
          </div>
        ) : keepsake.echo ? (
          <div className="mt-4">
            <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">
              {t("keepsakes", "echoHeading")}
            </p>
            <p
              className="mt-2 whitespace-pre-line break-words border-l-2 pl-3 font-serif text-base italic leading-relaxed"
              style={{ borderColor: tpl.accent }}
            >
              {keepsake.echo}
            </p>
            <Button
              size="sm"
              variant="secondary"
              className="mt-2"
              onClick={() => {
                setEchoEdit(true);
                setEchoDraft(keepsake.echo ?? "");
              }}
            >
              {t("keepsakes", "editEcho")}
            </Button>
            <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={keepsake.echo_public}
                disabled={busy}
                onChange={(e) => onToggleEchoPublic(keepsake, e.target.checked)}
              />
              {t("keepsakes", "shareEchoPublicly")}
            </label>
          </div>
        ) : (
          <Button
            size="sm"
            variant="secondary"
            className="mt-4"
            onClick={() => {
              setEchoEdit(true);
              setEchoDraft("");
            }}
          >
            {t("keepsakes", "addEcho")}
          </Button>
        )}
        {error && <p className="mt-3 text-sm text-clay">{error}</p>}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button size="sm" variant="secondary" onClick={() => onDownload(keepsake, includeEcho)}>
            {t("keepsakes", "downloadAgain")}
          </Button>
          {keepsake.echo && (
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={includeEcho}
                onChange={(e) => setIncludeEcho(e.target.checked)}
              />
              {t("keepsakes", "includeEchoOnCard")}
            </label>
          )}
          {keepsake.visibility !== "public" && (
            <Button size="sm" variant="ghost" onClick={() => onPublish(keepsake)} disabled={busy}>
              {t("keepsakes", "publish")}
            </Button>
          )}
          {keepsake.visibility === "public" && (
            <>
              {keepsake.slug && (
                <ButtonLink to={`/k/${keepsake.slug}`} variant="secondary" size="sm">
                  {t("keepsakes", "viewPublicPage")}
                </ButtonLink>
              )}
              <Button size="sm" variant="ghost" onClick={() => onUnpublish(keepsake)} disabled={busy}>
                {t("keepsakes", "unpublish")}
              </Button>
            </>
          )}
          <Button
            size="sm"
            variant={confirmDelete ? "danger" : "ghost"}
            disabled={busy}
            onClick={() => {
              if (confirmDelete) onDelete(keepsake);
              else setConfirmDelete(true);
            }}
          >
            {confirmDelete ? t("keepsakes", "deleteConfirm") : t("keepsakes", "delete")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
