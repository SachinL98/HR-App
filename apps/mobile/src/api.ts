import * as SecureStore from 'expo-secure-store';
import type { OrgTheme } from './theme';

// Android emulators reach the host machine at 10.0.2.2; override with EXPO_PUBLIC_API_URL.
export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000';
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

export async function api<T>(path: string, init: { body?: unknown; token?: string | null } = {}): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: init.body ? 'POST' : 'GET',
    headers: {
      'content-type': 'application/json',
      ...(init.token ? { authorization: `Bearer ${init.token}` } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const m = data?.message;
    throw new ApiError(res.status, Array.isArray(m) ? m.join(', ') : (m ?? res.statusText), data);
  }
  return data as T;
}

export interface Me { firstName: string; lastName: string; isOwner: boolean; jobRole: { name: string } | null }
export interface Org extends OrgTheme {
  displayName: string; country: string;
  subscription: { tier: string; status: string; seats: number } | null; trialDaysLeft: number | null;
}
export interface Member { id: string }
