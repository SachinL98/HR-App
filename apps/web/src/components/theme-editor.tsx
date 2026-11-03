"use client";
import { useState } from "react";
import { ActionForm, type FormState } from "./action-form";
import { Card, Select } from "./ui";
import { contrast, readableOn, themeStyle, type OrgTheme } from "@/lib/theme";

const PRESETS: { name: string; primary: string; accent: string }[] = [
  { name: "Indigo", primary: "#3B3FD8", accent: "#14B8A6" },
  { name: "Teal", primary: "#0F766E", accent: "#F59E0B" },
  { name: "Crimson", primary: "#BE123C", accent: "#0EA5E9" },
  { name: "Slate", primary: "#334155", accent: "#22C55E" },
  { name: "Amber", primary: "#B45309", accent: "#6366F1" },
];

export function ThemeEditor({
  initial, action,
}: { initial: OrgTheme; action: (p: FormState, d: FormData) => Promise<FormState> }) {
  const [t, setT] = useState(initial);
  const lowContrast = contrast(t.themePrimary, readableOn(t.themePrimary)) < 4.5;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <ActionForm action={action} submit="Save theme for everyone">
          <div>
            <p className="mb-2 text-sm font-medium">Presets</p>
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((p) => (
                <button type="button" key={p.name} onClick={() => setT({ ...t, themePrimary: p.primary, themeAccent: p.accent })}
                  className="flex items-center gap-2 rounded-ui border border-line px-3 py-1.5 text-sm hover:bg-bg">
                  <span className="h-4 w-4 rounded-full" style={{ background: p.primary }} />
                  <span className="h-4 w-4 rounded-full" style={{ background: p.accent }} />
                  {p.name}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <label className="block text-sm"><span className="mb-1 block font-medium">Primary colour</span>
              <input type="color" name="themePrimary" value={t.themePrimary} onChange={(e) => setT({ ...t, themePrimary: e.target.value.toUpperCase() })} className="h-10 w-full rounded-ui border border-line bg-surface" />
            </label>
            <label className="block text-sm"><span className="mb-1 block font-medium">Accent colour</span>
              <input type="color" name="themeAccent" value={t.themeAccent} onChange={(e) => setT({ ...t, themeAccent: e.target.value.toUpperCase() })} className="h-10 w-full rounded-ui border border-line bg-surface" />
            </label>
          </div>
          {lowContrast && <p role="alert" className="text-sm text-amber-600">This colour is hard to read text on. Pick a darker or lighter shade.</p>}
          <Select label="Appearance" name="themeMode" value={t.themeMode} onChange={(e) => setT({ ...t, themeMode: e.target.value as OrgTheme["themeMode"] })}>
            <option value="system">Match each person&apos;s device</option>
            <option value="light">Always light</option>
            <option value="dark">Always dark</option>
          </Select>
          <Select label="Corner style" name="themeRadius" value={t.themeRadius} onChange={(e) => setT({ ...t, themeRadius: e.target.value as OrgTheme["themeRadius"] })}>
            <option value="sm">Sharp</option>
            <option value="md">Rounded</option>
            <option value="lg">Extra rounded</option>
          </Select>
        </ActionForm>
      </Card>

      <div data-mode={t.themeMode} style={themeStyle(t)} className="rounded-ui border border-line bg-bg p-4 text-ink" aria-label="Preview">
        <p className="mb-3 text-xs font-medium uppercase text-muted">Live preview</p>
        <div className="rounded-ui border border-line bg-surface p-4">
          <div className="mb-3 flex gap-2">
            <span className="rounded-ui bg-primary px-3 py-1.5 text-sm font-medium text-primary-fg">Primary</span>
            <span className="rounded-ui bg-accent px-3 py-1.5 text-sm font-medium text-accent-fg">Accent</span>
            <span className="rounded-ui border border-line px-3 py-1.5 text-sm">Neutral</span>
          </div>
          <p className="font-semibold">Leave request</p>
          <p className="text-sm text-muted">Sam Member · 12 to 14 May · 3 days</p>
          <div className="mt-3 flex gap-2">
            <span className="rounded-ui bg-primary px-3 py-1.5 text-sm text-primary-fg">Approve</span>
            <span className="rounded-ui border border-line px-3 py-1.5 text-sm">Reject</span>
          </div>
        </div>
      </div>
    </div>
  );
}
