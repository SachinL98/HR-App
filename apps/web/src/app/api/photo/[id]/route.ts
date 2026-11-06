import { getToken } from "@/lib/session";

const BASE = process.env.API_URL ?? "http://localhost:4000";

/** Serves a colleague's photo. The API needs the sign-in token, which the browser cannot send, so this passes it along. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const token = await getToken();
  if (!token || !/^[0-9a-f-]{36}$/i.test(id)) return new Response(null, { status: 404 });
  const res = await fetch(`${BASE}/members/${id}/photo`, { headers: { authorization: `Bearer ${token}` }, cache: "no-store" });
  if (!res.ok) return new Response(null, { status: 404 });
  return new Response(res.body, {
    headers: {
      "content-type": res.headers.get("content-type") ?? "image/jpeg",
      // The link carries the photo's id, which changes with every new photo, so it can be cached hard.
      "cache-control": "private, max-age=86400, immutable",
      "x-content-type-options": "nosniff",
    },
  });
}
