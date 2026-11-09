/**
 * PolkAudit API client for apps/frontend.
 *
 * - Prefer NEXT_PUBLIC_API_URL (production: https://api.polkaudit.xyz/api/v1).
 * - INTERNAL_API_URL is optional (local Docker / special SSR); leave unset in Vercel
 *   when using the api.polkaudit.xyz Cloud Run custom domain.
 * - Auth uses X-API-KEY (from env or browser override).
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

export interface StatsOverview {
  total_proposals: number;
  total_votes: number;
  total_treasury_spend: string;
  total_blocks_indexed: number;
  total_extrinsics: number;
  last_indexed_block: number;
  last_governance_block?: number;
  governance_lag_blocks?: number;
}

export interface Proposal {
  id: number;
  proposal_index: number;
  block_number: number;
  section: string;
  method: string;
  proposer: string;
  status: string;
}

export interface ProposalDetail extends Proposal {
  description: string | null;
  created_at: string;
  timeline: any[];
  votes: any[];
  outcome: string | null;
  raw: any;
  title: string;
}

export interface TreasurySpend {
  id: number;
  block_number: number;
  beneficiary: string;
  value: string;
}

export interface ActivityItem {
  type: 'proposal' | 'vote' | 'treasury';
  title: string;
  subtitle: string;
  block_number: number;
  href: string;
  status?: string | null;
}

export interface RecentActivity {
  items: ActivityItem[];
  last_indexed_block: number;
  last_governance_block: number;
}

export const api = {
  getStats: () => fetchAPI<StatsOverview>('/stats/overview'),
  getProposals: () => fetchAPI<Proposal[]>('/proposals'),
  getProposalDetail: (id: string | number) => fetchAPI<ProposalDetail>(`/proposals/${id}`),
  getTreasurySpends: () => fetchAPI<TreasurySpend[]>('/treasury/spends'),
  getRecentActivity: (limit = 12) =>
    fetchAPI<RecentActivity>(`/activity/recent?limit=${limit}`),
};

export async function downloadProposalsCsv() {
  const apiKey = getEffectiveApiKey();
  const base = getApiBaseUrl();
  const res = await fetch(`${base}/export/proposals/csv`, {
    headers: apiKey ? { 'X-API-KEY': apiKey } : {},
    cache: 'no-store',
  });
  if (!res.ok) throw new Error('Export failed');
  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `proposals-export-${new Date().toISOString()}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}

export async function downloadOverviewJson() {
  const stats = await api.getStats();
  const blob = new Blob([JSON.stringify(stats, null, 2)], { type: 'application/json' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `overview-data-${new Date().toISOString()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}

export async function downloadTreasuryCsv() {
  const apiKey = getEffectiveApiKey();
  const base = getApiBaseUrl();
  const res = await fetch(`${base}/export/treasury/csv`, {
    headers: apiKey ? { 'X-API-KEY': apiKey } : {},
    cache: 'no-store',
  });
  if (!res.ok) throw new Error('Treasury export failed');
  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `treasury-export-${new Date().toISOString()}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
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
  return data;
}

export async function registerAccount(email: string, password: string) {
  const base = getApiBaseUrl().replace('/api/v1', '');
  let res: Response;
  try {
    res = await fetch(`${base}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
  } catch {
    throw new Error(
      'Cannot reach API. Use https://app.polkaudit.xyz and ensure api.polkaudit.xyz is up.'
    );
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({} as any));
    const detail = err?.detail;
    const msg =
      typeof detail === 'string'
        ? detail
        : Array.isArray(detail)
          ? detail.map((d: any) => d.msg || JSON.stringify(d)).join('; ')
          : detail?.msg || err?.error || 'Registration failed';
    throw new Error(msg);
  }
  return res.json();
}

export async function authFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const base = getApiBaseUrl().replace('/api/v1', '');
  const token = getAuthToken();
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };
  const res = await fetch(`${base}${path}`, { ...options, headers, cache: 'no-store' });
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json() as Promise<T>;
}

