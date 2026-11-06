import { getToken } from "@/lib/session";

const BASE = process.env.API_URL ?? "http://localhost:4000";
const UUID = /^[0-9a-f-]{36}$/i;

/** Shows what a letter will look like (on its letterhead) without issuing it. Nothing is saved. */
export async function GET(req: Request) {
  const token = await getToken();
  if (!token) return new Response("Sign in first", { status: 401 });
  const q = new URL(req.url).searchParams;
  const templateId = q.get("templateId") ?? "";
  const memberId = q.get("memberId") ?? "";
  if (!UUID.test(templateId) || !UUID.test(memberId)) return new Response("Choose a template and a person", { status: 400 });
  const res = await fetch(`${BASE}/documents/preview-pdf`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ templateId, memberId }),
    cache: "no-store",
  });
  if (!res.ok) return new Response("Could not build the preview", { status: res.status === 401 ? 401 : 400 });
  return new Response(res.body, { headers: { "content-type": "application/pdf", "content-disposition": "inline", "cache-control": "private, no-store" } });
}
