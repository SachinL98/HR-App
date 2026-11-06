import { getToken } from "@/lib/session";

const BASE = process.env.API_URL ?? "http://localhost:4000";
const KINDS = new Set(["summary", "lines", "bank"]);

/** Downloads a payroll run as a spreadsheet (CSV). The API decides who is allowed. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string; kind: string }> }) {
  const { id, kind } = await params;
  const token = await getToken();
  if (!token) return new Response("Sign in first", { status: 401 });
  if (!/^[0-9a-f-]{36}$/i.test(id) || !KINDS.has(kind)) return new Response("Not found", { status: 404 });
  const res = await fetch(`${BASE}/payroll/runs/${id}/export/${kind}`, { headers: { authorization: `Bearer ${token}` }, cache: "no-store" });
  if (!res.ok) {
    // Say why (for example, bank details are missing) in plain words rather than a blank error.
    let why = "This file is not available.";
    try { const j = (await res.json()) as { message?: string | string[] }; why = Array.isArray(j.message) ? j.message.join(", ") : (j.message ?? why); } catch { /* keep the default */ }
    return new Response(why, { status: res.status === 401 ? 401 : res.status === 403 ? 403 : 400, headers: { "content-type": "text/plain; charset=utf-8" } });
  }
  return new Response(res.body, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": res.headers.get("content-disposition") ?? "attachment",
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
