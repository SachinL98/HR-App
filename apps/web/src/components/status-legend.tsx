import { LABEL, TONE } from "@/lib/cal";
import type { DayType } from "@/lib/api";

export function StatusLegend() {
  const items: DayType[] = ["IN_OFFICE", "WFH", "LEAVE", "HOLIDAY", "OUT_OF_OFFICE"];
  return (
    <ul className="flex flex-wrap gap-2 text-xs">
      {items.map((t) => <li key={t} className={`rounded-full px-2.5 py-1 font-medium ${TONE[t]}`}>{LABEL[t]}</li>)}
    </ul>
  );
}
