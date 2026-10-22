import type { MyTrip, TripState, User } from './types';

const BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or blocked: the app still works online */
  }
}

/** Signed-in account on this device. */
export const auth = {
  get: () => read<{ token: string; user: User } | null>('sajilotrip:auth', null),
  set: (v: { token: string; user: User } | null) => write('sajilotrip:auth', v),
};

/** When each trip was last opened here, so the app can reopen the latest one. */
export const recent = {
  all: () => read<Record<string, number>>('sajilotrip:recent', {}),
  touch: (code: string) => write('sajilotrip:recent', { ...recent.all(), [code.toUpperCase()]: Date.now() }),
  latest: () => Object.entries(recent.all()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null,
};

export const cache = {
  get: (code: string) => read<TripState | null>(`sajilotrip:trip:${code.toUpperCase()}`, null),
  set: (code: string, s: TripState) => write(`sajilotrip:trip:${code.toUpperCase()}`, s),
  drop: (code: string) => write(`sajilotrip:trip:${code.toUpperCase()}`, null),
  trips: () => read<MyTrip[] | null>('sajilotrip:my-trips', null),
  setTrips: (t: MyTrip[]) => write('sajilotrip:my-trips', t),
};

/** Called when the server says the session is gone, so the app can show sign-in. */
let onSignedOut: () => void = () => {};
export const setSignedOutHandler = (fn: () => void) => {
  onSignedOut = fn;
};

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  const token = auth.get()?.token;
  if (token) headers.authorization = `Bearer ${token}`;
  let res: Response;
  try {
    res = await fetch(`${BASE}/api${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "Can't reach the server. Check your connection.");
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && token && !path.startsWith('/auth/')) onSignedOut();
  if (!res.ok) throw new ApiError(res.status, data.error ?? 'Something went wrong');
  return data as T;
}

const t = (code: string) => `/trips/${encodeURIComponent(code.toUpperCase())}`;
type AuthRes = { token: string; user: User };

export const avatarUrl = (id: string) => `${BASE}/api/avatars/${id}`;

export const api = {
  setAvatar: (image: string) => request<{ avatarId: string }>('PUT', '/me/avatar', { image }),
  removeAvatar: () => request('DELETE', '/me/avatar'),
  updateMe: (body: { name: string }) => request('PATCH', '/me', body),
  signup: (body: { phone: string; name: string; password: string }) => request<AuthRes>('POST', '/auth/signup', body),
  login: (body: { phone: string; password: string }) => request<AuthRes>('POST', '/auth/login', body),
  logout: () => request('POST', '/auth/logout', {}),
  myTrips: () => request<{ trips: MyTrip[] }>('GET', '/me/trips'),
  createTrip: (body: { name: string; destination?: string; startDate?: string; endDate?: string; currency?: string }) =>
    request<{ code: string }>('POST', '/trips', body),
  getTrip: (code: string, v?: number) =>
    request<TripState | { unchanged: true }>('GET', `${t(code)}${v ? `?v=${v}` : ''}`),
  join: (code: string, body: { memberId?: string; name?: string }) =>
    request<{ memberId: string }>('POST', `${t(code)}/join`, body),
  updateTrip: (code: string, body: Record<string, unknown>) => request('PATCH', t(code), body),
  deleteTrip: (code: string, confirm: string) => request('DELETE', t(code), { confirm }),
  addMember: (code: string, body: { name: string; phone?: string }) =>
    request<{ id: string; linked: boolean }>('POST', `${t(code)}/members`, body),
  updateMember: (code: string, id: string, body: Record<string, unknown>) =>
    request('PATCH', `${t(code)}/members/${id}`, body),
  setMemberAvatar: (code: string, id: string, image: string | null) =>
    request<{ avatarId: string | null }>('PUT', `${t(code)}/members/${id}/avatar`, { image }),
  removeMember: (code: string, id: string) => request('DELETE', `${t(code)}/members/${id}`),
  addEntry: (code: string, body: Record<string, unknown>) => request<{ id: string }>('POST', `${t(code)}/entries`, body),
  updateEntry: (code: string, id: string, body: Record<string, unknown>) =>
    request('PUT', `${t(code)}/entries/${id}`, body),
  deleteEntry: (code: string, id: string) => request('DELETE', `${t(code)}/entries/${id}`),
  addPlace: (code: string, body: Record<string, unknown>) => request('POST', `${t(code)}/places`, body),
  updatePlace: (code: string, id: string, body: Record<string, unknown>) =>
    request('PUT', `${t(code)}/places/${id}`, body),
  deletePlace: (code: string, id: string) => request('DELETE', `${t(code)}/places/${id}`),
};
