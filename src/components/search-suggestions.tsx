import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useApp } from "../lib/app-context";
import { genreLabel } from "../lib/genres";
import { Cover, storyPath } from "./story-card";

/** Live suggestions under the header search bar. Stories come from the same
 *  `q` search as the full results page (title, summary, author, tags);
 *  authors match username/display name; genres match the majors currently
 *  in use. Tapping any row goes straight to its target; the empty row
 *  submits the form (full search). The parent owns visibility — this
 *  component only renders when the debounced query is long enough. */
export function SearchSuggestions({ query, onPick }: { query: string; onPick: () => void }) {
  const { t, locale, dp } = useApp();
  const term = query.trim();
  const enabled = term.length >= 2;

  const storiesQuery = useQuery({
    queryKey: ["search-suggest", "stories", term],
    queryFn: () => dp.listStories({ q: term, limit: 5 }),
    enabled,
  });
  const authorsQuery = useQuery({
    queryKey: ["search-suggest", "authors", term],
    queryFn: () => dp.searchAuthors(term),
    enabled,
  });
  const genresQuery = useQuery({ queryKey: ["genres"], queryFn: () => dp.listGenres() });

  if (!enabled) return null;
  const stories = storiesQuery.data?.stories ?? [];
  const authors = authorsQuery.data ?? [];
  const needle = term.toLowerCase();
  const genres = (genresQuery.data ?? []).filter(
    (g) => genreLabel(g, locale).toLowerCase().includes(needle) || g.toLowerCase().includes(needle),
  ).slice(0, 3);
  const settled = storiesQuery.isSuccess && authorsQuery.isSuccess;
  const empty = settled && stories.length === 0 && authors.length === 0 && genres.length === 0;
  if (!settled && stories.length === 0 && authors.length === 0) return null;

  const sectionLabel = "px-4 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-ink-faint";
  return (
    <div className="absolute inset-x-0 top-full z-50 mt-2 max-h-[70vh] overflow-y-auto rounded-xl border border-ink/10 bg-white pb-2 shadow-lift">
      {stories.length > 0 && (
        <>
          <p className={sectionLabel}>{t("discover", "suggestionsStories")}</p>
          {stories.map((s) => (
            <Link key={s.id} to={storyPath(s)} onClick={onPick} className="flex items-center gap-3 px-4 py-2 hover:bg-sage">
              <Cover story={s} className="aspect-[3/4] w-9 shrink-0 rounded" thumb />
              <span className="min-w-0">
                <span className="clamp-2 block text-sm font-medium leading-snug">{s.title}</span>
                <span className="block truncate text-xs text-ink-soft">{s.author?.display_name}</span>
              </span>
            </Link>
          ))}
        </>
      )}
      {authors.length > 0 && (
        <>
          <p className={sectionLabel}>{t("discover", "suggestionsAuthors")}</p>
          {authors.map((a) => (
            <Link key={a.id} to={`/authors/${a.username}`} onClick={onPick} className="flex items-center gap-3 px-4 py-2 hover:bg-sage">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-river text-sm font-semibold text-paper">
                {(a.display_name ?? "?").charAt(0).toUpperCase()}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{a.display_name}</span>
                <span className="block truncate text-xs text-ink-soft">@{a.username}</span>
              </span>
            </Link>
          ))}
        </>
      )}
      {genres.length > 0 && (
        <>
          <p className={sectionLabel}>{t("discover", "suggestionsGenres")}</p>
          {genres.map((g) => (
            <Link key={g} to={`/discover?genre=${encodeURIComponent(g)}`} onClick={onPick} className="block px-4 py-2 text-sm font-medium hover:bg-sage">
              #{genreLabel(g, locale)}
            </Link>
          ))}
        </>
      )}
      {empty && (
        <button type="submit" className="block w-full px-4 py-3 text-left text-sm text-ink-soft hover:bg-sage">
          {t("discover", "suggestionsEmpty")}
        </button>
      )}
    </div>
  );
}
