"use client";
import { useState } from "react";

interface Dept { id: string; name: string }
interface Perm { action: string; label: string }
export interface InitialGrant { action: string; scopeType: "COMPANY" | "DEPARTMENT" | "MEMBER"; scopeIds: string[] }

type Mode = "none" | "company" | "departments";

/** Lets an admin hand out powers company-wide or for chosen departments. Emits hidden "grant" fields. */
export function GrantEditor({ perms, departments, initial }: { perms: Perm[]; departments: Dept[]; initial: InitialGrant[] }) {
  const start = (action: string): { mode: Mode; ids: string[] } => {
    const g = initial.find((x) => x.action === action);
    if (!g) return { mode: "none", ids: [] };
    return g.scopeType === "COMPANY" ? { mode: "company", ids: [] } : { mode: "departments", ids: g.scopeIds };
  };
  const [state, setState] = useState(() => Object.fromEntries(perms.map((p) => [p.action, start(p.action)])));
  // Member-scoped grants are kept as they are; the editor only manages company and department scope.
  const kept = initial.filter((g) => g.scopeType === "MEMBER");

  const emit = perms.flatMap((p) => {
    const s = state[p.action];
    if (s.mode === "company") return [`${p.action}|COMPANY|`];
    if (s.mode === "departments" && s.ids.length) return [`${p.action}|DEPARTMENT|${s.ids.join(",")}`];
    return [];
  });

  return (
    <div className="space-y-3">
      {emit.map((v) => <input key={v} type="hidden" name="grant" value={v} />)}
      {kept.map((g) => <input key={g.action + "m"} type="hidden" name="grant" value={`${g.action}|MEMBER|${g.scopeIds.join(",")}`} />)}
      {perms.map((p) => {
        const s = state[p.action];
        return (
          <fieldset key={p.action} className="rounded-ui border border-line bg-surface-2 p-3">
            <legend className="px-1 text-[13px] font-semibold">{p.label}</legend>
            <div className="flex flex-wrap gap-4 text-sm">
              {(["none", "company", "departments"] as Mode[]).map((m) => (
                <label key={m} className="flex cursor-pointer items-center gap-1.5">
                  <input type="radio" name={`mode-${p.action}`} checked={s.mode === m}
                    onChange={() => setState({ ...state, [p.action]: { ...s, mode: m } })} />
                  {m === "none" ? "No" : m === "company" ? "Whole company" : "Selected departments"}
                </label>
              ))}
            </div>
            {s.mode === "departments" && (
              <div className="mt-2 flex flex-wrap gap-3 text-sm">
                {departments.length === 0 && <span className="text-muted">Create a department first.</span>}
                {departments.map((d) => (
                  <label key={d.id} className="flex items-center gap-1.5">
                    <input type="checkbox" checked={s.ids.includes(d.id)}
                      onChange={(e) => setState({ ...state, [p.action]: { ...s, ids: e.target.checked ? [...s.ids, d.id] : s.ids.filter((x) => x !== d.id) } })} />
                    {d.name}
                  </label>
                ))}
              </div>
            )}
          </fieldset>
        );
      })}
    </div>
  );
}
