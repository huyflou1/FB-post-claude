import React, { useEffect, useState } from "react";
import { ChevronDown, Loader2, X } from "lucide-react";

// Shared blocks: every screen is built from these so spacing, colors and
// interactions stay identical across the app.

export type Tone = "blue" | "pink" | "mint" | "peach" | "violet" | "lemon" | "sky" | "gray";

export const toneTile: Record<Tone, string> = {
  blue: "bg-indigo-100 text-indigo-600 dark:bg-indigo-400/15 dark:text-indigo-300",
  pink: "bg-pink-100 text-pink-600 dark:bg-pink-400/15 dark:text-pink-300",
  mint: "bg-emerald-100 text-emerald-600 dark:bg-emerald-400/15 dark:text-emerald-300",
  peach: "bg-orange-100 text-orange-600 dark:bg-orange-400/15 dark:text-orange-300",
  violet: "bg-violet-100 text-violet-600 dark:bg-violet-400/15 dark:text-violet-300",
  lemon: "bg-amber-100 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300",
  sky: "bg-sky-100 text-sky-600 dark:bg-sky-400/15 dark:text-sky-300",
  gray: "bg-slate-100 text-slate-600 dark:bg-white/[0.06] dark:text-slate-300",
};

export const toneBar: Record<Tone, string> = {
  blue: "bg-indigo-400",
  pink: "bg-pink-400",
  mint: "bg-emerald-400",
  peach: "bg-orange-400",
  violet: "bg-violet-400",
  lemon: "bg-amber-400",
  sky: "bg-sky-400",
  gray: "bg-slate-300 dark:bg-slate-600",
};

const emoSize = { xs: "w-6 h-6 text-sm rounded-lg", sm: "w-8 h-8 text-base rounded-xl", md: "w-10 h-10 text-xl rounded-2xl", lg: "w-14 h-14 text-3xl rounded-[20px]", xl: "w-20 h-20 text-5xl rounded-[28px]" };

// Emoji on a pastel tile: the app's icon style
export function Emo({ e, tone = "gray", size = "sm", className = "" }: { e: string; tone?: Tone; size?: keyof typeof emoSize; className?: string }) {
  return (
    <span aria-hidden className={`emoji inline-flex items-center justify-center shrink-0 ${emoSize[size]} ${toneTile[tone]} ${className}`}>
      {e}
    </span>
  );
}

interface BlockProps {
  emoji?: string;
  tone?: Tone;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  collapsible?: boolean;
  defaultOpen?: boolean;
  className?: string;
  bodyClassName?: string;
  children?: React.ReactNode;
}

export function Block({ emoji, tone = "gray", title, subtitle, actions, collapsible, defaultOpen = true, className = "", bodyClassName = "p-4 sm:p-5", children }: BlockProps) {
  const [open, setOpen] = useState(defaultOpen);
  const isOpen = !collapsible || open;
  const heading = title !== undefined && (
    <div className="flex items-center gap-3 min-w-0">
      {emoji && <Emo e={emoji} tone={tone} />}
      <div className="min-w-0 text-left">
        <h3 className="text-[15px] font-extrabold text-ink truncate">{title}</h3>
        {subtitle && <p className="text-xs text-soft truncate">{subtitle}</p>}
      </div>
    </div>
  );

  return (
    <section className={`bg-block rounded-3xl border border-line shadow-[var(--shadow-block)] min-w-0 ${className}`}>
      {title !== undefined && (
        <header className="flex items-center justify-between gap-3 px-4 sm:px-5 pt-4 pb-1">
          {collapsible ? (
            <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={isOpen} className="flex items-center justify-between gap-3 flex-1 min-w-0 rounded-xl focus-ring">
              {heading}
              <ChevronDown className={`w-4 h-4 text-faint shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`} />
            </button>
          ) : (
            heading
          )}
          {actions && <div className="flex items-center gap-1.5 shrink-0">{actions}</div>}
        </header>
      )}
      {isOpen && <div className={bodyClassName}>{children}</div>}
    </section>
  );
}

type BtnVariant = "primary" | "soft" | "ghost" | "danger" | "outline";
const btnVariant: Record<BtnVariant, string> = {
  primary: "bg-brand text-white hover:brightness-105 active:brightness-95 shadow-[0_6px_16px_-6px_var(--color-brand)]",
  soft: "bg-indigo-50 text-brand-ink hover:bg-indigo-100 dark:bg-indigo-400/10 dark:hover:bg-indigo-400/20",
  ghost: "text-soft hover:bg-field hover:text-ink",
  danger: "bg-rose-50 text-rose-600 hover:bg-rose-100 dark:bg-rose-400/10 dark:text-rose-300 dark:hover:bg-rose-400/20",
  outline: "border border-line text-ink hover:bg-field",
};
const btnSize = { xs: "h-7 px-2.5 text-xs gap-1 rounded-lg", sm: "h-8 px-3 text-xs gap-1.5 rounded-xl", md: "h-10 px-4 text-sm gap-2 rounded-2xl", lg: "h-12 px-5 text-[15px] gap-2 rounded-2xl" };

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: BtnVariant;
  size?: keyof typeof btnSize;
  icon?: React.ReactNode;
  loading?: boolean;
}

export function Button({ variant = "soft", size = "md", icon, loading, children, className = "", disabled, ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      {...rest}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center font-bold whitespace-nowrap transition select-none focus-ring disabled:opacity-50 disabled:pointer-events-none ${btnVariant[variant]} ${btnSize[size]} ${className}`}
    >
      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : icon}
      {children}
    </button>
  );
}

export function IconButton({ label, children, className = "", ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      {...rest}
      className={`w-8 h-8 inline-flex items-center justify-center rounded-xl text-soft hover:bg-field hover:text-ink transition focus-ring disabled:opacity-40 ${className}`}
    >
      {children}
    </button>
  );
}

export function Badge({ tone = "gray", children, className = "" }: { tone?: Tone; children: React.ReactNode; className?: string }) {
  return <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold whitespace-nowrap ${toneTile[tone]} ${className}`}>{children}</span>;
}

export const inputCls =
  "w-full bg-field border border-line rounded-2xl px-3.5 py-2.5 text-sm text-ink placeholder:text-faint focus:outline-none focus:border-brand focus:ring-4 focus:ring-indigo-400/15 transition";

export function Label({ children, hint, htmlFor }: { children: React.ReactNode; hint?: React.ReactNode; htmlFor?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 mb-1.5">
      <label htmlFor={htmlFor} className="text-xs font-bold text-soft">
        {children}
      </label>
      {hint && <span className="text-[11px] text-faint">{hint}</span>}
    </div>
  );
}

export function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative w-10 h-6 rounded-full shrink-0 transition focus-ring disabled:opacity-40 ${checked ? "bg-emerald-400" : "bg-slate-200 dark:bg-white/10"}`}
    >
      <span className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow transition ${checked ? "translate-x-4" : ""}`} />
    </button>
  );
}

// Pass visualOnly when the checkbox sits inside another button that handles the click
export function Checkbox({ checked, indeterminate, onChange, label, visualOnly }: { checked: boolean; indeterminate?: boolean; onChange?: (v: boolean) => void; label: string; visualOnly?: boolean }) {
  const Tag = visualOnly ? "span" : "button";
  return (
    <Tag
      {...(visualOnly
        ? { "aria-hidden": true }
        : {
            type: "button" as const,
            role: "checkbox",
            "aria-checked": indeterminate ? ("mixed" as const) : checked,
            "aria-label": label,
            onClick: (e: React.MouseEvent) => {
              e.stopPropagation();
              onChange?.(!checked);
            },
          })}
      className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition focus-ring ${
        checked || indeterminate ? "bg-brand border-brand text-white" : "border-slate-300 dark:border-white/20 bg-block"
      }`}
    >
      {checked ? (
        <svg viewBox="0 0 12 12" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
          <path d="M2.5 6.5l2.2 2.2 4.8-5" />
        </svg>
      ) : indeterminate ? (
        <span className="w-2.5 h-0.5 rounded bg-white" />
      ) : null}
    </Tag>
  );
}

// Pill segmented control
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className = "",
  size = "md",
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: React.ReactNode; emoji?: string; count?: number }[];
  className?: string;
  size?: "sm" | "md";
}) {
  return (
    <div role="tablist" className={`inline-flex p-1 gap-1 rounded-2xl bg-field border border-line max-w-full overflow-x-auto scroll-thin ${className}`}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={`flex items-center justify-center gap-1.5 rounded-xl font-bold whitespace-nowrap transition focus-ring flex-1 ${size === "sm" ? "h-7 px-2.5 text-xs" : "h-9 px-3.5 text-sm"} ${
              active ? "bg-block text-ink shadow-sm" : "text-soft hover:text-ink"
            }`}
          >
            {o.emoji && <span className="emoji">{o.emoji}</span>}
            {o.label}
            {o.count !== undefined && o.count > 0 && <span className={`text-[10px] px-1.5 rounded-full ${active ? "bg-indigo-100 text-brand-ink dark:bg-indigo-400/20" : "bg-line"}`}>{o.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

export function Avatar({ src, name, color, size = 36, ring }: { src?: string; name: string; color?: string; size?: number; ring?: boolean }) {
  const [failed, setFailed] = useState(false);
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  const style: React.CSSProperties = { width: size, height: size, ...(ring && color ? { boxShadow: `0 0 0 2px var(--color-block), 0 0 0 4px ${color}` } : {}) };
  if (src && !failed) {
    return <img src={src} alt="" onError={() => setFailed(true)} style={style} className="rounded-full object-cover shrink-0 bg-field" referrerPolicy="no-referrer" />;
  }
  return (
    <span style={{ ...style, background: color ?? "#a29cb8", fontSize: size * 0.42 }} className="rounded-full shrink-0 inline-flex items-center justify-center font-extrabold text-white">
      {initial}
    </span>
  );
}

export function EmptyState({ emoji, title, text, action, tone = "violet" }: { emoji: string; title: string; text?: React.ReactNode; action?: React.ReactNode; tone?: Tone }) {
  return (
    <div className="flex flex-col items-center text-center py-10 px-4 animate-pop">
      <Emo e={emoji} tone={tone} size="xl" className="mb-4" />
      <p className="font-extrabold text-ink">{title}</p>
      {text && <p className="text-sm text-soft mt-1 max-w-sm">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  emoji,
  children,
  footer,
  width = "max-w-lg",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  emoji?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]" onClick={onClose} />
      <div className={`relative w-full ${width} bg-block rounded-t-3xl sm:rounded-3xl shadow-[var(--shadow-pop)] animate-pop max-h-[92vh] flex flex-col`}>
        <header className="flex items-center justify-between gap-3 px-5 pt-5 pb-3">
          <div className="flex items-center gap-3 min-w-0">
            {emoji && <Emo e={emoji} tone="violet" />}
            <h2 className="font-extrabold text-lg text-ink truncate">{title}</h2>
          </div>
          <IconButton label="Đóng" onClick={onClose}>
            <X className="w-4 h-4" />
          </IconButton>
        </header>
        <div className="px-5 pb-5 overflow-y-auto scroll-thin">{children}</div>
        {footer && <footer className="px-5 py-4 border-t border-line flex justify-end gap-2">{footer}</footer>}
      </div>
    </div>
  );
}

export function ProgressBar({ ok, failed, total, running }: { ok: number; failed: number; total: number; running?: boolean }) {
  if (!total) return null;
  return (
    <div className="h-2 rounded-full bg-field overflow-hidden flex" role="progressbar" aria-valuenow={ok + failed} aria-valuemax={total}>
      <div className={`bg-emerald-400 transition-all ${running ? "bar-running" : ""}`} style={{ width: `${(ok / total) * 100}%` }} />
      <div className="bg-rose-400 transition-all" style={{ width: `${(failed / total) * 100}%` }} />
    </div>
  );
}
