import { cookies } from "next/headers";
import { COOKIE } from "@/lib/session";

/**
 * Landing spot when the API says a sign-in is no longer valid (ended elsewhere, expired, or the
 * person was suspended). Pages cannot clear cookies while rendering, and the login page sends
 * anyone who still has a cookie back to the dashboard, so without this the browser would loop.
 */
export async function GET(req: Request) {
  (await cookies()).delete(COOKIE);
  return Response.redirect(new URL("/login", req.url), 303);
}
