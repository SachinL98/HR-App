import { getToken } from "@/lib/session";

const BASE = process.env.API_URL ?? "http://localhost:4000";

/** Streams a payslip PDF using the session cookie, so the browser never sees the API token. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = await getToken();
  if (!token) return new Response("Sign in first", { status: 401 });
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Not found", { status: 404 });
  const res = await fetch(`${BASE}/payslips/${id}/pdf`, { headers: { authorization: `Bearer ${token}` }, cache: "no-store" });
  if (!res.ok) return new Response("Payslip not found", { status: res.status === 401 ? 401 : 404 });
  return new Response(res.body, {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": res.headers.get("content-disposition") ?? "inline",
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
