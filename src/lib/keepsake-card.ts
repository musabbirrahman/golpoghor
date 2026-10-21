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

interface Palette {
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

/** Collapse whitespace and cap at K1, cutting at a word boundary. */
export function normalizeExcerpt(raw: string): string {
  const text = raw.replace(/\s+/g, " ").trim();
  if (text.length <= KEEPSAKE_EXCERPT_MAX) return text;
  const cut = text.slice(0, KEEPSAKE_EXCERPT_MAX);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > 0 ? cut.slice(0, lastSpace) : cut).trim();
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
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
  for (const w of words) {
    const trial = line ? line + " " + w : w;
    if (fits(trial)) {
      line = trial;
      continue;
    }
    if (line) lines.push(line);
    line = fits(w) ? w : pushLongWord(w);
  }
  if (line) lines.push(line);
  return lines;
}

async function ensureFonts(text: string): Promise<void> {
  if (typeof document === "undefined" || !document.fonts?.load) return;
  const jobs: Promise<unknown>[] = [];
  for (const s of [44, 40, 36, 32, 28, 26]) {
    jobs.push(document.fonts.load(`400 ${s}px "Noto Serif Bengali"`, text));
    jobs.push(document.fonts.load(`400 ${s}px "Literata"`, text));
  }
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
}

function layout(
  ctx: CanvasRenderingContext2D,
  text: string,
  textW: number,
  textAreaH: number
): { fontSize: number; lines: string[]; fits: boolean } {
  let fontSize = 44;
  let lines: string[] = [];
  for (; fontSize >= 26; fontSize -= 2) {
    ctx.font = `400 ${fontSize}px ${SERIF}`;
    lines = wrapText(ctx, text, textW);
    if (lines.length * fontSize * 1.75 <= textAreaH) break;
  }
  const lineHeight = fontSize * 1.75;
  return { fontSize, lines, fits: lines.length * lineHeight <= textAreaH };
}

/** Draw one card at export resolution. Returns layout info + trim flag. */
export async function renderKeepsakeCard(
  canvas: HTMLCanvasElement,
  input: { excerpt: string; title: string; author: string; template: KeepsakeTemplate }
): Promise<CardRender> {
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const ctx = canvas.getContext("2d")!;
  const tpl = CARD_TEMPLATES[input.template];
  await ensureFonts(input.excerpt + input.title + input.author);

  const padX = 96;
  const textW = CARD_W - padX * 2;
  const topY = 120;
  const textAreaH = CARD_H - topY - 190 - 40;

  // Trim from the end until the floor size fits (no clipping, ever).
  let excerpt = input.excerpt;
  let trimmed = false;
  let lay = layout(ctx, excerpt, textW, textAreaH);
  while (!lay.fits && excerpt.length > 0) {
    const words = excerpt.split(/\s+/);
    if (words.length <= 1) break;
    words.pop();
    excerpt = words.join(" ") + " …";
    trimmed = true;
    lay = layout(ctx, excerpt, textW, textAreaH);
  }

  ctx.fillStyle = tpl.bg;
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  // Ornament
  ctx.fillStyle = tpl.accent;
  ctx.font = `400 54px ${SERIF}`;
  ctx.textAlign = "center";
  ctx.fillText("❦", CARD_W / 2, topY - 28);

  // Passage (vertically centred when short — spike design note).
  const blockH = lay.lines.length * lay.fontSize * 1.75;
  let y = topY + lay.fontSize + Math.max(0, (textAreaH - blockH) / 2);
  ctx.fillStyle = tpl.ink;
  ctx.font = `400 ${lay.fontSize}px ${SERIF}`;
  ctx.textAlign = "left";
  for (const ln of lay.lines) {
    ctx.fillText(ln, padX, y);
    y += lay.fontSize * 1.75;
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
  ctx.font = `500 22px ${SANS}`;
  ctx.textAlign = "right";
  ctx.fillText("GolpoNeer · গল্পনীড়", CARD_W - padX, base + 42);
  ctx.textAlign = "left";

  return { fontSize: lay.fontSize, lineCount: lay.lines.length, trimmed, excerpt };
}

/** Attribution from story metadata (V4-28 extends this for classics). */
export function keepsakeAttribution(story: {
  title: string;
  author?: { display_name: string } | null;
}): { title: string; author: string } {
  return { title: story.title, author: story.author?.display_name ?? "" };
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
