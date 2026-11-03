import "server-only";
import { redirect } from "next/navigation";
import { api, type Me } from "./api";

/** Sends people without the permission back to the dashboard. The API enforces it too; this keeps dead pages out of sight. */
export async function requireAny(...perms: string[]): Promise<Me> {
  const me = await api<Me>("/me");
  if (!perms.some((p) => me.permissions.includes(p))) redirect("/dashboard");
  return me;
}
