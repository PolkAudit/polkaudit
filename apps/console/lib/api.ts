/**
 * PolkAudit API client for apps/console (account & admin UI).
 * Auth/billing/keys/alerts/admin: JWT (+ X-Project-ID where required).
 */

const STORAGE_KEY = 'polkaudit_api_key_override';

function getApiBaseUrl(): string {
  // Optional override for SSR (e.g. docker-compose). Production: leave unset.
  if (typeof window === 'undefined' && process.env.INTERNAL_API_URL) {
    return process.env.INTERNAL_API_URL;
  }
  return process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';
}

export function getApiBase(): string {
  return getApiBaseUrl();
}

export function getConsoleUrl(): string {
  return (process.env.NEXT_PUBLIC_CONSOLE_URL || 'https://console.polkaudit.xyz').replace(
    /\/$/,
    ''
  );
}

export function getDashboardUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || 'https://app.polkaudit.xyz').replace(/\/$/, '');
}

/** Server-side key (Server Components) — from API_KEY in env. */
function getServerApiKey(): string {
  return process.env.API_KEY || process.env.NEXT_PUBLIC_API_KEY || '';
}

export function getApiKeyOverride(): { key: string; enabled: boolean } {
  if (typeof window === 'undefined') return { key: '', enabled: false };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { key: '', enabled: false };
    return JSON.parse(raw);
  } catch {
    return { key: '', enabled: false };
  }
}

export function setApiKeyOverride(key: string, enabled: boolean) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ key, enabled }));
  window.dispatchEvent(new Event('polkaudit-settings-changed'));
}

export function getEffectiveApiKey(): string {
  if (typeof window !== 'undefined') {
    const override = getApiKeyOverride();
    if (override.enabled && override.key) return override.key;
    return process.env.NEXT_PUBLIC_API_KEY || '';
  }
  return getServerApiKey();
}

export function hasApiKey(): boolean {
  if (getEffectiveApiKey()) return true;
  return !!(process.env.NEXT_PUBLIC_API_KEY || process.env.API_KEY);
}

export async function fetchAPI<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const base = getApiBaseUrl();
  const apiKey = getEffectiveApiKey();
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(apiKey ? { 'X-API-KEY': apiKey } : {}),
    ...(options.headers || {}),
  };

  const res = await fetch(`${base}${endpoint}`, {
    ...options,
    headers,
    cache: 'no-store',
  });

  if (!res.ok) {
    const msg = `API Error: ${res.status} ${res.statusText}`;
    throw new Error(msg);
  }

  return (await res.json()) as T;
}

export async function fetchHealth(): Promise<{ status: string }> {
  const base = getApiBaseUrl().replace('/api/v1', '');
  const res = await fetch(`${base}/health`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Health check failed');
  return (await res.json()) as { status: string };
}

const JWT_STORAGE_KEY = 'polkaudit_jwt';

export function setAuthToken(token: string | null) {
  if (typeof window === 'undefined') return;
  if (token) localStorage.setItem(JWT_STORAGE_KEY, token);
  else localStorage.removeItem(JWT_STORAGE_KEY);
}

export function getAuthToken(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem(JWT_STORAGE_KEY) || '';
}

export function clearSession() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(JWT_STORAGE_KEY);
  localStorage.removeItem('polkaudit_project_id');
}

export async function resolveAndStoreProjectId() {
  if (typeof window === 'undefined') return null;
  try {
    const projects = await authFetch<{ project_id: number }[]>('/api/auth/projects');
    if (projects?.length) {
      localStorage.setItem('polkaudit_project_id', String(projects[0].project_id));
      return projects[0].project_id;
    }
  } catch {
    /* ignore */
  }
  return null;
}

export async function loginWithPassword(email: string, password: string) {
  const base = getApiBaseUrl().replace('/api/v1', '');
  const body = new URLSearchParams();
  body.set('username', email);
  body.set('password', password);
  const res = await fetch(`${base}/api/auth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) throw new Error('Login failed');
  const data = await res.json();
  setAuthToken(data.access_token);
  await resolveAndStoreProjectId();
  return data;
}

function formatApiError(err: any, status: number): string {
  const detail = err?.detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) return detail.map((d: any) => d.msg || JSON.stringify(d)).join('; ');
  if (detail?.msg) return detail.msg;
  if (err?.error) return String(err.error);
  return `Request failed: ${status}`;
}

export async function authFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const base = getApiBaseUrl().replace('/api/v1', '');
  const token = getAuthToken();
  let projectId =
    typeof window !== 'undefined' ? localStorage.getItem('polkaudit_project_id') : null;
  if (!projectId && token && !path.includes('/api/auth/projects')) {
    projectId = String((await resolveAndStoreProjectId()) || '') || null;
  }
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(projectId ? { 'X-Project-ID': projectId } : {}),
    ...(options.headers || {}),
  };
  let res: Response;
  try {
    res = await fetch(`${base}${path}`, { ...options, headers, cache: 'no-store' });
  } catch {
    throw new Error('Cannot reach API (network/HTTPS). Try again in a moment.');
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(formatApiError(err, res.status));
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

function authApiBase(): string {
  return getApiBaseUrl().replace('/api/v1', '');
}

export type AuthUser = {
  id: number;
  email: string;
  role: string;
  is_active: boolean;
  email_verified_at: string | null;
  created_at: string;
};

export async function fetchCurrentUser(): Promise<AuthUser> {
  return authFetch<AuthUser>('/api/auth/me');
}

export async function verifyEmailToken(token: string): Promise<{ message: string }> {
  const res = await fetch(`${authApiBase()}/api/auth/verify-email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(formatApiError(err, res.status));
  }
  return res.json();
}

export async function resendVerification(): Promise<{ message: string }> {
  return authFetch<{ message: string }>('/api/auth/resend-verification', {
    method: 'POST',
    body: '{}',
  });
}

export async function forgotPassword(email: string): Promise<{ message: string }> {
  const res = await fetch(`${authApiBase()}/api/auth/forgot-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(formatApiError(err, res.status));
  }
  return res.json();
}

export async function resetPassword(token: string, password: string): Promise<{ message: string }> {
  const res = await fetch(`${authApiBase()}/api/auth/reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, password }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(formatApiError(err, res.status));
  }
  return res.json();
}

export type CheckoutResult = {
  mode: 'razorpay' | 'manual';
  checkout_url?: string | null;
  contact?: string | null;
  plan_slug?: string | null;
  amount_inr_paise?: number | null;
};

export async function startCheckout(planSlug: 'pilot' | 'pro'): Promise<CheckoutResult> {
  return authFetch<CheckoutResult>('/api/v1/billing/checkout', {
    method: 'POST',
    body: JSON.stringify({ plan_slug: planSlug }),
  });
}

export async function changePassword(
  currentPassword: string,
  newPassword: string
): Promise<{ message: string }> {
  return authFetch<{ message: string }>('/api/auth/change-password', {
    method: 'POST',
    body: JSON.stringify({
      current_password: currentPassword,
      new_password: newPassword,
    }),
  });
}

export type MyProject = {
  project_id: number;
  role: string;
  name: string | null;
  slug: string | null;
};

export async function fetchMyProjects(): Promise<MyProject[]> {
  return authFetch<MyProject[]>('/api/auth/projects');
}

export type ManagedKey = {
  id: number;
  name: string;
  key_prefix: string;
  revoked_at: string | null;
};

export type BillingPlan = {
  slug: string;
  name: string;
  price_inr_paise?: number | null;
  interval?: string | null;
};

export type SubscriptionInfo = {
  status?: string | null;
  plan?: BillingPlan | null;
};

export type AdminUser = {
  id: number;
  email: string;
  role: string;
  is_active: boolean;
  email_verified_at: string | null;
  created_at: string;
};

export type AdminProject = {
  id: number;
  name: string;
  slug: string;
  chain_id: string;
  rpc_url: string;
};

