import type { ComponentProps, ReactNode } from "react";

const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ");

export function Card({ className, ...p }: ComponentProps<"div">) {
  return <div className={cx("rounded-ui border border-line bg-surface p-5", className)} {...p} />;
}

export function Button({
  variant = "primary", className, ...p
}: ComponentProps<"button"> & { variant?: "primary" | "ghost" | "danger" }) {
  const styles = {
    primary: "bg-primary text-primary-fg hover:opacity-90",
    ghost: "border border-line bg-surface text-ink hover:bg-bg",
    danger: "border border-red-300 text-red-600 hover:bg-red-50 dark:hover:bg-red-950",
  }[variant];
  return (
    <button
      className={cx("rounded-ui px-4 py-2 text-sm font-medium transition disabled:opacity-50", styles, className)}
      {...p}
    />
  );
}

export function Field({ label, hint, ...p }: ComponentProps<"input"> & { label: string; hint?: string }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium">{label}</span>
      <input
        className="w-full rounded-ui border border-line bg-surface px-3 py-2 text-ink placeholder:text-muted"
        {...p}
      />
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

export function Select({ label, children, ...p }: ComponentProps<"select"> & { label: string }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium">{label}</span>
      <select className="w-full rounded-ui border border-line bg-surface px-3 py-2 text-ink" {...p}>
        {children}
      </select>
    </label>
  );
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "good" | "warn" }) {
  const t = {
    neutral: "bg-bg text-muted",
    good: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
    warn: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  }[tone];
  return <span className={cx("rounded-full px-2 py-0.5 text-xs font-medium", t)}>{children}</span>;
}

export function PageHeader({ title, sub, children }: { title: string; sub?: string; children?: ReactNode }) {
  return (
    <div className="mb-6 flex items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold">{title}</h1>
        {sub && <p className="mt-1 text-sm text-muted">{sub}</p>}
      </div>
      {children}
    </div>
  );
}
