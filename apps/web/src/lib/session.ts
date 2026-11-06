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

/** The first step of a two-factor sign-in waits here (httpOnly, 5 minutes) until the code is entered. */
const MFA_COOKIE = "hr_mfa";
export async function setMfaChallenge(challenge: string) {
  (await cookies()).set(MFA_COOKIE, challenge, {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 5 * 60,
  });
}
export async function getMfaChallenge() {
  return (await cookies()).get(MFA_COOKIE)?.value;
}
export async function clearMfaChallenge() {
  (await cookies()).delete(MFA_COOKIE);
}
