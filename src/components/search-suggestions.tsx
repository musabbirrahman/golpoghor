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
 *  component only renders when the debounced query is long enough.
 *  Keyboard: rows are focusable links/buttons, so ArrowDown from the
 *  input (handled in SearchBox) lands on the first row, and arrows
 *  move within the list; ArrowUp from the first row returns to the
 *  input, Escape closes the list and returns to the input. */
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
  // Arrow-key walk over the visible rows, in render order. Hidden rows
  // (a second, closed search form elsewhere on the page) are skipped:
  // focusing one would visibly do nothing.
  const onRowKeyDown = (e: React.KeyboardEvent) => {
    const el = e.currentTarget as HTMLElement;
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp" && e.key !== "Escape") return;
    e.preventDefault();
    const rows = Array.from(document.querySelectorAll<HTMLElement>("[data-suggest-row]")).filter(
      (r) => r.offsetParent !== null,
    );
    const idx = rows.indexOf(el);
    const input = el.closest("form")?.querySelector('input[type="search"]') as HTMLElement | null;
    if (e.key === "Escape") {
      onPick();
      input?.focus();
      return;
    }
    if (e.key === "ArrowDown" && idx >= 0 && idx + 1 < rows.length) rows[idx + 1].focus();
    if (e.key === "ArrowUp") {
      if (idx > 0) rows[idx - 1].focus();
      else input?.focus();
    }
  };
  return (
    <div className="absolute inset-x-0 top-full z-50 mt-2 max-h-[70vh] overflow-y-auto rounded-xl border border-ink/10 bg-white pb-2 shadow-lift">
      {stories.length > 0 && (
        <>
          <p className={sectionLabel}>{t("discover", "suggestionsStories")}</p>
          {stories.map((s) => (
            <Link key={s.id} to={storyPath(s)} onClick={onPick} data-suggest-row onKeyDown={onRowKeyDown} className="flex items-center gap-3 px-4 py-2 hover:bg-sage focus:bg-sage focus:outline-none">
              <Cover story={s} className="aspect-[3/4] w-9 shrink-0 rounded" thumb small />
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
            <Link key={a.id} to={`/authors/${a.username}`} onClick={onPick} data-suggest-row onKeyDown={onRowKeyDown} className="flex items-center gap-3 px-4 py-2 hover:bg-sage focus:bg-sage focus:outline-none">
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
            <Link key={g} to={`/discover?genre=${encodeURIComponent(g)}`} onClick={onPick} data-suggest-row onKeyDown={onRowKeyDown} className="block px-4 py-2 text-sm font-medium hover:bg-sage focus:bg-sage focus:outline-none">
              #{genreLabel(g, locale)}
            </Link>
          ))}
        </>
      )}
      {empty && (
        <button type="submit" data-suggest-row onKeyDown={onRowKeyDown} className="block w-full px-4 py-3 text-left text-sm text-ink-soft hover:bg-sage focus:bg-sage focus:outline-none">
          {t("discover", "suggestionsEmpty")}
        </button>
      )}
    </div>
  );
}
