import { getToken } from "@/lib/session";

const BASE = process.env.API_URL ?? "http://localhost:4000";

/** Streams a document PDF from the API using the session cookie, so the browser never sees the API token. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = await getToken();
  if (!token) return new Response("Sign in first", { status: 401 });
  const res = await fetch(`${BASE}/documents/${encodeURIComponent(id)}/pdf`, { headers: { authorization: `Bearer ${token}` }, cache: "no-store" });
  if (!res.ok) return new Response("Document not found", { status: res.status === 401 ? 401 : 404 });
  return new Response(res.body, {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": res.headers.get("content-disposition") ?? "inline",
      "cache-control": "private, no-store",
    },
  });
}
