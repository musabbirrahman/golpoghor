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
 * publish/unpublish, echo editing, delete.
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
}: {
  keepsake: Keepsake;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onDownload: (k: Keepsake) => void;
  onPublish: (k: Keepsake) => void;
  onUnpublish: (k: Keepsake) => void;
  onDelete: (k: Keepsake) => void;
  onSaveEcho: (k: Keepsake, draft: string) => Promise<void>;
}) {
  const { t, locale } = useApp();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [echoEdit, setEchoEdit] = useState(false);
  const [echoDraft, setEchoDraft] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
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

  const templateLabel = t(
    "keepsakes",
    `template${keepsake.template.split("-").map((w) => w[0].toUpperCase() + w.slice(1)).join("")}`
  );

  return (
    <Modal open onClose={onClose} title={t("keepsakes", "title")}>
      <div className="max-h-[75vh] overflow-y-auto px-1">
        <canvas ref={canvasRef} className="w-full rounded-xl shadow-card" aria-label={t("keepsakes", "title")} />
        <p className="mt-4 whitespace-pre-line break-words font-serif text-base leading-relaxed">
          “{keepsake.excerpt}”
        </p>
        <p className="mt-3 break-words text-sm text-ink-faint">
          {attr.title} · {attr.author}
        </p>
        <p className="mt-1 text-xs text-ink-faint">
          {templateLabel} ·{" "}
          {keepsake.visibility === "public" ? t("keepsakes", "publicBadge") : t("keepsakes", "privateBadge")}
        </p>
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
            <p
              className="whitespace-pre-line break-words border-l-2 pl-3 text-sm italic"
              style={{ borderColor: tpl.accent, color: tpl.faint }}
            >
              {keepsake.echo}
            </p>
            <Button
              size="sm"
              variant="ghost"
              className="mt-2"
              onClick={() => {
                setEchoEdit(true);
                setEchoDraft(keepsake.echo ?? "");
              }}
            >
              {t("keepsakes", "editEcho")}
            </Button>
          </div>
        ) : (
          <Button
            size="sm"
            variant="ghost"
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
        <div className="mt-4 flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={() => onDownload(keepsake)}>
            {t("keepsakes", "downloadAgain")}
          </Button>
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
