import * as SecureStore from 'expo-secure-store';
import type { OrgTheme } from './theme';

// Android emulators reach the host machine at 10.0.2.2; override with EXPO_PUBLIC_API_URL.
export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000';
// Where the web app lives, for things that are only on the web (forgot password, security settings).
export const WEB_URL = process.env.EXPO_PUBLIC_WEB_URL ?? 'http://localhost:3000';
const KEY = 'hr_token';

// The token goes in the device keychain / keystore, never in plain storage.
export const saveToken = (t: string) => SecureStore.setItemAsync(KEY, t);
export const loadToken = () => SecureStore.getItemAsync(KEY);
export const clearToken = () => SecureStore.deleteItemAsync(KEY);

export class ApiError extends Error {
  constructor(public status: number, message: string, public body?: unknown) {
    super(message);
  }
}

export interface Init { method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'; body?: unknown; token?: string | null }

export async function api<T>(path: string, init: Init = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: init.method ?? (init.body !== undefined ? 'POST' : 'GET'),
      headers: {
        'content-type': 'application/json',
        ...(init.token ? { authorization: `Bearer ${init.token}` } : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'Could not reach the server. Check your connection and try again.');
  }
  const text = await res.text();
  let data: { message?: string | string[] } | null = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = null; }
  if (!res.ok) {
    const m = data?.message;
    throw new ApiError(res.status, Array.isArray(m) ? m.join(', ') : (m ?? res.statusText), data);
  }
  return data as T;
}

/** An API caller bound to the signed-in person's token. */
export type Call = <T>(path: string, init?: Omit<Init, 'token'>) => Promise<T>;

export interface Me {
  id: string; firstName: string; lastName: string; isOwner: boolean; workEmail?: string;
  jobRole: { name: string } | null; permissions: string[];
  account?: { emailVerified: boolean; mfaEnabled: boolean; locale?: string | null };
}
export interface Plan { tier: string; state: 'trial' | 'trial_grace' | 'trial_ended' | 'active' | 'past_due' | 'canceled'; graceEndsAt: string | null; seatLimit: number; seatsUsed: number }
export interface Org extends OrgTheme {
  displayName: string; country: string;
  subscription: { tier: string; status: string; seats: number } | null; trialDaysLeft: number | null; plan: Plan | null;
}
export interface Balance {
  key: string; label: string; entitled: number | null; used: number; pending: number; remaining: number | null;
  carriedLeft: number; carryExpires: string | null; accrual: string; yearly: number | null; period: string;
}
export interface LeaveType { id: string; name: string; active: boolean; allowHalfDay: boolean }
export interface LeaveRequest {
  id: string; type: 'LEAVE' | 'WFH'; status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELED' | 'CHANGES_REQUESTED' | 'DRAFT';
  leaveTypeId: string | null; startDate: string; endDate: string; days: string | null; reason: string | null;
  requester?: { id: string; firstName: string; lastName: string };
  teamOff?: { total: number; off: number; names: string[] } | null;
  actions: { id: string; comment: string | null }[];
}
export interface Task { id: string; title: string; dueDate: string | null; checklist: string; member: { id: string; firstName: string; lastName: string } }
export interface Note { id: string; title: string; body: string | null; readAt: string | null; createdAt: string }
export interface Calendar {
  members: { id: string; firstName: string; lastName: string }[];
  days: { memberId: string; date: string; type: string }[];
}
