import type { Payment, PaymentInput, Paystub, PaystubInput, Session } from '../types';

const base = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');
// Remove credentials saved by the old JWT client; new credentials are HttpOnly cookies.
try { sessionStorage.removeItem('bread-session'); } catch { /* Storage may be disabled. */ }

export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

async function request<T>(path: string, csrfToken?: string, options: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${base}/api${path}`, {
      ...options,
      credentials: 'include',
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(options.method && options.method !== 'GET' ? { 'X-CSRF-Protection': '1' } : {}),
        ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
      },
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new Error('Could not reach the server. Check that the backend is running and try again.');
  }
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const detail = body?.detail;
    const message = typeof detail === 'string' ? detail
      : Array.isArray(detail) ? detail.map((d: { msg: string }) => d.msg).join('. ')
      : `Request failed (${response.status}). Please try again.`;
    throw new ApiError(message, response.status);
  }
  if (response.status === 204) return undefined as T;
  return response.json();
}

// Fetch every page so summaries include records beyond the API's 100-row limit.
async function listAll<T>(path: string, signal: AbortSignal): Promise<T[]> {
  const records: T[] = [];
  for (let offset = 0; ; offset += 100) {
    const page = await request<T[]>(`${path}?limit=100&offset=${offset}`, undefined, { signal });
    records.push(...page);
    if (page.length < 100) return records;
  }
}

export const api = {
  register: (email: string, password: string) => request('/auth/register', undefined, { method: 'POST', body: JSON.stringify({ email, password }) }),
  login: (email: string, password: string) => request<Session>('/auth/login', undefined, { method: 'POST', body: JSON.stringify({ email, password }) }),
  session: (signal?: AbortSignal) => request<Session>('/auth/session', undefined, { signal }),
  logout: (csrfToken: string) => request<void>('/auth/logout', csrfToken, { method: 'POST' }),
  paystubs: (signal: AbortSignal) => listAll<Paystub>('/paystubs', signal),
  payments: (signal: AbortSignal) => listAll<Payment>('/payments', signal),
  savePaystub: (csrfToken: string, data: PaystubInput, id?: string) => request<Paystub>(`/paystubs${id ? `/${id}` : ''}`, csrfToken, { method: id ? 'PUT' : 'POST', body: JSON.stringify(data) }),
  savePayment: (csrfToken: string, data: PaymentInput, id?: string) => request<Payment>(`/payments${id ? `/${id}` : ''}`, csrfToken, { method: id ? 'PUT' : 'POST', body: JSON.stringify(data) }),
  remove: (csrfToken: string, kind: 'paystub' | 'payment', id: string) => request<void>(`/${kind === 'paystub' ? 'paystubs' : 'payments'}/${id}`, csrfToken, { method: 'DELETE' }),
};
