"use client";
import { createContext, useEffect, useState } from "react";

/** True inside the signed-in app, where successes appear as toasts. */
export const ToastContext = createContext(false);

interface Toast { id: number; text: string; tone: "ok" | "error" }

/** Tell the user something worked, without making them hunt for a message inside a form. */
export function toast(text: string, tone: Toast["tone"] = "ok") {
  window.dispatchEvent(new CustomEvent("app:toast", { detail: { text, tone } }));
}

export function Toaster() {
  const [items, setItems] = useState<Toast[]>([]);
  useEffect(() => {
    let n = 0;
    const on = (e: Event) => {
      const { text, tone } = (e as CustomEvent<{ text: string; tone: Toast["tone"] }>).detail;
      const id = ++n;
      setItems((cur) => [...cur.slice(-2), { id, text, tone }]);
      setTimeout(() => setItems((cur) => cur.filter((t) => t.id !== id)), 5000);
    };
    window.addEventListener("app:toast", on);
    return () => window.removeEventListener("app:toast", on);
  }, []);
  return (
    <div data-toaster aria-live="polite" className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2">
      {items.map((t) => (
        <div key={t.id} role="status" className={`pointer-events-auto flex items-start gap-3 rounded-ui border px-4 py-3 text-sm shadow-[var(--shadow-pop)] ${t.tone === "ok" ? "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200" : "border-red-200 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-200"}`}>
          <span className="flex-1">{t.text}</span>
          <button aria-label="Dismiss" className="opacity-60 hover:opacity-100" onClick={() => setItems((cur) => cur.filter((x) => x.id !== t.id))}>✕</button>
        </div>
      ))}
    </div>
  );
}
