/** REST client. In development Vite proxies /api to the server (same origin, cookie session). */

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly messageKey: string,
    readonly details?: unknown,
  ) {
    super(code);
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? {} : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'network', 'error.network');
  }
  if (res.status === 204) return undefined as T;
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new ApiError(
      res.status,
      String(json.code ?? 'internal'),
      String(json.messageKey ?? 'error.internal'),
      json.details,
    );
  }
  return json as T;
}

export interface Appearance {
  skin: number;
  hair: number;
  outfit: number;
}

export interface Profile {
  id: string;
  name: string;
  regionId: string;
  hp: number;
  appearance: Appearance;
  coins: number;
}

export const api = {
  me: () => request<{ accountId: string; character: Profile | null }>('GET', '/me'),
  register: (email: string, password: string) =>
    request<{ accountId: string }>('POST', '/auth/register', { email, password }),
  login: (email: string, password: string) =>
    request<{ accountId: string }>('POST', '/auth/login', { email, password }),
  logout: () => request<void>('POST', '/auth/logout'),
  createCharacter: (name: string, appearance: Appearance) =>
    request<{ id: string }>('POST', '/characters', { name, appearance }),
  bank: () => request<{ coins: number; items: { itemId: string; qty: number }[] }>('GET', '/bank'),
};
