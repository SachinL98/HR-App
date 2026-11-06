"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { api, ApiError, type Grant } from "@/lib/api";
import { zonedToUtc } from "@/lib/tz";
import { isLocale, LANG_COOKIE } from "@/lib/i18n";
import { cookies } from "next/headers";
import { clearMfaChallenge, clearSession, getMfaChallenge, setMfaChallenge, setSession } from "@/lib/session";
import type { FormState } from "@/components/action-form";

const COUNTRIES: Record<string, { tz: string; cur: string }> = {
  GB: { tz: "Europe/London", cur: "GBP" },
  LK: { tz: "Asia/Colombo", cur: "LKR" },
  US: { tz: "America/New_York", cur: "USD" },
  IN: { tz: "Asia/Kolkata", cur: "INR" },
  AU: { tz: "Australia/Sydney", cur: "AUD" },
  AE: { tz: "Asia/Dubai", cur: "AED" },
  SG: { tz: "Asia/Singapore", cur: "SGD" },
};

const s = (d: FormData, k: string) => String(d.get(k) ?? "").trim();
/** An id from a form, checked before it goes into an API path. A bad one becomes an id that matches nothing. */
const uid = (d: FormData, k = "id") => (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s(d, k)) ? s(d, k) : "00000000-0000-0000-0000-000000000000");
const RUN_STEPS = new Set(["submit", "approve", "reopen", "finalize", "recompute"]);
const fail = (e: unknown): FormState => ({
  error: e instanceof ApiError ? e.message : "Something went wrong. Please try again.",
});

// ───────── language ─────────

/** Remember the language on this device, and on the person's account when they are signed in. */
export async function setLanguage(lang: string) {
  if (!isLocale(lang)) return;
  (await cookies()).set(LANG_COOKIE, lang, { path: "/", maxAge: 365 * 86400, sameSite: "lax", secure: process.env.NODE_ENV === "production" });
  await api("/account/locale", { method: "PUT", body: { locale: lang } }).catch(() => {}); // not signed in: the cookie is enough
  revalidatePath("/", "layout");
}

/** Light, dark or system, remembered on this device. It overrides the company's default for this person only. */
export async function setMode(mode: string) {
  if (!["light", "dark", "system"].includes(mode)) return;
  (await cookies()).set("hr_mode", mode, { path: "/", maxAge: 365 * 86400, sameSite: "lax", secure: process.env.NODE_ENV === "production" });
  revalidatePath("/", "layout");
}

/** After signing in on a new device, use the language saved on the account. */
async function adoptSavedLanguage() {
  try {
    const me = await api<{ account?: { locale?: string | null } }>("/me");
    const jar = await cookies();
    if (isLocale(me.account?.locale) && !jar.get(LANG_COOKIE))
      jar.set(LANG_COOKIE, me.account.locale, { path: "/", maxAge: 365 * 86400, sameSite: "lax", secure: process.env.NODE_ENV === "production" });
  } catch { /* the default language is fine */ }
}

// ───────── auth ─────────

export async function register(_: FormState, d: FormData): Promise<FormState> {
  const c = COUNTRIES[s(d, "country")] ?? COUNTRIES.GB;
  let needsEmail = false;
  try {
    const r = await api<{ accessToken?: string; verifyEmail?: boolean }>("/auth/register", {
      auth: false,
      body: {
        orgName: s(d, "orgName"), country: s(d, "country") || "GB", timeZone: c.tz, currency: c.cur,
        firstName: s(d, "firstName"), lastName: s(d, "lastName"),
        email: s(d, "email"), password: s(d, "password"),
      },
    });
    // With email set up, the address must be confirmed first, so there is no sign-in yet.
    if (r.verifyEmail || !r.accessToken) needsEmail = true;
    else await setSession(r.accessToken);
  } catch (e) {
    return fail(e);
  }
  redirect(needsEmail ? `/check-email?email=${encodeURIComponent(s(d, "email"))}` : "/dashboard");
}

export async function login(_: FormState, d: FormData): Promise<FormState> {
  let second = false;
  try {
    const r = await api<{ accessToken?: string; mfaRequired?: boolean; challenge?: string }>("/auth/login", {
      auth: false,
      body: { email: s(d, "email"), password: s(d, "password"), tenantSlug: s(d, "tenantSlug") || undefined },
    });
    if (r.mfaRequired && r.challenge) { await setMfaChallenge(r.challenge); second = true; }
    else if (r.accessToken) { await setSession(r.accessToken); await adoptSavedLanguage(); }
  } catch (e) {
    if (e instanceof ApiError && e.status === 409) {
      const opts = (e.body as { options?: { slug: string; name: string }[] })?.options ?? [];
      return { error: `You belong to several organizations. Enter one of these slugs: ${opts.map((o) => o.slug).join(", ")}` };
    }
    return fail(e);
  }
  redirect(second ? "/login/verify" : "/dashboard");
}

/** Second step of a two-factor sign-in. */
export async function loginMfa(_: FormState, d: FormData): Promise<FormState> {
  const challenge = await getMfaChallenge();
  if (!challenge) redirect("/login");
  try {
    const r = await api<{ accessToken: string }>("/auth/mfa", { auth: false, body: { challenge, code: s(d, "code") } });
    await setSession(r.accessToken);
    await adoptSavedLanguage();
    await clearMfaChallenge();
  } catch (e) {
    if (e instanceof ApiError && e.message.includes("took too long")) { await clearMfaChallenge(); redirect("/login"); }
    return fail(e);
  }
  redirect("/dashboard");
}

export async function forgotPassword(_: FormState, d: FormData): Promise<FormState> {
  try {
    const r = await api<{ devLink?: string }>("/auth/forgot-password", { auth: false, body: { email: s(d, "email") } });
    return { ok: "If that email has an account, we have sent a link to reset the password. It works for one hour.", devLink: r.devLink };
  } catch (e) {
    return fail(e);
  }
}

export async function resetPassword(_: FormState, d: FormData): Promise<FormState> {
  if (s(d, "password") !== s(d, "again")) return { error: "The two passwords do not match." };
  try {
    await api("/auth/reset-password", { auth: false, body: { token: s(d, "token"), password: s(d, "password") } });
  } catch (e) {
    return fail(e);
  }
  redirect("/login?reset=1");
}

export async function verifyEmail(_: FormState, d: FormData): Promise<FormState> {
  try {
    await api("/auth/verify-email", { auth: false, body: { token: s(d, "token") } });
  } catch (e) {
    return fail(e);
  }
  redirect("/login?verified=1");
}

export async function resendVerification(_: FormState, d: FormData): Promise<FormState> {
  try {
    const r = await api<{ devLink?: string }>("/auth/verify-email/resend", { auth: false, body: { email: s(d, "email") } });
    return { ok: "If that address still needs confirming, a new link is on its way.", devLink: r.devLink };
  } catch (e) {
    return fail(e);
  }
}

// ───────── my account ─────────

export async function changePassword(_: FormState, d: FormData): Promise<FormState> {
  if (s(d, "next") !== s(d, "again")) return { error: "The two new passwords do not match." };
  try {
    const r = await api<{ otherSessionsEnded: number }>("/account/password", { body: { current: String(d.get("current") ?? ""), next: String(d.get("next") ?? "") } });
    revalidatePath("/account");
    return { ok: r.otherSessionsEnded ? `Password changed. ${r.otherSessionsEnded} other sign-in${r.otherSessionsEnded === 1 ? " was" : "s were"} ended.` : "Password changed." };
  } catch (e) {
    return fail(e);
  }
}

export async function saveProfile(_: FormState, d: FormData): Promise<FormState> {
  try {
    await api("/account/profile", { method: "PUT", body: { preferredName: s(d, "preferredName"), phone: s(d, "phone") } });
    revalidatePath("/account");
    return { ok: "Profile saved." };
  } catch (e) {
    return fail(e);
  }
}

/** The browser crops the photo to a small square JPEG before sending it, so it is only a few tens of KB. */
export async function uploadPhoto(d: FormData): Promise<FormState> {
  const f = d.get("photo");
  if (!(f instanceof Blob) || f.size === 0) return { error: "Choose a photo first." };
  if (f.size > 400_000) return { error: "That photo is too large. Try a smaller one." };
  try {
    await api("/account/photo", { method: "PUT", body: { imageBase64: Buffer.from(await f.arrayBuffer()).toString("base64") } });
    revalidatePath("/", "layout");
    return { ok: "Photo updated." };
  } catch (e) {
    return fail(e);
  }
}

export async function removePhoto(): Promise<FormState> {
  try {
    await api("/account/photo", { method: "DELETE" });
    revalidatePath("/", "layout");
    return { ok: "Photo removed." };
  } catch (e) {
    return fail(e);
  }
}

export async function revokeSession(d: FormData) {
  await api(`/account/sessions/${uid(d)}`, { method: "DELETE" }).catch(() => {});
  revalidatePath("/account");
}

export async function revokeOtherSessions() {
  await api("/account/sessions/revoke-others", { body: {} }).catch(() => {});
  revalidatePath("/account");
}

export async function mfaStart(): Promise<{ qr?: string; secret?: string; error?: string }> {
  try {
    return await api<{ qr: string; secret: string }>("/account/mfa/setup", { body: {} });
  } catch (e) {
    return { error: fail(e).error };
  }
}

export async function mfaEnable(code: string): Promise<{ recoveryCodes?: string[]; error?: string }> {
  try {
    const r = await api<{ recoveryCodes: string[] }>("/account/mfa/enable", { body: { code: code.trim() } });
    revalidatePath("/account");
    return r;
  } catch (e) {
    return { error: fail(e).error };
  }
}

export async function mfaDisable(_: FormState, d: FormData): Promise<FormState> {
  try {
    await api("/account/mfa/disable", { body: { password: String(d.get("password") ?? ""), code: s(d, "code") } });
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/account");
  return { ok: "Two-factor sign-in is off." };
}

export async function acceptInvite(_: FormState, d: FormData): Promise<FormState> {
  try {
    const r = await api<{ accessToken: string }>("/auth/invites/accept", {
      auth: false,
      body: { token: s(d, "token"), firstName: s(d, "firstName"), lastName: s(d, "lastName"), password: s(d, "password") },
    });
    await setSession(r.accessToken);
  } catch (e) {
    return fail(e);
  }
  redirect("/dashboard");
}

export async function logout() {
  // End the sign-in on the server too, so the old token stops working even if it was copied.
  await api("/account/logout", { body: {} }).catch(() => {});
  await clearSession();
  redirect("/login");
}

// ───────── appearance ─────────

export async function saveTheme(_: FormState, d: FormData): Promise<FormState> {
  try {
    await api("/org/theme", {
      method: "PATCH",
      body: {
        themePrimary: s(d, "themePrimary"), themeAccent: s(d, "themeAccent"),
        themeMode: s(d, "themeMode"), themeRadius: s(d, "themeRadius"),
      },
    });
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/", "layout");
  return { ok: "Theme saved. Everyone in your company will see it." };
}

// ───────── people & structure ─────────

export async function createDepartment(_: FormState, d: FormData): Promise<FormState> {
  try {
    await api("/departments", { body: { name: s(d, "name"), parentId: s(d, "parentId") || undefined } });
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/people");
  return { ok: "Department created." };
}

export async function deleteDepartment(d: FormData) {
  await api(`/departments/${uid(d)}`, { method: "DELETE" }).catch(() => {});
  revalidatePath("/people");
}

export async function createRole(_: FormState, d: FormData): Promise<FormState> {
  try {
    await api("/roles", {
      body: { name: s(d, "name"), description: s(d, "description") || undefined, defaultPermissions: d.getAll("perm").map(String) },
    });
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/settings/roles");
  return { ok: "Role created." };
}

export async function deleteRole(d: FormData) {
  await api(`/roles/${uid(d)}`, { method: "DELETE" }).catch(() => {});
  revalidatePath("/settings/roles");
}

export async function inviteMember(_: FormState, d: FormData): Promise<FormState> {
  try {
    const r = await api<{ devLink?: string }>("/invites", {
      body: {
        email: s(d, "email"), departmentId: s(d, "departmentId") || undefined, jobRoleId: s(d, "jobRoleId") || undefined,
      },
    });
    revalidatePath("/people");
    return { ok: "Invite sent.", devLink: r.devLink };
  } catch (e) {
    return fail(e);
  }
}

/** Splits one CSV line, honouring "quoted, values" and "" escapes. */
function csvLine(line: string) {
  const out: string[] = [];
  let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) { if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; }
    else if (ch === '"') q = true;
    else if (ch === ",") { out.push(cur.trim()); cur = ""; }
    else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

const IMPORT_MAX_ROWS = 200;

/** Invites many people from a CSV (columns: email, department, role). Missing departments are created; each row is reported. */
export async function importPeople(_: FormState, d: FormData): Promise<FormState> {
  const f = d.get("file");
  if (!(f instanceof File) || f.size === 0) return { error: "Choose a CSV file." };
  if (f.size > 200_000) return { error: "That file is too large. Split it into smaller files of up to 200 people." };
  const lines = (await f.text()).replace(/^\uFEFF/, "").split(/\r?\n/).filter((l) => l.trim());
  const head = csvLine(lines[0] ?? "").map((h) => h.toLowerCase());
  const col = (n: string) => head.indexOf(n);
  if (col("email") < 0) return { error: "The first row must be a header with at least: email (optional: department, role)." };
  if (lines.length - 1 > IMPORT_MAX_ROWS) return { error: `Too many rows. Import up to ${IMPORT_MAX_ROWS} people at a time.` };
  try {
    const [depts, roles] = await Promise.all([api<{ id: string; name: string }[]>("/departments"), api<{ id: string; name: string }[]>("/roles")]);
    const dept = new Map(depts.map((x) => [x.name.toLowerCase(), x.id]));
    const role = new Map(roles.map((x) => [x.name.toLowerCase(), x.id]));
    let sent = 0;
    const problems: string[] = [];
    for (const [i, line] of lines.slice(1).entries()) {
      const c = csvLine(line);
      const email = (c[col("email")] ?? "").toLowerCase();
      const dn = col("department") >= 0 ? (c[col("department")] ?? "") : "";
      const rn = col("role") >= 0 ? (c[col("role")] ?? "") : "";
      const n = i + 2;
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { problems.push(`Row ${n}: "${email}" is not an email address`); continue; }
      if (rn && !role.has(rn.toLowerCase())) { problems.push(`Row ${n}: there is no job role called "${rn}"`); continue; }
      try {
        if (dn && !dept.has(dn.toLowerCase())) {
          const made = await api<{ id: string }>("/departments", { body: { name: dn } });
          dept.set(dn.toLowerCase(), made.id);
        }
        await api("/invites", { body: { email, departmentId: dn ? dept.get(dn.toLowerCase()) : undefined, jobRoleId: rn ? role.get(rn.toLowerCase()) : undefined } });
        sent++;
      } catch (e) {
        problems.push(`Row ${n}: ${e instanceof ApiError ? e.message : "could not invite"}`);
      }
    }
    revalidatePath("/people", "layout");
    const shown = problems.slice(0, 5).join(" · ");
    const more = problems.length > 5 ? ` · and ${problems.length - 5} more` : "";
    if (sent === 0 && problems.length) return { error: `No invites were sent. ${shown}${more}` };
    return { ok: `${sent} invite${sent === 1 ? "" : "s"} sent.${problems.length ? ` ${problems.length} skipped: ${shown}${more}` : ""}` };
  } catch (e) {
    return fail(e);
  }
}

export async function revokeInvite(d: FormData) {
  await api(`/invites/${uid(d)}`, { method: "DELETE" }).catch(() => {});
  revalidatePath("/people");
}

export async function updateMember(_: FormState, d: FormData): Promise<FormState> {
  try {
    await api(`/members/${uid(d)}`, {
      method: "PATCH",
      body: {
        departmentId: s(d, "departmentId") || null, jobRoleId: s(d, "jobRoleId") || null,
        managerId: s(d, "managerId") || null, status: s(d, "status") || undefined,
        // Used in letters. Empty clears; the National ID is only sent when typed (it is never shown back).
        employeeNo: d.has("employeeNo") ? s(d, "employeeNo") : undefined,
        startDate: d.has("startDate") ? s(d, "startDate") : undefined,
        nationalId: s(d, "nationalId") || undefined,
      },
    });
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/people", "layout");
  return { ok: "Saved." };
}

/** Grants come in as repeated "grant" fields: action|COMPANY or action|DEPARTMENT|id,id */
export async function saveGrants(_: FormState, d: FormData): Promise<FormState> {
  const grants: Grant[] = d.getAll("grant").map((raw) => {
    const [action, scopeType, ids] = String(raw).split("|");
    return { action, scopeType: scopeType as Grant["scopeType"], scopeIds: ids ? ids.split(",") : [] };
  });
  try {
    await api(`/members/${uid(d)}/permissions`, { method: "PUT", body: { grants } });
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/people", "layout");
  return { ok: "Permissions saved." };
}

// ───────── leave, WFH, approvals ─────────

export async function requestTime(_: FormState, d: FormData): Promise<FormState> {
  const type = s(d, "type");
  try {
    await api("/requests", {
      body: {
        type, leaveTypeId: type === "LEAVE" ? s(d, "leaveTypeId") || undefined : undefined,
        startDate: s(d, "startDate"), endDate: s(d, "endDate") || s(d, "startDate"),
        startPart: s(d, "startPart") || undefined, endPart: s(d, "endPart") || undefined,
        reason: s(d, "reason") || undefined,
      },
    });
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/leave");
  return { ok: "Request sent for approval." };
}

export async function cancelRequest(d: FormData) {
  await api(`/requests/${uid(d)}/cancel`, { method: "POST", body: {} }).catch(() => {});
  revalidatePath("/leave");
}

export async function decideRequest(_: FormState, d: FormData): Promise<FormState> {
  try {
    await api(`/requests/${uid(d)}/decision`, { body: { decision: s(d, "decision"), comment: s(d, "comment") || undefined } });
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/approvals");
  return { ok: "Done." };
}

export async function markOutOfOffice(_: FormState, d: FormData): Promise<FormState> {
  try {
    await api("/out-of-office", { body: { date: s(d, "date"), from: s(d, "from"), to: s(d, "to"), reason: s(d, "reason") || undefined } });
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/calendar");
  return { ok: "Marked as out of office." };
}

// ───────── leave policy ─────────

export async function saveQuota(_: FormState, d: FormData): Promise<FormState> {
  try {
    await api("/quotas", {
      method: "PUT",
      body: {
        subject: s(d, "subject"), leaveTypeId: s(d, "leaveTypeId") || undefined, period: s(d, "period"),
        amountDays: Number(s(d, "amountDays")), scopeType: s(d, "scopeType") || "COMPANY", scopeId: s(d, "scopeId") || undefined,
      },
    });
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/settings/leave");
  return { ok: "Quota saved." };
}

export async function addHoliday(_: FormState, d: FormData): Promise<FormState> {
  try {
    await api("/holidays", { body: { holidays: [{ name: s(d, "name"), date: s(d, "date") }] } });
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/settings/leave");
  return { ok: "Holiday added." };
}

export async function deleteHoliday(d: FormData) {
  await api(`/holidays/${uid(d)}`, { method: "DELETE" }).catch(() => {});
  revalidatePath("/settings/leave");
}

// ───────── meetings, notices, notifications ─────────

export async function createMeeting(_: FormState, d: FormData): Promise<FormState> {
  try {
    const org = await api<{ timeZone: string }>("/org");
    const day = s(d, "date");
    await api("/meetings", {
      body: {
        title: s(d, "title"), description: s(d, "description") || undefined, location: s(d, "location") || undefined,
        meetUrl: s(d, "meetUrl") || undefined, timeZone: org.timeZone,
        startsAt: zonedToUtc(day, s(d, "start"), org.timeZone), endsAt: zonedToUtc(day, s(d, "end"), org.timeZone),
        memberIds: d.getAll("memberIds").map(String), departmentIds: d.getAll("departmentIds").map(String),
      },
    });
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/calendar");
  return { ok: "Meeting scheduled. Invitees have been notified." };
}

export async function rsvpMeeting(d: FormData) {
  await api(`/meetings/${uid(d)}/rsvp`, { method: "PUT", body: { rsvp: s(d, "rsvp") } }).catch(() => {});
  revalidatePath("/calendar");
}

export async function cancelMeeting(d: FormData) {
  await api(`/meetings/${uid(d)}`, { method: "DELETE" }).catch(() => {});
  revalidatePath("/calendar");
}

export async function publishNotice(_: FormState, d: FormData): Promise<FormState> {
  const audience = s(d, "audience");
  try {
    await api("/notices", {
      body: {
        title: s(d, "title"), body: s(d, "body"), important: d.get("important") === "on", requireAck: d.get("requireAck") === "on",
        everyone: audience === "all", departmentIds: audience === "all" ? undefined : d.getAll("departmentIds").map(String),
      },
    });
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/notices");
  return { ok: "Notice published." };
}

export async function readNotice(d: FormData) {
  await api(`/notices/${uid(d)}/read`, { body: { acknowledge: d.get("acknowledge") === "1" } }).catch(() => {});
  revalidatePath("/notices");
}

export async function readAllNotifications() {
  await api("/notifications/read-all", { body: {} }).catch(() => {});
  revalidatePath("/notifications");
}

// ───────── payroll ─────────

export async function createPayGroup(_: FormState, d: FormData): Promise<FormState> {
  try {
    await api("/pay-groups", { body: { name: s(d, "name"), payDay: Number(s(d, "payDay")), taxRegime: s(d, "taxRegime") || undefined } });
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/payroll");
  return { ok: "Pay group created." };
}

export async function saveSalary(_: FormState, d: FormData): Promise<FormState> {
  const num = (k: string) => (s(d, k) === "" ? 0 : Number(s(d, k)));
  const components = [
    { code: "TRAVEL", label: "Travel allowance", value: num("travel"), taxable: false },
    { code: "ALLOWANCE", label: "Allowance", value: num("allowance"), taxable: true },
  ].filter((c) => c.value > 0).map((c) => ({ ...c, type: "fixed" }));
  try {
    await api(`/members/${uid(d, "memberId")}/salary`, {
      method: "PUT",
      body: {
        payGroupId: s(d, "payGroupId"), basic: num("basic"), components,
        effectiveFrom: s(d, "effectiveFrom"), reason: s(d, "reason") || undefined,
        taxProfile: {
          ...(s(d, "taxCode") ? { taxCode: s(d, "taxCode").toUpperCase() } : {}),
          ...(s(d, "niCategory") ? { niCategory: s(d, "niCategory") } : {}),
          pensionOptOut: d.get("pensionOptOut") === "on",
          claimRelief: d.get("noRelief") !== "on",
        },
      },
    });
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/payroll/salaries");
  return { ok: "Salary saved." };
}

export async function createRun(_: FormState, d: FormData): Promise<FormState> {
  let id: string;
  try {
    const r = await api<{ id: string }>("/payroll/runs", { body: { payGroupId: s(d, "payGroupId"), month: s(d, "month") } });
    id = r.id;
  } catch (e) {
    return fail(e);
  }
  redirect(`/payroll/runs/${id}`);
}

/** Moves a pay run along and says plainly when a rule stops it (for example, a second person must approve). */
export async function moveRunStep(_: FormState, d: FormData): Promise<FormState> {
  const step = RUN_STEPS.has(s(d, "step")) ? s(d, "step") : "invalid";
  try {
    await api(`/payroll/runs/${uid(d)}/${step}`, { body: {} });
  } catch (e) {
    return fail(e);
  }
  revalidatePath(`/payroll/runs/${uid(d)}`);
  return { ok: "Done." };
}

// ───────── documents ─────────

const LETTERHEAD_MAX = 1_400_000;

/** Reads the Canva export (PNG or PDF) from a form, or says what is wrong with it. */
async function letterheadFrom(d: FormData): Promise<{ base64?: string; error?: string }> {
  const f = d.get("letterhead");
  if (!(f instanceof File) || f.size === 0) return {};
  if (f.size > LETTERHEAD_MAX) return { error: "The letterhead is larger than 1.4 MB. In Canva, export as PNG (standard quality) or a compressed PDF." };
  return { base64: Buffer.from(await f.arrayBuffer()).toString("base64") };
}

const num = (d: FormData, k: string) => { const v = Number(s(d, k)); return Number.isFinite(v) && s(d, k) !== "" ? v : undefined; };

/** Page layout fields come from the "Page layout" section; only sent when that section is on the form. */
function layoutFrom(d: FormData) {
  if (!d.has("hasLayout")) return undefined;
  return {
    top: num(d, "layoutTop"), bottom: num(d, "layoutBottom"), left: num(d, "layoutLeft"), right: num(d, "layoutRight"),
    size: num(d, "layoutSize"), footer: num(d, "layoutFooter"), color: s(d, "layoutColor") || undefined, justify: d.get("layoutJustify") === "on",
  };
}

export async function createTemplate(_: FormState, d: FormData): Promise<FormState> {
  const lh = await letterheadFrom(d);
  if (lh.error) return { error: lh.error };
  try {
    await api("/document-templates", {
      body: {
        name: s(d, "name"), kind: s(d, "kind"), body: String(d.get("body") ?? ""), requestable: d.get("requestable") === "on",
        letterheadBase64: lh.base64, layout: lh.base64 ? layoutFrom(d) : undefined,
      },
    });
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/documents/manage");
  return { ok: "Template saved." };
}

/** Change or remove a template's letterhead, or just move the text around on it. */
export async function updateLetterhead(_: FormState, d: FormData): Promise<FormState> {
  const lh = await letterheadFrom(d);
  if (lh.error) return { error: lh.error };
  try {
    await api(`/document-templates/${uid(d)}`, {
      method: "PATCH",
      body: { letterheadBase64: lh.base64, removeLetterhead: d.get("removeLetterhead") === "on" || undefined, layout: layoutFrom(d) },
    });
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/documents/manage");
  return { ok: "Letterhead updated." };
}

/** Edit a template's name, wording and whether employees can request it. Issued letters are not changed. */
export async function updateTemplate(_: FormState, d: FormData): Promise<FormState> {
  try {
    await api(`/document-templates/${uid(d)}`, {
      method: "PATCH",
      body: { name: s(d, "name"), body: String(d.get("body") ?? ""), requestable: d.get("requestable") === "on" },
    });
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/documents/manage", "layout");
  return { ok: "Saved. Letters you issue from now on use the new wording." };
}

export async function archiveTemplate(d: FormData) {
  await api(`/document-templates/${uid(d)}`, { method: "DELETE" }).catch(() => {});
  revalidatePath("/documents/manage");
}

export async function addSeal(_: FormState, d: FormData): Promise<FormState> {
  const file = d.get("image");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a PNG image." };
  if (file.size > 1_000_000) return { error: "The image is larger than 1 MB." };
  try {
    await api("/seals", {
      body: {
        kind: s(d, "kind"), label: s(d, "label"), signatoryId: s(d, "signatoryId") || undefined,
        imageBase64: Buffer.from(await file.arrayBuffer()).toString("base64"),
      },
    });
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/documents/manage");
  return { ok: "Saved." };
}

export async function removeSeal(d: FormData) {
  await api(`/seals/${uid(d)}`, { method: "DELETE" }).catch(() => {});
  revalidatePath("/documents/manage");
}

export async function issueDocument(_: FormState, d: FormData): Promise<FormState> {
  try {
    await api("/documents", {
      body: {
        templateId: s(d, "templateId"), memberId: s(d, "memberId"), sealIds: d.getAll("sealIds").map(String),
        requestId: s(d, "requestId") || undefined,
      },
    });
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/documents/manage");
  return { ok: "Issued. The person has been notified." };
}

export async function revokeDocument(d: FormData) {
  await api(`/documents/${uid(d)}/revoke`, { body: {} }).catch(() => {});
  revalidatePath("/documents/manage");
}

export async function requestDocument(_: FormState, d: FormData): Promise<FormState> {
  try {
    await api("/document-requests", { body: { templateId: s(d, "templateId"), purpose: s(d, "purpose") || undefined } });
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/documents");
  return { ok: "Request sent." };
}

export async function decideDocRequest(_: FormState, d: FormData): Promise<FormState> {
  try {
    await api(`/document-requests/${uid(d)}/decision`, { body: { decision: s(d, "decision"), comment: s(d, "comment") || undefined } });
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/documents/manage");
  return { ok: "Done." };
}

// ───────── people: checklists and kept documents ─────────

const WHO = new Set(["employee", "manager", "hr"]);

/** One task per line: "Title | who | days", where who is employee, manager or hr and days is optional. */
function parseItems(text: string) {
  const items: { title: string; who: string; dueDays?: number }[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const [title, who = "employee", days] = line.split("|").map((x) => x.trim());
    const w = who.toLowerCase();
    if (!title || !WHO.has(w)) return { error: `"${line.trim()}": write it as  Title | employee, manager or hr | days (optional)` };
    const n = days === undefined || days === "" ? undefined : Number(days);
    if (n !== undefined && (!Number.isInteger(n) || n < 0 || n > 365)) return { error: `"${line.trim()}": days must be a whole number from 0 to 365` };
    items.push({ title, who: w, ...(n !== undefined ? { dueDays: n } : {}) });
  }
  return items.length ? { items } : { error: "Add at least one task." };
}

export async function createChecklistTemplate(_: FormState, d: FormData): Promise<FormState> {
  const parsed = parseItems(String(d.get("items") ?? ""));
  if ("error" in parsed) return { error: parsed.error };
  try {
    await api("/checklist-templates", { body: { name: s(d, "name"), kind: s(d, "kind"), items: parsed.items } });
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/settings/checklists");
  return { ok: "Checklist saved." };
}

export async function archiveChecklistTemplate(d: FormData) {
  await api(`/checklist-templates/${uid(d)}`, { method: "DELETE" }).catch(() => {});
  revalidatePath("/settings/checklists");
}

export async function startChecklist(_: FormState, d: FormData): Promise<FormState> {
  try {
    const r = await api<{ tasks: number }>(`/members/${uid(d, "memberId")}/checklists`, { body: { templateId: s(d, "templateId") } });
    revalidatePath(`/people/${uid(d, "memberId")}`);
    return { ok: `Started with ${r.tasks} tasks. The people involved were told.` };
  } catch (e) {
    return fail(e);
  }
}

export async function tickTask(d: FormData) {
  await api(`/checklist-tasks/${uid(d)}/done`, { body: { done: d.get("done") === "1" } }).catch(() => {});
  revalidatePath("/", "layout");
}

export async function addMemberDocument(_: FormState, d: FormData): Promise<FormState> {
  const f = d.get("file");
  if (!(f instanceof File) || f.size === 0) return { error: "Choose a PDF, PNG or JPEG file." };
  if (f.size > 1_400_000) return { error: "The file is larger than 1.4 MB. Compress it and try again." };
  try {
    await api(`/members/${uid(d, "memberId")}/documents`, {
      body: {
        title: s(d, "title") || f.name, kind: s(d, "kind") || "other", fileName: f.name,
        fileBase64: Buffer.from(await f.arrayBuffer()).toString("base64"), visibleToMember: d.get("visibleToMember") === "on",
      },
    });
  } catch (e) {
    return fail(e);
  }
  revalidatePath(`/people/${uid(d, "memberId")}`);
  return { ok: "Saved." };
}

export async function removeMemberDocument(d: FormData) {
  await api(`/member-documents/${uid(d)}`, { method: "DELETE" }).catch(() => {});
  revalidatePath(`/people/${uid(d, "memberId")}`);
}

// ───────── approvals: cover, steps, calendar feed ─────────

export async function addDelegation(_: FormState, d: FormData): Promise<FormState> {
  try {
    await api("/delegations", { body: { toId: s(d, "toId"), startsOn: s(d, "startsOn"), endsOn: s(d, "endsOn") } });
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/approvals");
  return { ok: "Done. They can now approve in your place on those dates." };
}

export async function endDelegation(d: FormData) {
  await api(`/delegations/${uid(d)}`, { method: "DELETE" }).catch(() => {});
  revalidatePath("/approvals");
}

/** Steps arrive as step1, step2, step3 ("manager", "dept_head" or a member id); "none" ends the chain. */
export async function saveWorkflow(_: FormState, d: FormData): Promise<FormState> {
  const steps: { kind: string; memberId?: string }[] = [];
  for (const k of ["step1", "step2", "step3"]) {
    const v = s(d, k);
    if (!v || v === "none") break;
    if (v === "manager" || v === "dept_head") steps.push({ kind: v });
    else steps.push({ kind: "member", memberId: v });
  }
  if (!steps.length) return { error: "Choose at least one approver." };
  try {
    await api(`/workflows/${s(d, "type") === "wfh" ? "wfh" : "leave"}`, { method: "PUT", body: { steps } });
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/settings/approvals");
  return { ok: "Saved. It applies to new requests." };
}

export async function makeCalendarLink(): Promise<{ url?: string; error?: string }> {
  try {
    const r = await api<{ path: string }>("/calendar-feed", { body: {} });
    return { url: `${process.env.PUBLIC_API_URL ?? process.env.API_URL ?? "http://localhost:4000"}${r.path}` };
  } catch (e) {
    return { error: fail(e).error };
  }
}

export async function stopCalendarLink() {
  await api("/calendar-feed", { method: "DELETE" }).catch(() => {});
  revalidatePath("/calendar");
}

// ───────── search ─────────

export interface SearchHits {
  people: { id: string; name: string; detail: string }[];
  notices: { id: string; title: string }[];
  documents: { id: string; name: string; detail: string }[];
}

/** Used by the command bar as you type. */
export async function searchAll(q: string): Promise<SearchHits> {
  const empty = { people: [], notices: [], documents: [] };
  if (q.trim().length < 2) return empty;
  try {
    return await api<SearchHits>(`/search?q=${encodeURIComponent(q.trim().slice(0, 60))}`);
  } catch {
    return empty;
  }
}

export async function saveLeavePolicy(_: FormState, d: FormData): Promise<FormState> {
  const max = Number(s(d, "carryOverMax") || 0);
  if (!Number.isFinite(max) || max < 0 || max > 60) return { error: "Carry-over must be between 0 and 60 days." };
  try {
    await api(`/leave-types/${uid(d)}/policy`, {
      method: "PATCH",
      body: {
        carryOverMax: max,
        carryOverExpiryMonths: s(d, "carryOverExpiryMonths") ? Number(s(d, "carryOverExpiryMonths")) : null,
        accrual: s(d, "accrual") === "monthly" ? "monthly" : "upfront",
      },
    });
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/settings/leave");
  revalidatePath("/leave");
  return { ok: "Saved. Balances now follow this rule." };
}

export async function saveBankDetails(_: FormState, d: FormData): Promise<FormState> {
  try {
    await api(`/members/${uid(d, "memberId")}/bank`, {
      method: "PUT",
      body: { holder: s(d, "holder"), bank: s(d, "bank"), branch: s(d, "branch") || undefined, account: s(d, "account") },
    });
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/payroll/salaries");
  return { ok: "Bank details saved (encrypted)." };
}
