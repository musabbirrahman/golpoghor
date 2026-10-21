/**
 * Keepsakes PNG renderer (V4-27b). Port of the 2026-10-20 spike's drawCard
 * (spike/index.html), which proved Bangla shaping, the font-loading guard,
 * and preview/export parity on representative passages.
 *
 * Rules carried over from the spike, verbatim:
 * - Lay out ONCE at export resolution (1080x1350). The on-screen preview
 *   is that same canvas shown scaled — never re-wrap at preview size.
 * - Never draw before the used fonts are loaded (document.fonts.load for
 *   every family/weight, then fonts.ready). An unguarded render silently
 *   falls back and re-wraps differently.
 * - Auto-fit 44px -> 26px floor; if even the floor does not fit, trim
 *   words from the end (with an ellipsis) until it does — a card must
 *   never clip or overlap its attribution block.
 */
import type { KeepsakeTemplate } from "./types";
import { KEEPSAKE_EXCERPT_MAX } from "./data-provider";

export const CARD_W = 1080;
export const CARD_H = 1350;

const SERIF = '"Literata", "Noto Serif Bengali", Georgia, serif';
const SANS = '"Inter", "Noto Sans Bengali", system-ui, sans-serif';

export interface Palette {
  bg: string;
  ink: string;
  faint: string;
  accent: string;
  rule: string;
}

export const CARD_TEMPLATES: Record<KeepsakeTemplate, Palette> = {
  // Spike-proven palettes.
  "classic-paper": { bg: "#f7f1e3", ink: "#2b2620", faint: "rgba(43,38,32,.62)", accent: "#b07f2e", rule: "rgba(43,38,32,.25)" },
  midnight: { bg: "#1c2422", ink: "#ece7d9", faint: "rgba(236,231,217,.62)", accent: "#d9a441", rule: "rgba(236,231,217,.25)" },
  // New for 27b, same layout language.
  "quiet-garden": { bg: "#e8efe4", ink: "#2e3a2e", faint: "rgba(46,58,46,.62)", accent: "#6b8f5e", rule: "rgba(46,58,46,.25)" },
  "old-letters": { bg: "#efe6d0", ink: "#4a3b28", faint: "rgba(74,59,40,.62)", accent: "#8a5a2b", rule: "rgba(74,59,40,.25)" },
  "modern-ink": { bg: "#ffffff", ink: "#1c1c1c", faint: "rgba(28,28,28,.6)", accent: "#c2410c", rule: "rgba(28,28,28,.2)" },
  neer: { bg: "#24473c", ink: "#f2ecdc", faint: "rgba(242,236,220,.62)", accent: "#e0b45c", rule: "rgba(242,236,220,.25)" },
};

/** Preserve line breaks (poems, stanzas) and cap at K1, cutting at a
 * word/line boundary. Only spaces/tabs collapse within a line; blank
 * lines collapse to at most one (a stanza gap). */
export function normalizeExcerpt(raw: string): string {
  const lines = raw.split(/\r\n|\r|\n/).map((l) => l.replace(/[ \t]+/g, " ").trim());
  const out: string[] = [];
  let blanks = 0;
  for (const l of lines) {
    if (l === "") {
      blanks++;
      if (blanks <= 1) out.push("");
      continue;
    }
    blanks = 0;
    out.push(l);
  }
  while (out[0] === "") out.shift();
  while (out[out.length - 1] === "") out.pop();
  const text = out.join("\n");
  if (text.length <= KEEPSAKE_EXCERPT_MAX) return text;
  const cut = text.slice(0, KEEPSAKE_EXCERPT_MAX);
  const lastBreak = Math.max(cut.lastIndexOf("\n"), cut.lastIndexOf(" "));
  return (lastBreak > 0 ? cut.slice(0, lastBreak) : cut).trim();
}

export function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  const fits = (s: string) => ctx.measureText(s).width <= maxWidth;
  const pushLongWord = (word: string) => {
    let cur = "";
    for (const ch of word) {
      if (cur && !fits(cur + ch)) {
        lines.push(cur);
        cur = ch;
      } else cur += ch;
    }
    return cur;
  };
  // Wrap paragraph by paragraph so explicit line breaks survive; a blank
  // input line becomes a blank canvas line (stanza gap).
  for (const para of text.split("\n")) {
    if (para === "") {
      lines.push("");
      continue;
    }
    let line = "";
    for (const w of para.split(/\s+/).filter(Boolean)) {
      const trial = line ? line + " " + w : w;
      if (fits(trial)) {
        line = trial;
        continue;
      }
      if (line) lines.push(line);
      line = fits(w) ? w : pushLongWord(w);
    }
    if (line) lines.push(line);
  }
  return lines;
}

async function ensureFonts(text: string): Promise<void> {
  if (typeof document === "undefined" || !document.fonts?.load) return;
  const jobs: Promise<unknown>[] = [];
  for (const s of [44, 40, 36, 32, 28, 26]) {
    jobs.push(document.fonts.load(`400 ${s}px "Noto Serif Bengali"`, text));
    jobs.push(document.fonts.load(`400 ${s}px "Literata"`, text));
  }
  jobs.push(document.fonts.load('italic 400 30px "Noto Serif Bengali"', text));
  jobs.push(document.fonts.load('italic 400 30px "Literata"', text));
  jobs.push(document.fonts.load('600 30px "Noto Serif Bengali"', text));
  jobs.push(document.fonts.load('600 30px "Literata"', text));
  jobs.push(document.fonts.load('500 22px "Noto Sans Bengali"', "গল্পনীড়"));
  await Promise.all(jobs);
  await document.fonts.ready;
}

export interface CardRender {
  fontSize: number;
  lineCount: number;
  trimmed: boolean;
  excerpt: string;
  echoTrimmed?: boolean;
}

/** Height of one laid-out line. Blank lines (stanza gaps) take half a
 * line: the chapter this poem comes from has a blank paragraph between
 * every line, and full-height blanks read as double spacing on a card. */
export function cardLineHeight(line: string, fontSize: number): number {
  return line === "" ? fontSize * 0.875 : fontSize * 1.75;
}

function layout(
  ctx: CanvasRenderingContext2D,
  text: string,
  textW: number,
  textAreaH: number
): { fontSize: number; lines: string[]; heights: number[]; fits: boolean } {
  let fontSize = 44;
  let lines: string[] = [];
  let heights: number[] = [];
  for (; fontSize >= 26; fontSize -= 2) {
    ctx.font = `400 ${fontSize}px ${SERIF}`;
    lines = wrapText(ctx, text, textW);
    heights = lines.map((l) => cardLineHeight(l, fontSize));
    if (heights.reduce((a, b) => a + b, 0) <= textAreaH) break;
  }
  const totalH = heights.reduce((a, b) => a + b, 0);
  return { fontSize, lines, heights, fits: totalH <= textAreaH };
}

/** Draw one card at export resolution. Returns layout info + trim flag. */
export async function renderKeepsakeCard(
  canvas: HTMLCanvasElement,
  input: {
    excerpt: string;
    title: string;
    author: string;
    template: KeepsakeTemplate;
    /** Keeper credit (public cards only): drawn under the author line. */
    keeper?: string | null;
    keeperLabel?: string;
    /**
     * Optional echo (owner downloads only — never passed for public
     * cards). Drawn under the passage behind a rule, in italic; the
     * passage is trimmed to the space above it so the two never
     * overlap. Without an echo the layout is exactly the old one.
     */
    echo?: string | null;
  }
): Promise<CardRender> {
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const ctx = canvas.getContext("2d")!;
  const tpl = CARD_TEMPLATES[input.template];
  await ensureFonts(input.excerpt + input.title + input.author + (input.echo ?? "") + "Echo · প্রতিধ্বনি");

  const padX = 96;
  const textW = CARD_W - padX * 2;
  const topY = 120;
  const textAreaH = CARD_H - topY - 190 - 40;
  const echoText = input.echo?.trim() ? input.echo.trim() : null;
  // Echo block: label line + up to 6 lines at 30px/1.6. The passage
  // gets whatever text area remains, so an echo card never clips.
  // The label (not just a rule) marks where the owner's words start,
  // so a shared PNG can never be misread as the original text.
  const echoAreaH = echoText ? 356 : 0;
  const passageAreaH = textAreaH - echoAreaH;

  // Trim from the end until the floor size fits (no clipping, ever).
  // Cutting at the last space OR newline keeps poem line breaks intact.
  let excerpt = input.excerpt;
  let trimmed = false;
  let lay = layout(ctx, excerpt, textW, passageAreaH);
  while (!lay.fits && excerpt.length > 0) {
    const clean = excerpt.replace(/ …$/, "");
    const cutAt = Math.max(clean.lastIndexOf(" "), clean.lastIndexOf("\n"));
    if (cutAt <= 0) break;
    excerpt = clean.slice(0, cutAt) + " …";
    trimmed = true;
    lay = layout(ctx, excerpt, textW, passageAreaH);
  }

  // Echo lines, truncated to the reserved block with an ellipsis.
  let echoLines: string[] = [];
  let echoHeights: number[] = [];
  let echoTrimmed = false;
  if (echoText) {
    ctx.font = `italic 400 30px ${SERIF}`;
    echoLines = wrapText(ctx, echoText, textW);
    if (echoLines.length > 6) {
      echoLines = echoLines.slice(0, 6);
      echoTrimmed = true;
      let last = echoLines[5].replace(/ …$/, "");
      while (last.length > 0 && ctx.measureText(last + " …").width > textW) last = last.slice(0, -1);
      echoLines[5] = last + " …";
    }
    echoHeights = echoLines.map((l) => (l === "" ? 24 : 48));
  }

  ctx.fillStyle = tpl.bg;
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  // Ornament
  ctx.fillStyle = tpl.accent;
  ctx.font = `400 54px ${SERIF}`;
  ctx.textAlign = "center";
  ctx.fillText("❦", CARD_W / 2, topY - 28);

  // Passage + echo centred as one block when an echo is included;
  // without an echo the passage is centred exactly as before.
  const blockH = lay.heights.reduce((a, b) => a + b, 0);
  const echoH = echoHeights.reduce((a, b) => a + b, 0);
  const totalH = blockH + (echoText ? 68 + echoH : 0);
  let y = topY + lay.fontSize + Math.max(0, (textAreaH - totalH) / 2);
  ctx.fillStyle = tpl.ink;
  ctx.font = `400 ${lay.fontSize}px ${SERIF}`;
  ctx.textAlign = "left";
  for (let i = 0; i < lay.lines.length; i++) {
    ctx.fillText(lay.lines[i], padX, y);
    y += lay.heights[i];
  }
  if (echoText) {
    y += 24;
    ctx.fillStyle = tpl.accent;
    ctx.font = `600 26px ${SERIF}`;
    ctx.fillText("Echo · প্রতিধ্বনি", padX, y);
    y += 44;
    ctx.fillStyle = tpl.ink;
    ctx.font = `italic 400 30px ${SERIF}`;
    for (let i = 0; i < echoLines.length; i++) {
      ctx.fillText(echoLines[i], padX, y);
      y += echoHeights[i];
    }
  }

  // Attribution (fixed block, never overlapped: text area reserves it).
  const base = CARD_H - 150;
  ctx.strokeStyle = tpl.rule;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(padX, base - 64);
  ctx.lineTo(padX + 72, base - 64);
  ctx.stroke();
  ctx.fillStyle = tpl.ink;
  ctx.font = `600 30px ${SERIF}`;
  ctx.fillText(input.title, padX, base);
  ctx.fillStyle = tpl.faint;
  ctx.font = `400 26px ${SERIF}`;
  ctx.fillText(input.author, padX, base + 42);
  if (input.keeper) {
    ctx.font = `400 24px ${SERIF}`;
    ctx.fillText(`${input.keeperLabel ?? "Kept by"} ${input.keeper}`, padX, base + 84);
  }
  ctx.font = `500 22px ${SANS}`;
  ctx.textAlign = "right";
  ctx.fillText("GolpoNeer · গল্পনীড়", CARD_W - padX, base + 42);
  ctx.textAlign = "left";

  return { fontSize: lay.fontSize, lineCount: lay.lines.length, trimmed, excerpt, echoTrimmed };
}

/** Attribution from story metadata (V4-28). A classic/translated work is
 * credited to its original author, with translator/adapter named as
 * different people; absent credits stay absent, never fabricated. */
export function keepsakeAttribution(
  story: {
    title: string;
    author?: { display_name: string } | null;
    original_author?: string | null;
    translator_name?: string | null;
    adapter_name?: string | null;
  },
  locale: "bn" | "en" = "en"
): { title: string; author: string } {
  const base = story.original_author?.trim() || story.author?.display_name || "";
  const bits: string[] = [];
  if (story.translator_name?.trim())
    bits.push(locale === "bn" ? `অনুবাদ: ${story.translator_name.trim()}` : `Translated by ${story.translator_name.trim()}`);
  if (story.adapter_name?.trim())
    bits.push(locale === "bn" ? `রূপান্তর: ${story.adapter_name.trim()}` : `Adapted by ${story.adapter_name.trim()}`);
  return { title: story.title, author: bits.length ? `${base} · ${bits.join(" · ")}` : base };
}

/** Trigger a browser download of the canvas as a PNG. The anchor must be
 * attached to the document: a detached anchor's download attribute is
 * ignored by some browsers, which then save the file as "download". */
export function downloadKeepsakePNG(canvas: HTMLCanvasElement, filename: string): void {
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }, "image/png");
}
