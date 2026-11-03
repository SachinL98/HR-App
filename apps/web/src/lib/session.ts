import "server-only";
import { cookies } from "next/headers";

export const COOKIE = "hr_session";

/** The API token lives in an httpOnly cookie, so page scripts can never read it. */
export async function setSession(token: string) {
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 8 * 60 * 60,
  });
}
export async function clearSession() {
  (await cookies()).delete(COOKIE);
}
export async function getToken() {
  return (await cookies()).get(COOKIE)?.value;
}
