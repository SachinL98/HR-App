"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { api, ApiError, type Grant } from "@/lib/api";
import { clearSession, setSession } from "@/lib/session";
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
const fail = (e: unknown): FormState => ({
  error: e instanceof ApiError ? e.message : "Something went wrong. Please try again.",
});

// ───────── auth ─────────

export async function register(_: FormState, d: FormData): Promise<FormState> {
  const c = COUNTRIES[s(d, "country")] ?? COUNTRIES.GB;
  try {
    const r = await api<{ accessToken: string }>("/auth/register", {
      auth: false,
      body: {
        orgName: s(d, "orgName"), country: s(d, "country") || "GB", timeZone: c.tz, currency: c.cur,
        firstName: s(d, "firstName"), lastName: s(d, "lastName"),
        email: s(d, "email"), password: s(d, "password"),
      },
    });
    await setSession(r.accessToken);
  } catch (e) {
    return fail(e);
  }
  redirect("/dashboard");
}

export async function login(_: FormState, d: FormData): Promise<FormState> {
  try {
    const r = await api<{ accessToken: string }>("/auth/login", {
      auth: false,
      body: { email: s(d, "email"), password: s(d, "password"), tenantSlug: s(d, "tenantSlug") || undefined },
    });
    await setSession(r.accessToken);
  } catch (e) {
    if (e instanceof ApiError && e.status === 409) {
      const opts = (e.body as { options?: { slug: string; name: string }[] })?.options ?? [];
      return { error: `You belong to several organizations. Enter one of these slugs: ${opts.map((o) => o.slug).join(", ")}` };
    }
    return fail(e);
  }
  redirect("/dashboard");
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
  await api(`/departments/${s(d, "id")}`, { method: "DELETE" }).catch(() => {});
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
  await api(`/roles/${s(d, "id")}`, { method: "DELETE" }).catch(() => {});
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

export async function revokeInvite(d: FormData) {
  await api(`/invites/${s(d, "id")}`, { method: "DELETE" }).catch(() => {});
  revalidatePath("/people");
}

export async function updateMember(_: FormState, d: FormData): Promise<FormState> {
  try {
    await api(`/members/${s(d, "id")}`, {
      method: "PATCH",
      body: {
        departmentId: s(d, "departmentId") || null, jobRoleId: s(d, "jobRoleId") || null,
        managerId: s(d, "managerId") || null, status: s(d, "status") || undefined,
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
    await api(`/members/${s(d, "id")}/permissions`, { method: "PUT", body: { grants } });
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/people", "layout");
  return { ok: "Permissions saved." };
}
