import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useApp } from "../lib/app-context";
import { AppError } from "../lib/utils";
import type { Keepsake } from "../lib/types";
import { CARD_TEMPLATES, downloadKeepsakePNG, renderKeepsakeCard } from "../lib/keepsake-card";
import { Button, ButtonLink, EmptyState, Spinner } from "./ui";

/**
 * My Keepsakes, shared by the Library page (capped, with a link to the
 * dedicated page) and /library/keepsakes (uncapped). One component, so
 * the cards, echo editing, publish/unpublish/delete and downloads
 * behave identically in both places.
 */
export function MyKeepsakesSection({ limit }: { limit?: number }) {
  const { t, dp, session } = useApp();
  const queryClient = useQueryClient();
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [keepsakeBusy, setKeepsakeBusy] = useState(false);
  const [keepsakeError, setKeepsakeError] = useState<{ id: string; message: string } | null>(null);
  const [echoEditId, setEchoEditId] = useState<string | null>(null);
  const [expandedEchoId, setExpandedEchoId] = useState<string | null>(null);
  const [echoDraft, setEchoDraft] = useState("");
  const [expandedExcerptId, setExpandedExcerptId] = useState<string | null>(null);

  const keepsakesQuery = useQuery({
    queryKey: ["keepsakes", "mine"],
    queryFn: () => dp.listMyKeepsakes(),
    enabled: !!session,
  });

  /** Re-render a saved keepsake's card offscreen and download it (K6). */
  const redownload = async (k: Keepsake) => {
    const canvas = document.createElement("canvas");
    await renderKeepsakeCard(canvas, {
      excerpt: k.excerpt,
      title: k.source_title,
      author: k.source_author_name,
      template: k.template,
    });
    downloadKeepsakePNG(canvas, `golponeer-keepsake-${k.id.slice(0, 8)}.png`);
  };

  const publishKeepsake = async (k: Keepsake) => {
    setKeepsakeBusy(true);
    setKeepsakeError(null);
    try {
      await dp.publishKeepsake(k.id);
      queryClient.invalidateQueries({ queryKey: ["keepsakes"] });
    } catch (e) {
      setKeepsakeError({ id: k.id, message: e instanceof AppError ? t("errors", e.code) : t("errors", "generic") });
    } finally {
      setKeepsakeBusy(false);
    }
  };

  const unpublishKeepsake = async (k: Keepsake) => {
    setKeepsakeBusy(true);
    setKeepsakeError(null);
    try {
      await dp.unpublishKeepsake(k.id);
      queryClient.invalidateQueries({ queryKey: ["keepsakes"] });
    } catch (e) {
      setKeepsakeError({ id: k.id, message: e instanceof AppError ? t("errors", e.code) : t("errors", "generic") });
    } finally {
      setKeepsakeBusy(false);
    }
  };

  const deleteKeepsake = async (k: Keepsake) => {
    if (confirmDeleteId !== k.id) {
      setConfirmDeleteId(k.id);
      return;
    }
    setConfirmDeleteId(null);
    setKeepsakeBusy(true);
    try {
      await dp.deleteKeepsake(k.id);
      queryClient.invalidateQueries({ queryKey: ["keepsakes"] });
    } catch (e) {
      setKeepsakeError({ id: k.id, message: e instanceof AppError ? t("errors", e.code) : t("errors", "generic") });
    } finally {
      setKeepsakeBusy(false);
    }
  };

  /** Echoes are private notes: shown only to their owner, in this list. */
  const saveEcho = async (k: Keepsake) => {
    setKeepsakeBusy(true);
    setKeepsakeError(null);
    try {
      await dp.updateKeepsake(k.id, { echo: echoDraft.trim() ? echoDraft.trim() : null });
      setEchoEditId(null);
      queryClient.invalidateQueries({ queryKey: ["keepsakes"] });
    } catch (e) {
      setKeepsakeError({ id: k.id, message: e instanceof AppError ? t("errors", e.code) : t("errors", "generic") });
    } finally {
      setKeepsakeBusy(false);
    }
  };

  return (
        <section className="mt-10">
          <h2 className="mb-4 font-serif text-xl font-bold">{t("keepsakes", "myKeepsakes")}</h2>
          {keepsakesQuery.isLoading ? <Spinner /> : keepsakesQuery.data?.length ? (
            <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {(limit ? keepsakesQuery.data.slice(0, limit) : keepsakesQuery.data).map((k) => {
                const tpl = CARD_TEMPLATES[k.template];
                return (
                <div
                  key={k.id}
                  className="flex min-w-0 flex-col rounded-xl p-4 shadow-card"
                  style={{ backgroundColor: tpl.bg, color: tpl.ink }}
                >
                  <p aria-hidden className="font-serif text-lg leading-none" style={{ color: tpl.accent }}>❦</p>
                  <p className={`mt-2 whitespace-pre-line break-words font-serif text-base leading-relaxed ${expandedExcerptId === k.id || k.excerpt.length <= 160 ? "" : "line-clamp-4"}`}>
                    {expandedExcerptId === k.id || k.excerpt.length <= 160
                      ? k.excerpt
                      : k.excerpt.slice(0, 160) + "…"}
                  </p>
                  {k.excerpt.length > 160 && (
                    <button
                      type="button"
                      className="mt-1 text-sm font-medium hover:underline"
                      style={{ color: tpl.accent }}
                      onClick={() => setExpandedExcerptId(expandedExcerptId === k.id ? null : k.id)}
                    >
                      {expandedExcerptId === k.id ? t("keepsakes", "showLess") : t("keepsakes", "showMore")}
                    </button>
                  )}
                  <p className="mt-3 truncate text-sm" style={{ color: tpl.faint }}>
                    {t("keepsakes", "sourceLabel")}: {k.source_title} · {k.source_author_name}
                  </p>
                  <p className="mt-1 text-xs" style={{ color: tpl.faint }}>
                    {t("keepsakes", `template${k.template.split("-").map((w) => w[0].toUpperCase() + w.slice(1)).join("")}`)}
                    {" · "}
                    {k.visibility === "public" ? t("keepsakes", "publicBadge") : t("keepsakes", "privateBadge")}
                  </p>
                  {keepsakeError?.id === k.id && <p className="mt-2 text-sm text-clay">{keepsakeError.message}</p>}
                  {echoEditId === k.id ? (
                    <div className="mt-3">
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
                        <Button size="sm" onClick={() => saveEcho(k)} disabled={keepsakeBusy}>
                          {t("keepsakes", "saveEcho")}
                        </Button>
                        <Button size="sm" variant="ghost" className="hover:!bg-black/5" style={{ color: tpl.ink }} onClick={() => setEchoEditId(null)}>
                          {t("keepsakes", "cancelEcho")}
                        </Button>
                      </div>
                    </div>
                  ) : k.echo ? (
                    <>
                      <p className="mt-3 whitespace-pre-line break-words border-l-2 pl-3 text-sm italic" style={{ borderColor: tpl.accent, color: tpl.faint }}>
                        {expandedEchoId === k.id || k.echo.length <= 100
                          ? k.echo
                          : k.echo.slice(0, 100) + "…"}
                      </p>
                      {k.echo.length > 100 && (
                        <button
                          type="button"
                          className="mt-1 text-sm font-medium hover:underline"
                          style={{ color: tpl.accent }}
                          onClick={() => setExpandedEchoId(expandedEchoId === k.id ? null : k.id)}
                        >
                          {expandedEchoId === k.id ? t("keepsakes", "showLess") : t("keepsakes", "showMore")}
                        </button>
                      )}
                    </>
                  ) : null}
                  <div className="mt-auto flex flex-wrap gap-2 pt-3">
                    <Button size="sm" variant="secondary" onClick={() => redownload(k)}>
                      {t("keepsakes", "downloadAgain")}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="hover:!bg-black/5"
                      style={{ color: tpl.ink }}
                      onClick={() => { setEchoEditId(k.id); setEchoDraft(k.echo ?? ""); }}
                    >
                      {k.echo ? t("keepsakes", "editEcho") : t("keepsakes", "addEcho")}
                    </Button>
                    {k.visibility !== "public" && (
                      <Button size="sm" variant="ghost" className="hover:!bg-black/5" style={{ color: tpl.ink }} onClick={() => publishKeepsake(k)} disabled={keepsakeBusy}>
                        {t("keepsakes", "publish")}
                      </Button>
                    )}
                    {k.visibility === "public" && (
                      <>
                        {k.slug && (
                          <Link to={`/k/${k.slug}`}>
                            <Button size="sm" variant="ghost" className="hover:!bg-black/5" style={{ color: tpl.ink }}>{t("keepsakes", "viewPublicPage")}</Button>
                          </Link>
                        )}
                        <Button size="sm" variant="ghost" className="hover:!bg-black/5" style={{ color: tpl.ink }} onClick={() => unpublishKeepsake(k)} disabled={keepsakeBusy}>
                          {t("keepsakes", "unpublish")}
                        </Button>
                      </>
                    )}
                    <Button
                      size="sm"
                      variant={confirmDeleteId === k.id ? "danger" : "ghost"}
                      className={confirmDeleteId === k.id ? "" : "hover:!bg-black/5"}
                      style={confirmDeleteId === k.id ? undefined : { color: tpl.ink }}
                      onClick={() => deleteKeepsake(k)}
                      disabled={keepsakeBusy}
                    >
                      {confirmDeleteId === k.id ? t("keepsakes", "deleteConfirm") : t("keepsakes", "delete")}
                    </Button>
                  </div>
                </div>
                );
              })}
            </div>
            {limit && keepsakesQuery.data.length > limit && (
              <div className="mt-4 text-center">
                <ButtonLink to="/library/keepsakes" variant="secondary" size="sm">
                  {t("keepsakes", "showAll")}
                </ButtonLink>
              </div>
            )}
            </>
          ) : (
            <EmptyState title={t("keepsakes", "empty")} action={<ButtonLink to="/discover" variant="secondary">{t("discover", "title")}</ButtonLink>} />
          )}
        </section>

  );
}
