import { TONE } from "@/lib/cal";
import type { DayType } from "@/lib/api";
import type { T } from "@/lib/i18n";

export function dayLabels(t: T): Record<DayType, string> {
  return {
    IN_OFFICE: t("calendar.inOffice"), WFH: t("calendar.wfh"), LEAVE: t("calendar.onLeave"),
    HOLIDAY: t("calendar.holiday"), OUT_OF_OFFICE: t("calendar.outOfOffice"), NON_WORKING: t("calendar.dayOff"),
  };
}

export function StatusLegend({ t }: { t: T }) {
  const items: DayType[] = ["IN_OFFICE", "WFH", "LEAVE", "HOLIDAY", "OUT_OF_OFFICE"];
  const label = dayLabels(t);
  return (
    <ul className="flex flex-wrap gap-2 text-xs">
      {items.map((k) => <li key={k} className={`rounded-full px-2.5 py-1 font-medium ${TONE[k]}`}>{label[k]}</li>)}
    </ul>
  );
}
