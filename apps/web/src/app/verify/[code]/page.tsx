import { Suspense } from "react";
import { api, type VerifyResult } from "@/lib/api";

export const metadata = { title: "Verify a document · Seamless Source HR" };

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="flex min-h-screen w-full items-center justify-center px-4 py-10">{children}</main>;
}

async function Result({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const r = await api<VerifyResult>(`/verify/${encodeURIComponent(code.slice(0, 20))}`, { auth: false });
  return (
    <Shell>
      <div className="w-full max-w-md rounded-ui border border-line bg-surface p-8 text-center shadow-[var(--shadow)]">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">Document check</p>
        {r.valid ? (
          <>
            <div aria-hidden className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-2xl text-emerald-700">✓</div>
            <h1 className="text-xl font-semibold text-emerald-700">Valid document</h1>
            <p className="mt-3 text-sm">{r.document} issued by <strong>{r.company}</strong> on {new Date(r.issuedAt!).toLocaleDateString("en-GB", { dateStyle: "long" })}.</p>
          </>
        ) : r.revoked ? (
          <>
            <div aria-hidden className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-2xl text-red-700">!</div>
            <h1 className="text-xl font-semibold text-red-700">This document has been withdrawn</h1>
            <p className="mt-3 text-sm">{r.company} issued it but has since revoked it. Do not rely on it.</p>
          </>
        ) : (
          <>
            <div aria-hidden className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-2xl text-red-700">?</div>
            <h1 className="text-xl font-semibold text-red-700">Not found</h1>
            <p className="mt-3 text-sm">No document matches the code <code>{code}</code>. Check you typed it correctly.</p>
          </>
        )}
        <p className="mt-6 text-xs text-muted">Verified by Seamless Source HR. This page confirms a document is genuine. It shows no personal details.</p>
      </div>
    </Shell>
  );
}

export default function Verify({ params }: { params: Promise<{ code: string }> }) {
  return (
    <Suspense fallback={<Shell><p className="text-sm text-muted">Checking…</p></Shell>}>
      <Result params={params} />
    </Suspense>
  );
}
