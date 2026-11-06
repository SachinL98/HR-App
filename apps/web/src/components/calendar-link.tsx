"use client";
import { useState, useTransition } from "react";
import { makeCalendarLink, stopCalendarLink } from "@/app/actions";
import { Button } from "./ui";

/** Creates the secret subscription link. It is shown once, so it can be copied into Google, Outlook or Apple Calendar. */
export function CalendarLink({ exists }: { exists: boolean }) {
  const [url, setUrl] = useState("");
  const [on, setOn] = useState(exists);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-3 text-sm">
      <p className="text-muted">See your meetings, company holidays and your team&apos;s time off inside Google, Outlook or Apple Calendar. It updates by itself.</p>
      {url && (
        <div className="space-y-2">
          <input readOnly value={url} onFocus={(e) => e.currentTarget.select()} aria-label="Calendar link" className="input font-mono text-xs" />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="ghost" onClick={() => { void navigator.clipboard?.writeText(url); setCopied(true); }}>{copied ? "Copied" : "Copy link"}</Button>
          </div>
          <p className="text-xs text-muted">In Google Calendar choose <strong>Other calendars → From URL</strong>. In Outlook choose <strong>Add calendar → Subscribe from web</strong>. Keep this link private: anyone with it can see this calendar. You will not be shown it again.</p>
        </div>
      )}
      {error && <p role="alert" className="text-red-600">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={pending} onClick={() => start(async () => {
          const r = await makeCalendarLink();
          if (r.error || !r.url) return setError(r.error ?? "Could not create the link.");
          setError(""); setUrl(r.url); setOn(true); setCopied(false);
        })}>{on ? "Create a new link" : "Create my calendar link"}</Button>
        {on && <Button size="sm" variant="danger" disabled={pending} onClick={() => start(async () => { await stopCalendarLink(); setOn(false); setUrl(""); })}>Turn off</Button>}
      </div>
      {on && !url && <p className="text-xs text-muted">A link is active. Creating a new one stops the old one.</p>}
    </div>
  );
}
