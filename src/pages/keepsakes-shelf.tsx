import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useApp } from "../lib/app-context";
import { CARD_TEMPLATES, keepsakeAttribution } from "../lib/keepsake-card";
import { EmptyState, Spinner } from "../components/ui";
import type { KeepsakeTemplate } from "../lib/types";

const TEMPLATE_LABEL: Record<KeepsakeTemplate, "templateClassicPaper" | "templateMidnight" | "templateQuietGarden" | "templateOldLetters" | "templateModernInk" | "templateNeer"> = {
  "classic-paper": "templateClassicPaper",
  midnight: "templateMidnight",
  "quiet-garden": "templateQuietGarden",
  "old-letters": "templateOldLetters",
  "modern-ink": "templateModernInk",
  neer: "templateNeer",
};

/**
 * Public Keepsakes shelf (27c follow-up). Reads ONLY the restricted
 * projection — the same rows the /k/:slug pages serve — so an
 * unpublished / restricted / source-hidden Keepsake never appears here.
 * Cards are text previews; the full rendered card lives on the /k/ page.
 */
export function KeepsakesShelfPage() {
  const { t, dp, locale } = useApp();
  const { data, isLoading } = useQuery({
    queryKey: ["public-keepsakes"],
    queryFn: () => dp.listPublicKeepsakes(),
  });

  if (isLoading) return <Spinner />;
  const rows = [...(data ?? [])].sort((a, b) =>
    (b.published_at ?? "").localeCompare(a.published_at ?? ""));
  if (rows.length === 0) {
    return <EmptyState title={t("keepsakes", "shelfEmpty")} />;
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="font-serif text-3xl font-bold">{t("keepsakes", "shelfTitle")}</h1>
      <p className="mt-2 text-sm text-ink-soft">{t("keepsakes", "shelfSubtitle")}</p>
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
          return (
            <div
              key={k.id}
              className="rounded-xl p-5 shadow-card transition hover:-translate-y-0.5 hover:shadow-lg"
              style={{ backgroundColor: tpl.bg, color: tpl.ink }}
            >
              <p aria-hidden className="font-serif text-xl leading-none" style={{ color: tpl.accent }}>❦</p>
              <Link to={`/k/${k.slug}`} className="mt-2 block">
                <p className="whitespace-pre-line font-serif text-lg leading-relaxed">“{excerpt}”</p>
              </Link>
              <div className="mt-4 pt-3" style={{ borderTop: `1px solid ${tpl.rule}` }}>
                <p className="text-sm" style={{ color: tpl.faint }}>
                  {attr.title} · {attr.author}
                </p>
                <p className="mt-1 text-sm" style={{ color: tpl.faint }}>
                  {t("keepsakes", "keptBy")} {k.keeper_name}
                </p>
                {k.echo && (
                  <p className="mt-2 border-l-2 pl-3 text-sm italic" style={{ borderColor: tpl.accent, color: tpl.faint }}>{k.echo}</p>
                )}
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                  <Link to={`/k/${k.slug}`} className="font-medium hover:underline" style={{ color: tpl.accent }}>
                    {t("keepsakes", "viewPublicPage")}
                  </Link>
                  <Link to={`/stories/${k.source_author_username}/${k.source_slug}`} className="hover:underline" style={{ color: tpl.faint }}>
                    {t("keepsakes", "sourceLabel")}: {k.source_title}
                  </Link>
                  <span className="text-xs" style={{ color: tpl.faint }}>{t("keepsakes", TEMPLATE_LABEL[k.template])}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
