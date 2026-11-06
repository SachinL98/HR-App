import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

/** A white panel. Give it a title and it gets a header row; add `flush` to let tables touch the edges. */
export function Card({
  className, title, sub, action, flush, children, ...p
}: Omit<ComponentProps<"div">, "title"> & { title?: ReactNode; sub?: ReactNode; action?: ReactNode; flush?: boolean }) {
  return (
    <div className={cx("rounded-ui border border-line bg-surface shadow-[var(--shadow)]", !flush && !title && "p-5", className)} {...p}>
      {title && (
        <div className={cx("flex items-start justify-between gap-3 px-5 pt-4", flush ? "pb-3" : "pb-0")}>
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold leading-6">{title}</h2>
            {sub && <p className="text-[13px] text-muted">{sub}</p>}
          </div>
          {action}
        </div>
      )}
      {title && !flush ? <div className="px-5 pb-5 pt-3">{children}</div> : children}
    </div>
  );
}

type ButtonVariant = "primary" | "ghost" | "danger" | "subtle";
const BUTTON_STYLES: Record<ButtonVariant, string> = {
  primary: "bg-primary text-primary-fg shadow-sm hover:brightness-110 active:brightness-95",
  ghost: "border border-line bg-surface text-ink hover:bg-surface-2",
  subtle: "text-muted hover:bg-surface-2 hover:text-ink",
  danger: "border border-red-300/70 bg-surface text-red-600 hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950",
};

export function buttonClass(variant: ButtonVariant = "primary", size: "md" | "sm" = "md", className?: string) {
  return cx(
    "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-ui font-medium transition disabled:pointer-events-none disabled:opacity-50",
    size === "sm" ? "min-h-8 px-3 text-xs" : "min-h-10 px-4 text-sm",
    BUTTON_STYLES[variant],
    className,
  );
}

export function Button({
  variant = "primary", size = "md", className, ...p
}: ComponentProps<"button"> & { variant?: ButtonVariant; size?: "md" | "sm" }) {
  return <button className={buttonClass(variant, size, className)} {...p} />;
}

/** A link that looks like a button. */
export function LinkButton({
  variant = "primary", size = "md", className, ...p
}: ComponentProps<typeof Link> & { variant?: ButtonVariant; size?: "md" | "sm" }) {
  return <Link className={buttonClass(variant, size, className)} {...p} />;
}

function Label({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1.5 block text-[13px] font-medium">{label}</span>
      {children}
      {hint && <span className="mt-1.5 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

export function Field({ label, hint, className, ...p }: ComponentProps<"input"> & { label: string; hint?: string }) {
  return <Label label={label} hint={hint}><input className={cx("input", className)} {...p} /></Label>;
}

export function Select({ label, hint, className, children, ...p }: ComponentProps<"select"> & { label: string; hint?: string }) {
  return <Label label={label} hint={hint}><select className={cx("input", className)} {...p}>{children}</select></Label>;
}

export function Textarea({ label, hint, className, ...p }: ComponentProps<"textarea"> & { label: string; hint?: string }) {
  return <Label label={label} hint={hint}><textarea className={cx("input", className)} {...p} /></Label>;
}

type Tone = "neutral" | "good" | "warn" | "bad" | "info";
const TONES: Record<Tone, string> = {
  neutral: "bg-surface-2 text-muted ring-line",
  good: "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:ring-emerald-900",
  warn: "bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:ring-amber-900",
  bad: "bg-red-50 text-red-700 ring-red-200 dark:bg-red-950 dark:text-red-300 dark:ring-red-900",
  info: "bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-950 dark:text-sky-300 dark:ring-sky-900",
};

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: Tone }) {
  return <span className={cx("inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset", TONES[tone])}>{children}</span>;
}

/** Title row at the top of every page. `back` adds a small "← Label" link above the title. */
export function PageHeader({
  title, sub, back, children,
}: { title: string; sub?: string; back?: { href: string; label: string }; children?: ReactNode }) {
  return (
    <div className="mb-6">
      {back && <Link href={back.href} className="mb-2 inline-flex items-center gap-1 text-[13px] text-muted hover:text-ink">← {back.label}</Link>}
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {sub && <p className="mt-1 text-sm text-muted">{sub}</p>}
        </div>
        {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
      </div>
    </div>
  );
}

/** A big number with a label, for summaries. */
export function Stat({ label, value, note, tone }: { label: string; value: ReactNode; note?: ReactNode; tone?: Tone }) {
  return (
    <Card>
      <p className="text-[13px] font-medium text-muted">{label}</p>
      <p className="mt-1 text-3xl font-semibold tracking-tight">{value}</p>
      {note && <div className="mt-1 text-xs text-muted">{tone ? <Badge tone={tone}>{note}</Badge> : note}</div>}
    </Card>
  );
}

/** Friendly "nothing here" message. */
export function Empty({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 px-5 py-10 text-center">
      <p className="max-w-sm text-sm text-muted">{children}</p>
      {action}
    </div>
  );
}

/** A table inside a card that scrolls sideways on small screens. Use with the `.tbl` styles. */
export function TableCard({ children, className }: { children: ReactNode; className?: string }) {
  return <Card flush className={cx("overflow-hidden", className)}><div className="overflow-x-auto"><table className="tbl">{children}</table></div></Card>;
}

/** Page body split into a main column and a side panel that stacks on small screens. */
export function Split({ children, side = "24rem" }: { children: ReactNode; side?: "20rem" | "24rem" | "28rem" }) {
  const cols = { "20rem": "xl:grid-cols-[minmax(0,1fr)_20rem]", "24rem": "xl:grid-cols-[minmax(0,1fr)_24rem]", "28rem": "xl:grid-cols-[minmax(0,1fr)_28rem]" }[side];
  return <div className={cx("grid items-start gap-6", cols)}>{children}</div>;
}

/** Initials in a coloured circle. */
export function Avatar({ name, size = 32, member }: { name: string; size?: number; member?: { id: string; photoFileId?: string | null } }) {
  const initials = name.split(" ").filter(Boolean).slice(0, 2).map((s) => s[0]?.toUpperCase()).join("");
  if (member?.photoFileId) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img alt="" src={`/api/photo/${member.id}?v=${member.photoFileId}`} width={size} height={size} style={{ width: size, height: size }} className="inline-block shrink-0 rounded-full object-cover" />;
  }
  return (
    <span aria-hidden style={{ width: size, height: size, fontSize: size * 0.38 }}
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-primary/10 font-semibold text-primary">{initials}</span>
  );
}

/** Small "Delete" / "Remove" style form buttons used inside rows. */
export function RowAction({ action, id, label, variant = "ghost" }: { action: (d: FormData) => void | Promise<void>; id: string; label: string; variant?: ButtonVariant }) {
  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <Button variant={variant} size="sm" type="submit">{label}</Button>
    </form>
  );
}
