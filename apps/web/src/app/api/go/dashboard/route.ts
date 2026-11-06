import { api, ApiError } from "@/lib/api";

/** Sends the signed-in person to the Developer Dashboard with a signed one-minute token, so they do not sign in again. */
export async function GET(req: Request) {
  const base = process.env.DASHBOARD_URL?.replace(/\/$/, "");
  if (!base) return Response.redirect(new URL("/dashboard", req.url), 303);
  try {
    const r = await api<{ token: string }>("/account/dashboard-token", { body: {} });
    return Response.redirect(`${base}/api/sso/enter?token=${encodeURIComponent(r.token)}`, 303);
  } catch (e) {
    if (!(e instanceof ApiError)) throw e;
    return Response.redirect(base, 303); // the dashboard's own sign-in page
  }
}
