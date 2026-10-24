import type { NewHeroChoice } from '@abismo/protocol';

/**
 * The game server's HTTP API (accounts and heroes, decision 175). Same origin as the game: in
 * development Vite proxies /api to the server. The session token lives in this browser only.
 */

const SESSION_KEY = 'abismo.session';

export function sessionToken(): string | null {
  try {
    return localStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}

export function setSessionToken(token: string | null) {
  try {
    if (token) localStorage.setItem(SESSION_KEY, token);
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    // Private windows may refuse storage: the session then lasts until the tab closes.
  }
}

/** Error code from the server (e.g. "email_taken"), or "network" when it could not be reached. */
export class ApiError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
  ) {
    super(code);
  }
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = sessionToken();
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      headers: {
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  } catch {
    throw new ApiError('network', 0);
  }
  if (res.status === 204) return undefined as T;
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new ApiError(data.error ?? 'server', res.status);
  return data as T;
}

export interface HeroSummary {
  name: string;
  level: number;
  resets: number;
  classId: string;
}

export interface Me {
  accountId: string;
  identities: { provider: 'guest' | 'password' | 'google'; email: string | null }[];
  hasHero: boolean;
  hero: HeroSummary | null;
  /** A save from a device may still become the account's hero (once per account). */
  canImport: boolean;
}

export interface SessionInfo {
  id: string;
  device: string;
  createdAt: string;
  lastSeen: string;
  current: boolean;
}

export const api = {
  guest: (turnstile?: string) =>
    call<{ token: string }>('POST', '/api/auth/guest', turnstile ? { turnstile } : {}),
  register: (email: string, password: string, turnstile?: string) =>
    call<{ token?: string }>('POST', '/api/auth/register', {
      email,
      password,
      ...(turnstile ? { turnstile } : {}),
    }),
  login: (email: string, password: string) =>
    call<{ token: string }>('POST', '/api/auth/login', { email, password }),
  logout: () => call<void>('POST', '/api/auth/logout'),
  me: () => call<Me>('GET', '/api/auth/me'),
  sessions: () => call<{ sessions: SessionInfo[] }>('GET', '/api/auth/sessions'),
  revokeSession: (id: string) =>
    call<void>('DELETE', `/api/auth/sessions/${encodeURIComponent(id)}`),
  forgot: (email: string) => call<void>('POST', '/api/auth/password/forgot', { email }),
  reset: (token: string, password: string) =>
    call<void>('POST', '/api/auth/password/reset', { token, password }),
  googleStart: () => call<{ url: string }>('POST', '/api/auth/google/start', {}),
  createHero: (hero: NewHeroChoice) => call<{ result: string }>('POST', '/api/heroes', hero),
  exportData: () => call<unknown>('GET', '/api/account/export'),
  deleteAccount: () => call<void>('DELETE', '/api/account', { confirm: 'APAGAR' }),
  importHero: (save: string, replace: boolean) =>
    call<{ result: string }>('POST', '/api/heroes/import', { save, replace }),
};

/**
 * Reads what a redirect left in the address: a session from Google (`#session=`), a Google
 * error (`#auth_error=`) or a password reset link (`?reset=`). Clears it from the bar.
 */
export function takeRedirect(): { resetToken: string | null; authError: string | null } {
  const hash = new URLSearchParams(location.hash.slice(1));
  const query = new URLSearchParams(location.search);
  const session = hash.get('session');
  if (session) setSessionToken(session);
  const resetToken = query.get('reset');
  const authError = hash.get('auth_error');
  if (session || authError || resetToken) {
    query.delete('reset');
    const search = query.toString();
    history.replaceState(null, '', `${location.pathname}${search ? `?${search}` : ''}`);
  }
  return { resetToken, authError };
}
