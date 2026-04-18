import clsx from "clsx";
import { forwardRef } from "react";
import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  InputHTMLAttributes,
  SelectHTMLAttributes,
} from "react";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={clsx(
        "rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-sm",
        "shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset,0_20px_60px_-30px_rgba(0,0,0,0.6)]",
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={clsx(
        "px-5 py-4 border-b border-white/5 flex items-center justify-between gap-3",
        className,
      )}
      {...props}
    />
  );
}

export function CardTitle({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={clsx("text-sm font-semibold tracking-wide text-slate-200", className)}
      {...props}
    />
  );
}

export function CardBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={clsx("p-5", className)} {...props} />;
}

type BtnVariant = "primary" | "secondary" | "ghost" | "danger";
type BtnSize = "sm" | "md";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: BtnVariant;
  size?: BtnSize;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = "secondary", size = "md", ...props },
  ref,
) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition " +
    "focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/60 " +
    "disabled:opacity-40 disabled:cursor-not-allowed";
  const sizes = {
    sm: "text-xs px-2.5 py-1.5",
    md: "text-sm px-3.5 py-2",
  }[size];
  const variants: Record<BtnVariant, string> = {
    primary:
      "bg-gradient-to-b from-brand-500 to-brand-600 text-white shadow-glow hover:from-brand-400 hover:to-brand-500",
    secondary:
      "bg-white/[0.06] text-slate-100 border border-white/10 hover:bg-white/[0.1]",
    ghost: "text-slate-300 hover:text-white hover:bg-white/[0.06]",
    danger:
      "bg-gradient-to-b from-rose-500 to-rose-600 text-white shadow-[0_10px_40px_-10px_rgba(244,63,94,0.5)] hover:from-rose-400 hover:to-rose-500",
  };
  return <button ref={ref} className={clsx(base, sizes, variants[variant], className)} {...props} />;
});

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return (
      <input
        ref={ref}
        className={clsx(
          "w-full rounded-lg bg-slate-900/60 border border-white/10 px-3 py-2 text-sm",
          "text-slate-100 placeholder:text-slate-500 font-mono",
          "focus:outline-none focus:ring-2 focus:ring-brand-400/50 focus:border-brand-400/60",
          className,
        )}
        {...props}
      />
    );
  },
);

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, ...props }, ref) {
    return (
      <select
        ref={ref}
        className={clsx(
          "w-full rounded-lg bg-slate-900/60 border border-white/10 px-3 py-2 text-sm",
          "text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-400/50 focus:border-brand-400/60",
          className,
        )}
        {...props}
      />
    );
  },
);

export function Badge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "ok" | "warn" | "err" | "brand";
}) {
  const tones: Record<string, string> = {
    neutral: "bg-slate-800/80 text-slate-300 border-slate-700",
    ok: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30",
    warn: "bg-amber-500/10 text-amber-200 border-amber-500/30",
    err: "bg-rose-500/10 text-rose-300 border-rose-500/30",
    brand: "bg-brand-500/10 text-brand-200 border-brand-500/30",
  };
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium",
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}

export function Label({ className, ...props }: HTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={clsx("text-xs uppercase tracking-wider text-slate-400", className)}
      {...props}
    />
  );
}

export function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={clsx(
        "flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs transition",
        "border border-white/10 bg-slate-900/50 hover:bg-slate-900/80",
      )}
    >
      <span
        className={clsx(
          "inline-block w-7 h-4 rounded-full relative transition",
          checked ? "bg-brand-500" : "bg-slate-700",
        )}
      >
        <span
          className={clsx(
            "absolute top-0.5 w-3 h-3 rounded-full bg-white transition",
            checked ? "left-3.5" : "left-0.5",
          )}
        />
      </span>
      <span className="text-slate-300">{label}</span>
    </button>
  );
}
