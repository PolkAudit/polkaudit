function getApiBaseUrl(): string {
  return process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';
}

export function getApiBase(): string {
  return getApiBaseUrl();
}

export function getDashboardUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || 'https://app.polkaudit.xyz').replace(/\/$/, '');
}

const JWT_STORAGE_KEY = 'polkaudit_jwt';
const PROJECT_STORAGE_KEY = 'polkaudit_project_id';

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
  localStorage.removeItem(PROJECT_STORAGE_KEY);
}

function authApiBase(): string {
  return getApiBaseUrl().replace('/api/v1', '');
}

function formatApiError(err: any, status: number): string {
  const detail = err?.detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) return detail.map((d: any) => d.msg || JSON.stringify(d)).join('; ');
  if (detail?.msg) return detail.msg;
  if (err?.error) return String(err.error);
  return `Request failed: ${status}`;
}

export async function resolveAndStoreProjectId() {
  if (typeof window === 'undefined') return null;
  try {
    const projects = await authFetch<{ project_id: number; name?: string; slug?: string }[]>(
      '/api/auth/projects'
    );
    if (projects?.length) {
      localStorage.setItem(PROJECT_STORAGE_KEY, String(projects[0].project_id));
      return projects[0];
    }
  } catch {
    /* ignore */
  }
  return null;
}

export async function authFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const base = authApiBase();
  const token = getAuthToken();
  let projectId =
    typeof window !== 'undefined' ? localStorage.getItem(PROJECT_STORAGE_KEY) : null;
  if (!projectId && token && !path.includes('/api/auth/projects')) {
    const proj = await resolveAndStoreProjectId();
    projectId = proj ? String(proj.project_id) : null;
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

export async function loginWithPassword(email: string, password: string) {
  const body = new URLSearchParams();
  body.set('username', email);
  body.set('password', password);
  const res = await fetch(`${authApiBase()}/api/auth/token`, {
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
