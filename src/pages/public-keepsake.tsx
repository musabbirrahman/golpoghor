import { useEffect, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useApp } from "../lib/app-context";
import { renderKeepsakeCard, keepsakeAttribution, downloadKeepsakePNG } from "../lib/keepsake-card";
import { Card, Button } from "../components/ui";
import { ReportDialog } from "../components/report-dialog";

/**
 * Public Keepsake page (V4-27c). Reads ONLY the restricted projection:
 * if the row stops being served (unpublish / restrict / source hidden),
 * this page renders not-found on next load — nothing leaks about the
 * source, and nothing here touches the base keepsakes table.
 */
export function PublicKeepsakePage() {
  const { slug } = useParams<{ slug: string }>();
  const { t, dp, session, locale } = useApp();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [reportOpen, setReportOpen] = useState(false);

  const { data: k, isLoading } = useQuery({
    queryKey: ["public-keepsake", slug],
    queryFn: () => dp.getPublicKeepsake(slug ?? ""),
    enabled: !!slug,
  });

  useEffect(() => {
    if (!k || !canvasRef.current) return;
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
    renderKeepsakeCard(canvasRef.current, {
      excerpt: k.excerpt,
      title: attr.title,
      author: attr.author,
      template: k.template,
    }).catch(() => {});
  }, [k, locale]);

  if (isLoading) return <p className="text-sm text-ink-faint">{t("common", "loading")}</p>;
  if (!k) {
    return (
      <Card className="p-6 text-center">
        <p className="text-sm text-ink-soft">{t("keepsakes", "notFound")}</p>
        <Link to="/discover" className="mt-3 inline-block text-sm font-medium text-river hover:underline">
          {t("nav", "discover")}
        </Link>
      </Card>
    );
  }

  const download = () => {
    if (!canvasRef.current) return;
    downloadKeepsakePNG(canvasRef.current, `golponeer-keepsake-${k.slug}.png`);
  };

  return (
    <div className="mx-auto max-w-xl">
      <Card className="overflow-hidden p-0">
        <canvas ref={canvasRef} className="block w-full" />
      </Card>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" onClick={download}>
          {t("keepsakes", "download")}
        </Button>
        <Link to={`/stories/${k.source_author_username}/${k.source_slug}`}>
          <Button size="sm" variant="ghost">
            {t("keepsakes", "sourceLabel")}: {k.source_title}
          </Button>
        </Link>
        {session && (
          <Button size="sm" variant="ghost" onClick={() => setReportOpen(true)}>
            {t("keepsakes", "report")}
          </Button>
        )}
      </div>
      {k.echo && (
        <Card className="mt-4 border-l-4 border-l-gold p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
            {t("keepsakes", "echoPublicNote")}
          </p>
          <p className="mt-1 whitespace-pre-line text-sm italic text-ink-soft">{k.echo}</p>
        </Card>
      )}
      {reportOpen && (
        <ReportDialog
          open={reportOpen}
          targetType="keepsake"
          targetId={k.id}
          targetLabel={k.source_title}
          onClose={() => setReportOpen(false)}
        />
      )}
    </div>
  );
}
