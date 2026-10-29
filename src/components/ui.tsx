import { useEffect, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { Link } from "react-router-dom";
import { useApp } from "../lib/app-context";

const btnBase =
  "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors focus-visible:outline-2 disabled:opacity-50 disabled:cursor-not-allowed";

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger" | "gold" | "outline";
  size?: "sm" | "md" | "lg";
}) {
  const sizes = { sm: "px-3 py-1.5 text-sm", md: "px-4 py-2 text-sm", lg: "px-6 py-3 text-base" };
  const variants = {
    primary: "bg-river text-white hover:bg-river-dark",
    secondary: "bg-sage text-ink hover:bg-sage-dark",
    ghost: "text-ink-soft hover:bg-sage hover:text-ink",
    danger: "bg-clay text-white hover:bg-clay-dark",
    gold: "bg-gold text-white hover:brightness-95",
    outline: "bg-white text-ink border border-ink/15 hover:bg-sage",
  };
  return <button className={`${btnBase} ${sizes[size]} ${variants[variant]} ${className}`} {...props} />;
}

export function ButtonLink({
  to,
  variant = "primary",
  size = "md",
  className = "",
  children,
}: {
  to: string;
  variant?: "primary" | "secondary" | "ghost" | "danger" | "gold" | "outline";
  size?: "sm" | "md" | "lg";
  className?: string;
  children: ReactNode;
}) {
  const sizes = { sm: "px-3 py-1.5 text-sm", md: "px-4 py-2 text-sm", lg: "px-6 py-3 text-base" };
  const variants = {
    primary: "bg-river text-white hover:bg-river-dark",
    secondary: "bg-sage text-ink hover:bg-sage-dark",
    ghost: "text-ink-soft hover:bg-sage hover:text-ink",
    danger: "bg-clay text-white hover:bg-clay-dark",
    gold: "bg-gold text-white hover:brightness-95",
    outline: "bg-white text-ink border border-ink/15 hover:bg-sage",
  };
  return (
    <Link to={to} className={`${btnBase} ${sizes[size]} ${variants[variant]} ${className}`}>
      {children}
    </Link>
  );
}

export const fieldBase =
  "w-full rounded-lg border border-ink/15 bg-white px-3 py-2 text-ink placeholder:text-ink-faint focus:border-river focus:outline-none focus:ring-1 focus:ring-river";

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${fieldBase} ${props.className ?? ""}`} />;
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`${fieldBase} ${props.className ?? ""}`} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${fieldBase} ${props.className ?? ""}`} />;
}

/**
 * Custom dropdown — the in-page alternative to a native <select>.
 * Same pattern as the reader's chapter menu: a button showing the
 * current value, an absolute list below it, closed by picking,
 * tapping outside, or Escape. A native select opens the OS picker,
 * which breaks the site's look on phones; this stays in the page.
 */
export function Dropdown({
  id,
  value,
  options,
  onChange,
  ariaLabel,
}: {
  id?: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("touchstart", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("touchstart", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open ]);
  const current = options.find((o) => o.value === value);
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        id={id}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-ink/15 bg-white px-3 py-2 text-left text-ink focus:border-river focus:outline-none focus:ring-1 focus:ring-river focus-visible:rounded-lg"
      >
        <span className="min-w-0 flex-1 truncate">{current?.label ?? value}</span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={`h-[18px] w-[18px] shrink-0 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div role="listbox" className="absolute left-0 right-0 top-full z-50 mt-2 max-h-80 overflow-y-auto rounded-xl border border-ink/10 bg-white p-1 shadow-lift">
          {options.map((o) => {
            const selected = o.value === value;
            return (
              <button
                key={o.value}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => {
                  setOpen(false);
                  if (!selected) onChange(o.value);
                }}
                className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm ${selected ? "bg-sage font-semibold text-river" : "hover:bg-sage"}`}
              >
                <span className="min-w-0 flex-1 truncate">{o.label}</span>
                {selected && <span className="shrink-0">✓</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function Label({ children, htmlFor }: { children: ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-1 block text-sm font-medium text-ink-soft">
      {children}
    </label>
  );
}

export function FieldError({ message }: { message?: string | null }) {
  if (!message) return null;
  return <p className="mt-1 text-sm text-clay" role="alert">{message}</p>;
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-xl bg-white shadow-card ${className}`}>{children}</div>;
}

export function Badge({ children, tone = "sage" }: { children: ReactNode; tone?: "sage" | "gold" | "clay" | "river" }) {
  const tones = {
    sage: "bg-sage text-ink-soft",
    gold: "bg-gold-soft text-ink",
    clay: "bg-clay-soft text-clay-dark",
    river: "bg-river-soft text-river-dark",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${tones[tone]}`}>
      {children}
    </span>
  );
}

export function Spinner({ label }: { label?: string }) {
  const { t } = useApp();
  return (
    <div className="flex items-center justify-center gap-2 py-8 text-ink-faint" role="status">
      <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden>
        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
        <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      </svg>
      <span>{label ?? t("common", "loading")}</span>
    </div>
  );
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-ink/20 bg-white/60 px-6 py-12 text-center">
      <div className="font-serif text-4xl text-gold" aria-hidden>❦</div>
      <p className="font-medium text-ink">{title}</p>
      {hint && <p className="max-w-sm text-sm text-ink-faint">{hint}</p>}
      {action}
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const { t } = useApp();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 sm:items-center"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-paper p-6 shadow-lift"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 className="font-serif text-xl font-semibold">{title}</h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-ink-faint hover:bg-sage hover:text-ink"
            aria-label={t("common", "close")}
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Avatar({ name, size = "md", src }: { name: string; size?: "sm" | "md" | "lg" | "xl"; src?: string | null }) {
  const sizes = { sm: "h-8 w-8 text-xs", md: "h-10 w-10 text-sm", lg: "h-16 w-16 text-xl", xl: "h-28 w-28 text-3xl sm:h-36 sm:w-36 sm:text-4xl lg:h-44 lg:w-44 lg:text-5xl" };
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  if (src) {
    return (
      <img
        src={src}
        alt=""
        aria-hidden
        className={`shrink-0 rounded-full object-cover ${sizes[size]}`}
      />
    );
  }
  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-full bg-river font-serif font-semibold text-paper ${sizes[size]}`}
      aria-hidden
    >
      {initial}
    </div>
  );
}

export function LanguageBadge({ language }: { language: "bn" | "en" }) {
  return <Badge tone="river">{language === "bn" ? "বাংলা" : "English"}</Badge>;
}

export function StatusBadge({ status }: { status: string }) {
  const { t } = useApp();
  const map: Record<string, { tone: "sage" | "gold" | "clay" | "river"; label: string }> = {
    ongoing: { tone: "river", label: t("story", "ongoing") },
    complete: { tone: "sage", label: t("story", "complete") },
    draft: { tone: "gold", label: t("story", "draft") },
    hidden: { tone: "clay", label: t("story", "hidden") },
    published: { tone: "river", label: t("story", "ongoing") },
    unpublished: { tone: "gold", label: t("story", "unpublished") },
  };
  const s = map[status] ?? { tone: "sage" as const, label: status };
  return <Badge tone={s.tone}>{s.label}</Badge>;
}
