import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useApp } from "../lib/app-context";
import { CARD_TEMPLATES, keepsakeAttribution } from "../lib/keepsake-card";
import { Button, EmptyState, Spinner } from "../components/ui";
import { Layout } from "../components/layout";
import { StandaloneKeepsake } from "../components/standalone-keepsake";

/**
 * Public Keepsakes shelf (27c follow-up). Reads ONLY the restricted
 * projection — the same rows the /k/:slug pages serve — so an
 * unpublished / restricted / source-hidden Keepsake never appears here.
 * Cards are text previews; the full rendered card lives on the /k/ page.
 */
export function KeepsakesShelfPage() {
  const { t, dp, locale } = useApp();
  const navigate = useNavigate();
  const [makerOpen, setMakerOpen] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ["public-keepsakes"],
    queryFn: () => dp.listPublicKeepsakes(),
  });

  if (isLoading) return <Layout><Spinner /></Layout>;
  const rows = [...(data ?? [])].sort((a, b) =>
    (b.published_at ?? "").localeCompare(a.published_at ?? ""));
  if (rows.length === 0) {
    return (
      <Layout>
        <div className="mx-auto max-w-2xl">
          <h1 className="font-serif text-3xl font-bold sm:text-4xl">{t("keepsakes", "shelfTitle")}</h1>
          <div className="mt-2 h-0.5 w-10 bg-gold" />
          <p className="mt-2 text-sm text-ink-soft">{t("keepsakes", "shelfSubtitle")}</p>
          <div className="mt-4">
            <Button variant="secondary" onClick={() => setMakerOpen(true)}>
              {t("keepsakes", "makeOwn")}
            </Button>
          </div>
          <div className="mt-6">
            <EmptyState title={t("keepsakes", "shelfEmpty")} />
          </div>
        </div>
        <StandaloneKeepsake open={makerOpen} onClose={() => setMakerOpen(false)} />
      </Layout>
    );
  }

  return (
    <Layout>
    <div className="mx-auto max-w-2xl">
      <h1 className="font-serif text-3xl font-bold sm:text-4xl">{t("keepsakes", "shelfTitle")}</h1>
      <div className="mt-2 h-0.5 w-10 bg-gold" />
      <p className="mt-2 text-sm text-ink-soft">{t("keepsakes", "shelfSubtitle")}</p>
      <div className="mt-4">
        <Button variant="secondary" onClick={() => setMakerOpen(true)}>
          {t("keepsakes", "makeOwn")}
        </Button>
      </div>
      <div className="mt-6 flex flex-col gap-4">
        {rows.map((k) => {
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
          const tpl = CARD_TEMPLATES[k.template];
          const excerpt = k.excerpt.length > 240 ? k.excerpt.slice(0, 240).trimEnd() + "…" : k.excerpt;
          // Shelf card, redesigned: the quote and the echo ARE the card.
          // Everything else is one quiet source line for credit — no
          // keeper line, no link row, no template label. Tapping the
          // card opens the full /k/ page, where the keeper, story link
          // and actions live.
          return (
            <div
              key={k.id}
              role="button"
              tabIndex={0}
              onClick={() => navigate(`/k/${k.slug}`)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  navigate(`/k/${k.slug}`);
                }
              }}
              className="min-w-0 cursor-pointer rounded-xl p-5 shadow-card transition hover:-translate-y-0.5 hover:shadow-lg sm:p-6"
              style={{ backgroundColor: tpl.bg, color: tpl.ink }}
            >
              <p className="whitespace-pre-line break-words font-serif text-lg leading-relaxed sm:text-xl">“{excerpt}”</p>
              {k.echo && (
                <p className="mt-4 whitespace-pre-line break-words border-l-2 pl-3 font-serif text-base italic leading-relaxed" style={{ borderColor: tpl.accent, color: tpl.faint }}>{k.echo}</p>
              )}
              <div className="mt-5 pt-3" style={{ borderTop: `1px solid ${tpl.rule}` }}>
                <p className="break-words text-sm" style={{ color: tpl.faint }}>
                  {attr.title ? `${attr.title} · ${attr.author}` : attr.author}
                </p>
                {/* Small keeper line, in the footer — the card grows a
                    line for it instead of the quote/echo area shrinking. */}
                <p className="mt-1 text-xs" style={{ color: tpl.faint }}>
                  {t("keepsakes", "keptBy")} {k.keeper_name}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
    <StandaloneKeepsake open={makerOpen} onClose={() => setMakerOpen(false)} />
    </Layout>
  );
}
