import type { Session, TripState } from './types';

const BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');
const SESSIONS_KEY = 'saathi:sessions';

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
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or blocked: the app still works online */
  }
}

export const sessions = {
  all: () => read<Record<string, Session>>(SESSIONS_KEY, {}),
  get: (code: string) => sessions.all()[code.toUpperCase()] ?? null,
  set: (code: string, s: Session) => write(SESSIONS_KEY, { ...sessions.all(), [code.toUpperCase()]: s }),
  remove: (code: string) => {
    const all = sessions.all();
    delete all[code.toUpperCase()];
    write(SESSIONS_KEY, all);
  },
};

export const cache = {
  get: (code: string) => read<TripState | null>(`saathi:trip:${code.toUpperCase()}`, null),
  set: (code: string, s: TripState) => write(`saathi:trip:${code.toUpperCase()}`, s),
};

async function request<T>(method: string, path: string, body?: unknown, code?: string): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  const token = code ? sessions.get(code)?.token : undefined;
  if (token) headers['x-member-token'] = token;
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
  if (!res.ok) throw new ApiError(res.status, data.error ?? 'Something went wrong');
  return data as T;
}

const t = (code: string) => `/trips/${encodeURIComponent(code.toUpperCase())}`;

export const api = {
  createTrip: (body: { name: string; leaderName: string; destination?: string; startDate?: string; endDate?: string }) =>
    request<{ code: string; memberId: string; token: string }>('POST', '/trips', body),
  getTrip: (code: string, v?: number) =>
    request<TripState | { unchanged: true }>('GET', `${t(code)}${v ? `?v=${v}` : ''}`),
  join: (code: string, body: { memberId?: string; name?: string }) =>
    request<{ memberId: string; token: string }>('POST', `${t(code)}/join`, body),
  updateTrip: (code: string, body: Record<string, unknown>) => request('PATCH', t(code), body, code),
  addMember: (code: string, body: { name: string; phone?: string }) =>
    request<{ id: string }>('POST', `${t(code)}/members`, body, code),
  updateMember: (code: string, id: string, body: Record<string, unknown>) =>
    request('PATCH', `${t(code)}/members/${id}`, body, code),
  removeMember: (code: string, id: string) => request('DELETE', `${t(code)}/members/${id}`, undefined, code),
  addEntry: (code: string, body: Record<string, unknown>) =>
    request<{ id: string }>('POST', `${t(code)}/entries`, body, code),
  updateEntry: (code: string, id: string, body: Record<string, unknown>) =>
    request('PUT', `${t(code)}/entries/${id}`, body, code),
  deleteEntry: (code: string, id: string) => request('DELETE', `${t(code)}/entries/${id}`, undefined, code),
  addPlace: (code: string, body: Record<string, unknown>) => request('POST', `${t(code)}/places`, body, code),
  updatePlace: (code: string, id: string, body: Record<string, unknown>) =>
    request('PUT', `${t(code)}/places/${id}`, body, code),
  deletePlace: (code: string, id: string) => request('DELETE', `${t(code)}/places/${id}`, undefined, code),
};
