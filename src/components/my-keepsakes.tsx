import { useEffect, useState, type KeyboardEvent } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useApp } from "../lib/app-context";
import { AppError } from "../lib/utils";
import type { Keepsake } from "../lib/types";
import { CARD_TEMPLATES, downloadKeepsakePNG, keepsakeAttribution, renderKeepsakeCard } from "../lib/keepsake-card";
import { ButtonLink, EmptyState, Spinner } from "./ui";
import { KeepsakeViewer } from "./keepsake-viewer";

/**
 * My Keepsakes, shared by the Library page and /library/keepsakes.
 *
 * Both lists follow the redesigned public-shelf card: the quote and
 * the echo ARE the card, then one quiet footer under a hairline —
 * source line, plus the owner's own visibility · template line (the
 * public card's keeper line is omitted here: the keeper is you).
 * Tapping a card opens the full-card viewer, not the public page;
 * the public-page link stays as a row for published keepsakes.
 * The Library strip keeps its 120-char trim; the full list uses 240.
 * Actions live in the viewer only, so both lists stay as clean as
 * the homepage strip and the shelf. The viewer shows the rendered
 * card (which already carries passage + attribution) followed by
 * the echo itself — no duplicated text below — plus an opt-in
 * "include echo" download.
 */
export function MyKeepsakesSection({ limit }: { limit?: number }) {
  const { t, dp, session, locale } = useApp();
  const queryClient = useQueryClient();
  const [keepsakeBusy, setKeepsakeBusy] = useState(false);
  const [keepsakeError, setKeepsakeError] = useState<{ id: string; message: string } | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const keepsakesQuery = useQuery({
    queryKey: ["keepsakes", "mine"],
    queryFn: () => dp.listMyKeepsakes(),
    enabled: !!session,
  });

  const data = keepsakesQuery.data ?? [];
  const selected = data.find((k) => k.id === selectedId) ?? null;
  useEffect(() => {
    if (selectedId && keepsakesQuery.data && !selected) setSelectedId(null);
  }, [selectedId, keepsakesQuery.data, selected]);

  /** Re-render a saved keepsake's card offscreen and download it (K6).
   *  With withEcho, the owner's echo is drawn under the passage. */
  const redownload = async (k: Keepsake, withEcho = false) => {
    const canvas = document.createElement("canvas");
    // Same attribution as the on-screen card (V4-28): a classic is
    // credited to its original author, not the publishing account.
    // (M6 finding: redownload used source_author_name raw, so a
    // downloaded classic PNG credited the publisher instead.)
    const attr = keepsakeAttribution(
      {
        title: k.source_title,
        author: { display_name: k.source_author_name },
        original_author: k.source_original_author,
        translator_name: k.source_translator_name,
        adapter_name: k.source_adapter_name,
      },
      locale
    );
    await renderKeepsakeCard(canvas, {
      excerpt: k.excerpt,
      title: attr.title,
      author: attr.author,
      template: k.template,
      echo: withEcho ? k.echo : undefined,
    });
    downloadKeepsakePNG(canvas, `golponeer-keepsake-${k.id.slice(0, 8)}.png`);
  };

  const publishKeepsake = async (k: Keepsake) => {
    setKeepsakeBusy(true);
    setKeepsakeError(null);
    try {
      await dp.publishKeepsake(k.id);
      queryClient.invalidateQueries({ queryKey: ["keepsakes"] });
      queryClient.invalidateQueries({ queryKey: ["public-keepsakes"] });
      queryClient.invalidateQueries({ queryKey: ["public-keepsake"] });
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
      queryClient.invalidateQueries({ queryKey: ["public-keepsakes"] });
      queryClient.invalidateQueries({ queryKey: ["public-keepsake"] });
    } catch (e) {
      setKeepsakeError({ id: k.id, message: e instanceof AppError ? t("errors", e.code) : t("errors", "generic") });
    } finally {
      setKeepsakeBusy(false);
    }
  };

  const deleteKeepsake = async (k: Keepsake) => {
    setKeepsakeBusy(true);
    setKeepsakeError(null);
    try {
      await dp.deleteKeepsake(k.id);
      queryClient.invalidateQueries({ queryKey: ["keepsakes"] });
      queryClient.invalidateQueries({ queryKey: ["public-keepsakes"] });
      queryClient.invalidateQueries({ queryKey: ["public-keepsake"] });
    } catch (e) {
      setKeepsakeError({ id: k.id, message: e instanceof AppError ? t("errors", e.code) : t("errors", "generic") });
    } finally {
      setKeepsakeBusy(false);
    }
  };

  /** Echoes are private by default; the owner may share one publicly
   *  with the viewer toggle. Clearing the echo also clears the flag,
   *  so a later echo does not go public on its own. */
  const saveEcho = async (k: Keepsake, draft: string) => {
    setKeepsakeBusy(true);
    setKeepsakeError(null);
    try {
      const echo = draft.trim() ? draft.trim() : null;
      await dp.updateKeepsake(k.id, echo ? { echo } : { echo: null, echo_public: false });
      queryClient.invalidateQueries({ queryKey: ["keepsakes"] });
      queryClient.invalidateQueries({ queryKey: ["public-keepsakes"] });
      queryClient.invalidateQueries({ queryKey: ["public-keepsake"] });
    } catch (e) {
      setKeepsakeError({ id: k.id, message: e instanceof AppError ? t("errors", e.code) : t("errors", "generic") });
      throw e;
    } finally {
      setKeepsakeBusy(false);
    }
  };

  /** Per-keepsake opt-in: share this keepsake's echo on its public
   *  page and shelf card (the projection shows it only when true). */
  const toggleEchoPublic = async (k: Keepsake, value: boolean) => {
    setKeepsakeBusy(true);
    setKeepsakeError(null);
    try {
      await dp.updateKeepsake(k.id, { echo_public: value });
      queryClient.invalidateQueries({ queryKey: ["keepsakes"] });
      queryClient.invalidateQueries({ queryKey: ["public-keepsakes"] });
      queryClient.invalidateQueries({ queryKey: ["public-keepsake"] });
    } catch (e) {
      setKeepsakeError({ id: k.id, message: e instanceof AppError ? t("errors", e.code) : t("errors", "generic") });
    } finally {
      setKeepsakeBusy(false);
    }
  };

  const templateLabel = (k: Keepsake) =>
    t("keepsakes", `template${k.template.split("-").map((w) => w[0].toUpperCase() + w.slice(1)).join("")}`);
  const visibilityLabel = (k: Keepsake) =>
    k.visibility === "public" ? t("keepsakes", "publicBadge") : t("keepsakes", "privateBadge");
  const openCard = (k: Keepsake) => ({
    "data-testid": "keepsake-card",
    role: "button" as const,
    tabIndex: 0,
    onClick: () => setSelectedId(k.id),
    onKeyDown: (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        setSelectedId(k.id);
      }
    },
  });

  return (
    <section className={limit ? "mt-10" : "mx-auto mt-10 max-w-2xl"}>
      <h2 className="font-serif text-xl font-bold">{t("keepsakes", "myKeepsakes")}</h2>
      <div className="mb-4 mt-2 h-0.5 w-10 bg-gold" />
      {keepsakesQuery.isLoading ? (
        <Spinner />
      ) : data.length ? (
        limit ? (
          <>
            <div className="shelf-scroll flex gap-4 overflow-x-auto pb-2 sm:grid sm:grid-cols-3 sm:overflow-visible">
              {data.slice(0, limit).map((k) => {
                const tpl = CARD_TEMPLATES[k.template];
                const attr = keepsakeAttribution(
                  {
                    title: k.source_title,
                    author: { display_name: k.source_author_name },
                    original_author: k.source_original_author,
                    translator_name: k.source_translator_name,
                    adapter_name: k.source_adapter_name,
                  },
                  locale
                );
                const excerpt = k.excerpt.length > 120 ? k.excerpt.slice(0, 120).trimEnd() + "…" : k.excerpt;
                return (
                  <div
                    key={k.id}
                    {...openCard(k)}
                    className="w-64 shrink-0 cursor-pointer sm:w-auto"
                  >
                    <div
                      className="h-full min-w-0 rounded-xl p-5 shadow-card transition hover:-translate-y-0.5 hover:shadow-lg sm:p-6"
                      style={{ backgroundColor: tpl.bg, color: tpl.ink }}
                    >
                      <p className="whitespace-pre-line break-words font-serif text-lg leading-relaxed sm:text-xl">
                        “{excerpt}”
                      </p>
                      {k.echo && (
                        <p
                          className="mt-4 whitespace-pre-line break-words border-l-2 pl-3 font-serif text-base italic leading-relaxed"
                          style={{ borderColor: tpl.accent, color: tpl.faint }}
                        >
                          {k.echo}
                        </p>
                      )}
                      <div className="mt-5 pt-3" style={{ borderTop: `1px solid ${tpl.rule}` }}>
                        <p className="break-words text-sm" style={{ color: tpl.faint }}>
                          {attr.title ? `${attr.title} · ${attr.author}` : attr.author}
                        </p>
                        <p className="mt-1 text-xs" style={{ color: tpl.faint }}>
                          {visibilityLabel(k)} · {templateLabel(k)}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            {data.length > limit && (
              <div className="mt-4 text-center">
                <ButtonLink to="/library/keepsakes" variant="secondary" size="sm">
                  {t("keepsakes", "showAll")}
                </ButtonLink>
              </div>
            )}
          </>
        ) : (
          <div className="mt-6 flex flex-col gap-4">
            {data.map((k) => {
              const tpl = CARD_TEMPLATES[k.template];
              const attr = keepsakeAttribution(
                {
                  title: k.source_title,
                  author: { display_name: k.source_author_name },
                  original_author: k.source_original_author,
                  translator_name: k.source_translator_name,
                  adapter_name: k.source_adapter_name,
                },
                locale
              );
              const excerpt = k.excerpt.length > 240 ? k.excerpt.slice(0, 240).trimEnd() + "…" : k.excerpt;
              return (
                <div
                  key={k.id}
                  {...openCard(k)}
                  className="min-w-0 cursor-pointer rounded-xl p-5 shadow-card transition hover:-translate-y-0.5 hover:shadow-lg sm:p-6"
                  style={{ backgroundColor: tpl.bg, color: tpl.ink }}
                >
                  <p className="whitespace-pre-line break-words font-serif text-lg leading-relaxed sm:text-xl">
                    “{excerpt}”
                  </p>
                  {k.echo && (
                    <p
                      className="mt-4 whitespace-pre-line break-words border-l-2 pl-3 font-serif text-base italic leading-relaxed"
                      style={{ borderColor: tpl.accent, color: tpl.faint }}
                    >
                      {k.echo}
                    </p>
                  )}
                  <div className="mt-5 pt-3" style={{ borderTop: `1px solid ${tpl.rule}` }}>
                    <p className="break-words text-sm" style={{ color: tpl.faint }}>
                      {attr.title ? `${attr.title} · ${attr.author}` : attr.author}
                    </p>
                    <p className="mt-1 text-sm" style={{ color: tpl.faint }}>
                      {visibilityLabel(k)} · {templateLabel(k)}
                    </p>
                    {k.slug && (
                      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                        <Link
                          to={`/k/${k.slug}`}
                          onClick={(e) => e.stopPropagation()}
                          className="font-medium hover:underline"
                          style={{ color: tpl.accent }}
                        >
                          {t("keepsakes", "viewPublicPage")}
                        </Link>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )
      ) : (
        <EmptyState
          title={t("keepsakes", "empty")}
          action={
            <ButtonLink to="/discover" variant="secondary">
              {t("discover", "title")}
            </ButtonLink>
          }
        />
      )}
      {selected && (
        <KeepsakeViewer
          key={selected.id}
          keepsake={selected}
          busy={keepsakeBusy}
          error={keepsakeError?.id === selected.id ? keepsakeError.message : null}
          onClose={() => setSelectedId(null)}
          onDownload={redownload}
          onPublish={publishKeepsake}
          onUnpublish={unpublishKeepsake}
          onDelete={deleteKeepsake}
          onSaveEcho={saveEcho}
          onToggleEchoPublic={toggleEchoPublic}
        />
      )}
    </section>
  );
}
