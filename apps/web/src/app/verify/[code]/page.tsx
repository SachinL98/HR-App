import { Suspense } from "react";
import { api, type VerifyResult } from "@/lib/api";

export const metadata = { title: "Verify a document · HR App" };

async function Result({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const r = await api<VerifyResult>(`/verify/${encodeURIComponent(code.slice(0, 20))}`, { auth: false });
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-10">
      <div className="rounded-ui border border-line bg-surface p-6 text-center">
        <p className="mb-2 text-xs uppercase tracking-wide text-muted">Document check</p>
        {r.valid ? (
          <>
            <h1 className="text-xl font-semibold text-emerald-700">Valid document</h1>
            <p className="mt-3 text-sm">{r.document} issued by <strong>{r.company}</strong> on {new Date(r.issuedAt!).toLocaleDateString("en-GB", { dateStyle: "long" })}.</p>
          </>
        ) : r.revoked ? (
          <>
            <h1 className="text-xl font-semibold text-red-700">This document has been withdrawn</h1>
            <p className="mt-3 text-sm">{r.company} issued it but has since revoked it. Do not rely on it.</p>
          </>
        ) : (
          <>
            <h1 className="text-xl font-semibold text-red-700">Not found</h1>
            <p className="mt-3 text-sm">No document matches the code <code>{code}</code>. Check you typed it correctly.</p>
          </>
        )}
        <p className="mt-5 text-xs text-muted">This page confirms a document is genuine. It shows no personal details.</p>
      </div>
    </main>
  );
}

export default function Verify({ params }: { params: Promise<{ code: string }> }) {
  return (
    <Suspense fallback={<main className="mx-auto flex min-h-screen max-w-md items-center justify-center px-4 text-sm text-muted">Checking…</main>}>
      <Result params={params} />
    </Suspense>
  );
}
