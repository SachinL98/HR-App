"use client";
import type { DocLayout } from "@/lib/api";
import { Field } from "./ui";
import { useI18n } from "./i18n";

/** Defaults match the API's letterhead layout (points on an A4 page). */
export const LAYOUT_DEFAULTS = { top: 135, bottom: 120, left: 40, right: 80, size: 12, color: "#1f2937", justify: true, footer: 22 };

/**
 * Letterhead upload plus a collapsed "Page layout" section. The design is made in Canva and
 * exported as PNG or PDF; the layout says where the filled-in text sits on it.
 */
export function LetterheadFields({ layout, hasLetterhead, optional = true }: { layout?: DocLayout | null; hasLetterhead?: boolean; optional?: boolean }) {
  const { t } = useI18n();
  const v = { ...LAYOUT_DEFAULTS, ...(layout ?? {}) };
  return (
    <div className="space-y-3 rounded-ui border border-line bg-surface-2 p-4">
      <label className="block text-sm">
        <span className="mb-1.5 block text-[13px] font-medium">{t("md.lh.label")}{optional ? ` ${t("common.optional")}` : ""}</span>
        <input type="file" name="letterhead" accept="image/png,application/pdf"
          className="input bg-surface py-1.5 file:mr-3 file:rounded file:border-0 file:bg-surface-2 file:px-3 file:py-1 file:text-sm" />
        <span className="mt-1.5 block text-xs text-muted">
          {hasLetterhead ? `${t("md.lh.isSet")} ` : ""}
          {t("md.lh.how")}
        </span>
      </label>
      <input type="hidden" name="hasLayout" value="1" />
      <details className="text-sm">
        <summary className="cursor-pointer text-[13px] font-medium text-muted hover:text-ink">{t("md.lh.layout")}</summary>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label={t("md.lh.top")} name="layoutTop" type="number" min={20} max={400} defaultValue={v.top} />
          <Field label={t("md.lh.bottom")} name="layoutBottom" type="number" min={20} max={400} defaultValue={v.bottom} />
          <Field label={t("md.lh.left")} name="layoutLeft" type="number" min={20} max={250} defaultValue={v.left} />
          <Field label={t("md.lh.right")} name="layoutRight" type="number" min={20} max={250} defaultValue={v.right} />
          <Field label={t("md.lh.size")} name="layoutSize" type="number" min={8} max={18} step={0.5} defaultValue={v.size} />
          <label className="block text-sm"><span className="mb-1.5 block text-[13px] font-medium">{t("md.lh.colour")}</span>
            <input type="color" name="layoutColor" defaultValue={v.color} className="h-10 w-full cursor-pointer rounded-ui border border-line bg-surface p-1" /></label>
          <Field label={t("md.lh.footer")} name="layoutFooter" type="number" min={10} max={120} defaultValue={v.footer} hint={t("md.lh.footerHint")} />
          <label className="col-span-2 flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" name="layoutJustify" defaultChecked={v.justify} /> {t("md.lh.justify")}</label>
        </div>
        <p className="mt-2 text-xs text-muted">{t("md.lh.points")}</p>
      </details>
    </div>
  );
}
