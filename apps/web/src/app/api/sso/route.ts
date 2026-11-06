import { api, ApiError } from "@/lib/api";
import { setSession } from "@/lib/session";

/**
 * Landing spot for single sign-on from the Developer Dashboard: trades its signed one-minute token for an HR session.
 * Anything that goes wrong sends the person to the normal sign-in page.
 */
export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token") ?? "";
  try {
    const r = await api<{ accessToken: string }>("/auth/sso", { auth: false, body: { token } });
    await setSession(r.accessToken);
    return Response.redirect(new URL("/dashboard", req.url), 303);
  } catch (e) {
    if (!(e instanceof ApiError)) throw e;
    return Response.redirect(new URL("/login", req.url), 303);
  }
}
