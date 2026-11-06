import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getToken } from "./session";

const BASE = process.env.API_URL ?? "http://localhost:4000";

export class ApiError extends Error {
  constructor(public status: number, message: string, public body?: unknown) {
    super(message);
  }
}

export async function api<T = unknown>(
  path: string,
  init: { method?: string; body?: unknown; auth?: boolean } = {},
): Promise<T> {
  const token = init.auth === false ? undefined : await getToken();
  // Pass the visitor's address on, so the API rate-limits each person, not the web server as a whole.
  let ip: string | undefined;
  try {
    const h = await headers();
    ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || undefined;
  } catch { /* not inside a request (e.g. at build time) */ }
  const res = await fetch(`${BASE}${path}`, {
    method: init.method ?? (init.body ? "POST" : "GET"),
    headers: {
      "content-type": "application/json",
      ...(ip ? { "x-forwarded-for": ip } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  });
  if (res.status === 401 && init.auth !== false) {
    // Expired or revoked session (e.g. the member was suspended).
    redirect("/api/session/expired"); // clears the dead cookie, then lands on the login page
  }
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const m = data?.message;
    throw new ApiError(res.status, Array.isArray(m) ? m.join(", ") : (m ?? res.statusText), data);
  }
  return data as T;
}

export interface Me {
  id: string; firstName: string; lastName: string; workEmail: string; isOwner: boolean;
  departmentId: string | null; jobRole: { name: string } | null; permissions: string[]; photoFileId?: string | null;
}
export interface Org {
  id: string; slug: string; displayName: string; legalName: string; country: string; timeZone: string;
  themePrimary: string; themeAccent: string; themeMode: "light" | "dark" | "system"; themeRadius: "sm" | "md" | "lg";
  subscription: { tier: string; status: string; seats: number; trialEndsAt: string | null } | null;
  trialDaysLeft: number | null;
  plan: PlanInfo | null;
}
export type PlanState = "trial" | "trial_grace" | "trial_ended" | "active" | "past_due" | "canceled";
export interface PlanInfo { tier: string; chosen: string; state: PlanState; graceEndsAt: string | null; seatLimit: number; seatsUsed: number }
export interface BillingOverview {
  plan: PlanInfo & { invitesPending: number; overLimit: boolean };
  subscription: { tier: string; status: string; seats: number; interval: string; trialEndsAt: string | null; currentPeriodEnd: string | null };
  features: { tier: string; seats: number | null; items: string[] }[];
}
export interface Member {
  id: string; firstName: string; lastName: string; workEmail: string; status: string; isOwner: boolean;
  departmentId: string | null; jobRoleId: string | null; managerId: string | null;
  employeeNo?: string | null; startDate?: string | null; photoFileId?: string | null;
}
export interface Department { id: string; name: string; parentId: string | null }
export interface JobRole { id: string; name: string; description: string | null; defaultPermissions: string[] }
export interface Grant { action: string; scopeType: "COMPANY" | "DEPARTMENT" | "MEMBER"; scopeIds: string[] }
export interface PendingInvite { id: string; email: string; expiresAt: string }

export interface Balance {
  key: string; label: string; subject: "LEAVE" | "WFH"; leaveTypeId: string | null; period: string;
  periodStart: string; periodEnd: string; entitled: number | null; used: number; pending: number; remaining: number | null;
  yearly: number | null; carriedOver: number; carriedLeft: number; carryExpires: string | null; accrual: "upfront" | "monthly";
}
export interface LeaveType { id: string; name: string; code: string; allowHalfDay: boolean; active: boolean; carryOverMax?: string | number; carryOverExpiryMonths?: number | null; accrual?: "upfront" | "monthly" }
export interface RequestAction { id: string; decision: string; comment: string | null; createdAt: string; actor?: { firstName: string; lastName: string } }
export interface LeaveRequest {
  id: string; type: "LEAVE" | "WFH"; status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELED" | "CHANGES_REQUESTED" | "DRAFT";
  leaveTypeId: string | null; startDate: string; endDate: string; startPart: string; endPart: string; days: string | null;
  reason: string | null; createdAt: string; currentStep: number; actions: RequestAction[];
  requester?: { id: string; firstName: string; lastName: string };
  teamOff?: { total: number; off: number; names: string[] } | null;
}
export interface DelegationItem { id: string; from: { id: string; name: string }; to: { id: string; name: string }; startsOn: string; endsOn: string; active: boolean }
export interface Delegations { given: DelegationItem[]; received: DelegationItem[] }
export interface WorkflowSteps { type: "LEAVE" | "WFH"; steps: { kind: "manager" | "dept_head" | "member" | "permission"; memberId?: string }[]; custom: boolean }
export type DayType = "IN_OFFICE" | "WFH" | "LEAVE" | "HOLIDAY" | "OUT_OF_OFFICE" | "NON_WORKING";
export interface CalendarData {
  workWeek: number[]; timeZone: string;
  members: { id: string; firstName: string; lastName: string; departmentId: string | null }[];
  days: { memberId: string; date: string; part: string; type: DayType; startTime: string | null; endTime: string | null }[];
  holidays: { id: string; name: string; date: string; departmentIds: string[] }[];
}
export interface Quota { id: string; subject: "LEAVE" | "WFH"; leaveTypeId: string | null; period: "MONTH" | "YEAR"; amountDays: string; scopeType: string; scopeId: string | null }
export interface Holiday { id: string; name: string; date: string }

export interface Meeting {
  id: string; title: string; description: string | null; startsAt: string; endsAt: string; timeZone: string;
  location: string | null; meetUrl: string | null; organizerId: string;
  organizer: { id: string; firstName: string; lastName: string };
  attendees: { memberId: string; rsvp: "PENDING" | "YES" | "NO" | "MAYBE"; member: { id: string; firstName: string; lastName: string } }[];
}
export interface Notice {
  id: string; title: string; body: string; important: boolean; requireAck: boolean; publishAt: string;
  authorId: string; readAt: string | null; ackAt: string | null;
}
export interface AppNotification { id: string; event: string; title: string; body: string | null; link: string | null; readAt: string | null; createdAt: string }
export interface NotificationList { items: AppNotification[]; unreadCount: number }

export interface PayGroup { id: string; name: string; currency: string; payDay: number; taxRegime: "uk" | "lk" | null }
export interface PayLine { code: string; label: string; kind: "earning" | "deduction" | "employer"; amount: number }
export interface PayrollRun {
  id: string; periodStart: string; periodEnd: string; status: "DRAFT" | "IN_REVIEW" | "APPROVED" | "FINALIZED";
  ruleVersion: string | null; payGroup: { name: string; currency: string }; _count: { payslips: number };
}
export interface PayrollRunDetail extends Omit<PayrollRun, "_count"> {
  payslips: { id: string; member: { id: string; firstName: string; lastName: string }; gross: number; net: number; unpaidDays: string; lines: PayLine[] }[];
  totals: { gross: number; net: number; employerCost: number };
  people: { preparedBy: string | null; submittedBy: string | null; approvedBy: string | null; finalizedBy: string | null };
  dualControl: boolean; youMustWait: boolean;
  submittedAt: string | null; approvedAt: string | null; finalizedAt: string | null; createdAt: string;
}
export interface SalaryHistory {
  member: { id: string; firstName: string; lastName: string };
  changes: { id: string; at: string; by: string; reason: string | null; effectiveFrom: string; payGroup: { name: string; currency: string } | null; basic: number; components: { code: string; label: string; value: number }[] }[];
}
export interface SalaryRow {
  memberId: string; member: { id: string; firstName: string; lastName: string }; payGroup: { id: string; name: string; currency: string };
  basic: number; components: { code: string; label: string; type: string; value: number; taxable: boolean }[];
  taxProfile: { taxCode?: string; niCategory?: string; pensionOptOut?: boolean; claimRelief?: boolean } | null; effectiveFrom: string;
}
export interface PayslipSummary { id: string; periodStart: string; periodEnd: string; currency: string; net: number }
export interface PayslipDetail {
  id: string; member: { id: string; firstName: string; lastName: string }; periodStart: string; periodEnd: string; currency: string;
  status: string; unpaidDays: string; gross: number; net: number; lines: PayLine[]; ruleVersion: string | null;
}

export interface AccountOverview { email: string; emailVerified: boolean; mfaEnabled: boolean; recoveryCodesLeft: number; mailEnabled: boolean }
export interface SessionItem { id: string; createdAt: string; ip: string | null; userAgent: string | null; current: boolean }
export interface ChecklistItem { title: string; who: "employee" | "manager" | "hr"; dueDays?: number }
export interface ChecklistTemplate { id: string; name: string; kind: "onboarding" | "offboarding"; items: ChecklistItem[] }
export interface MemberChecklist {
  id: string; name: string; kind: string; createdAt: string;
  tasks: { id: string; title: string; who: string; assignee: string | null; dueDate: string | null; doneAt: string | null; canTick: boolean }[];
}
export interface MyTask { id: string; title: string; dueDate: string | null; checklist: string; member: { id: string; firstName: string; lastName: string } }
export interface MemberDoc { id: string; title: string; kind: string; visibleToMember: boolean; createdAt: string }
export interface AuditItem { id: string; action: string; targetType: string | null; targetId: string | null; actor: string; createdAt: string }
export interface DocLayout { top?: number; bottom?: number; left?: number; right?: number; size?: number; color?: string; justify?: boolean; footer?: number }
export interface DocTemplate { id: string; name: string; kind: string; html: string | null; fields: string[]; requestable: boolean; version: number; fileId: string | null; layout: DocLayout | null }
export interface Seal { id: string; kind: "stamp" | "signature"; label: string; signatoryId: string | null; token: string }
export interface IssuedDoc {
  id: string; name: string; kind: string; subject: { id: string; firstName: string; lastName: string };
  issuedAt: string; revokedAt: string | null; verifyCode: string;
}
export interface DocRequest {
  id: string; status: "PENDING" | "APPROVED" | "REJECTED"; reason: string | null; createdAt: string;
  details: { templateId: string; templateName: string; documentId?: string };
  requester?: { id: string; firstName: string; lastName: string };
}
export interface DocPreview { title: string; text: string; missing: string[]; needsStamp: boolean; needsSignatures: string[] }
export interface VerifyResult { valid: boolean; found: boolean; revoked?: boolean; document?: string; company?: string; issuedAt?: string }

export interface Profile {
  firstName: string; lastName: string; preferredName: string; phone: string; email: string;
  employeeNo: string | null; jobRole: string | null; department: string | null; hasPhoto: boolean;
}
