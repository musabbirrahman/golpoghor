import { type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
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
  variant?: "primary" | "secondary" | "ghost" | "danger" | "gold";
  size?: "sm" | "md" | "lg";
}) {
  const sizes = { sm: "px-3 py-1.5 text-sm", md: "px-4 py-2 text-sm", lg: "px-6 py-3 text-base" };
  const variants = {
    primary: "bg-river text-white hover:bg-river-dark",
    secondary: "bg-sage text-ink hover:bg-sage-dark",
    ghost: "text-ink-soft hover:bg-sage hover:text-ink",
    danger: "bg-clay text-white hover:bg-clay-dark",
    gold: "bg-gold text-white hover:brightness-95",
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
  variant?: "primary" | "secondary" | "ghost" | "danger" | "gold";
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
  };
  return (
    <Link to={to} className={`${btnBase} ${sizes[size]} ${variants[variant]} ${className}`}>
      {children}
    </Link>
  );
}

const fieldBase =
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

export function Avatar({ name, size = "md", src }: { name: string; size?: "sm" | "md" | "lg"; src?: string | null }) {
  const sizes = { sm: "h-8 w-8 text-xs", md: "h-10 w-10 text-sm", lg: "h-16 w-16 text-xl" };
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
