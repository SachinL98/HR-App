"use client";
import { useState, useTransition } from "react";
import { mfaEnable, mfaStart } from "@/app/actions";
import { Button, Field } from "./ui";

/** Turn on two-factor sign-in: scan the code, confirm one number, save the recovery codes. */
export function MfaSetup() {
  const [step, setStep] = useState<"idle" | "scan" | "done">("idle");
  const [qr, setQr] = useState("");
  const [secret, setSecret] = useState("");
  const [codes, setCodes] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [code, setCode] = useState("");
  const [pending, start] = useTransition();

  if (step === "idle")
    return (
      <div>
        <p className="mb-3 text-sm text-muted">Adds a 6-digit code from an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password, Authy) to every sign-in.</p>
        <Button disabled={pending} onClick={() => start(async () => {
          const r = await mfaStart();
          if (r.error || !r.qr) return setError(r.error ?? "Could not start.");
          setQr(r.qr); setSecret(r.secret ?? ""); setError(""); setStep("scan");
        })}>Set up two-factor sign-in</Button>
        {error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}
      </div>
    );

  if (step === "scan")
    return (
      <div className="space-y-4">
        <ol className="list-decimal space-y-1 pl-5 text-sm">
          <li>Scan this picture with your authenticator app.</li>
          <li>Type the 6-digit code it shows.</li>
        </ol>
        <div className="flex flex-wrap items-center gap-5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr} alt="QR code for your authenticator app" width={176} height={176} className="rounded-ui border border-line bg-white p-2" />
          <div className="text-sm">
            <p className="text-muted">Cannot scan? Type this key instead:</p>
            <p className="mt-1 break-all font-mono text-xs">{secret}</p>
          </div>
        </div>
        <Field label="6-digit code" inputMode="numeric" autoComplete="one-time-code" maxLength={8} value={code} onChange={(e) => setCode(e.target.value)} />
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <Button disabled={pending || code.trim().length < 6} onClick={() => start(async () => {
          const r = await mfaEnable(code);
          if (r.error || !r.recoveryCodes) return setError(r.error ?? "That code is not right.");
          setCodes(r.recoveryCodes); setError(""); setStep("done");
        })}>Turn on</Button>
      </div>
    );

  return (
    <div className="space-y-3">
      <p className="rounded-ui border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300">Two-factor sign-in is on.</p>
      <p className="text-sm"><strong>Save these recovery codes now.</strong> Each works once if you lose your phone. We cannot show them again.</p>
      <ul className="grid grid-cols-2 gap-2 rounded-ui border border-line bg-surface-2 p-4 font-mono text-sm">{codes.map((c) => <li key={c}>{c}</li>)}</ul>
      <Button variant="ghost" onClick={() => void navigator.clipboard?.writeText(codes.join("\n"))}>Copy codes</Button>
    </div>
  );
}
