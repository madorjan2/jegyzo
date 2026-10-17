const BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? 'http://localhost:4000/api';

export class ApiRequestError extends Error {
  readonly code: string;
  readonly messageEn: string;
  constructor(code: string, message: string, messageEn: string) {
    super(message);
    this.code = code;
    this.messageEn = messageEn;
  }
}

function langHeader(): string {
  return localStorage.getItem('locale') ?? 'hu';
}

export async function apiFetch(path: string, init?: RequestInit): Promise<unknown> {
  const headers = new Headers(init?.headers);
  headers.set('Accept-Language', langHeader());
  const token = localStorage.getItem('accessToken');
  if (token && !headers.has('Authorization')) headers.set('Authorization', `Bearer ${token}`);
  if (init?.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');

  const res = await fetch(`${BASE_URL}${path}`, { ...init, headers });
  const text = await res.text();
  const payload: unknown = text ? JSON.parse(text) : null;
  if (!res.ok) {
    let code = 'NOT_FOUND', message = 'Hiba', messageEn = 'Error';
    if (payload && typeof payload === 'object' && 'error' in payload) {
      const err = (payload as { error: { code?: unknown; message?: unknown; messageEn?: unknown } }).error;
      if (typeof err.code === 'string') code = err.code;
      if (typeof err.message === 'string') message = err.message;
      if (typeof err.messageEn === 'string') messageEn = err.messageEn;
    }
    throw new ApiRequestError(code, message, messageEn);
  }
  return payload;
}

/**
 * Fetches a binary resource (e.g. the ticket PDF) with the session token and
 * opens it in a new tab. An <a href> cannot send the Authorization header, so
 * the bytes are fetched and turned into an object URL (E8-S4/S5).
 */
export async function apiOpenBlob(path: string, filename?: string): Promise<void> {
  const headers = new Headers();
  headers.set('Accept-Language', langHeader());
  const token = localStorage.getItem('accessToken');
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const res = await fetch(`${BASE_URL}${path}`, { headers });
  if (!res.ok) throw new ApiRequestError('NOT_FOUND', 'Hiba', 'Error');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  if (filename) {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
  } else {
    window.open(url, '_blank', 'noopener');
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
