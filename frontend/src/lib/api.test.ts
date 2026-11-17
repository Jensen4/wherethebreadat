import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError } from './api';

afterEach(() => vi.unstubAllGlobals());

describe('API client', () => {
  it('fetches every page rather than truncating financial totals', async () => {
    const first = Array.from({ length: 100 }, (_, id) => ({ id: String(id) }));
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(first)))
      .mockResolvedValueOnce(new Response(JSON.stringify([{ id: 'last' }])));
    vi.stubGlobal('fetch', fetcher);
    const records = await api.paystubs(new AbortController().signal);
    expect(records).toHaveLength(101);
    expect(fetcher.mock.calls[1][0]).toBe('/api/paystubs?limit=100&offset=100');
    expect(fetcher.mock.calls[0][1].credentials).toBe('include');
    expect(fetcher.mock.calls[0][1].headers.Authorization).toBeUndefined();
  });

  it('preserves unauthorized status so the app can clear expired sessions', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ detail: 'Invalid or expired session' }), { status: 401 },
    )));
    await expect(api.payments(new AbortController().signal))
      .rejects.toMatchObject({ status: 401, message: 'Invalid or expired session' });
  });

  it('sends cookie credentials and the preflight-forcing header for login', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'id', email: 'user@example.com', csrf_token: 'csrf' })));
    vi.stubGlobal('fetch', fetcher);
    await api.login('user@example.com', 'password');
    expect(fetcher.mock.calls[0][1].credentials).toBe('include');
    expect(fetcher.mock.calls[0][1].headers['X-CSRF-Protection']).toBe('1');
    expect(fetcher.mock.calls[0][1].headers.Authorization).toBeUndefined();
  });

  it('formats FastAPI validation errors for forms', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ detail: [{ msg: 'A valid date is required' }] }), { status: 422 },
    )));
    await expect(api.login('user@example.com', 'password')).rejects.toThrow('A valid date is required');
  });

  it('handles an empty delete response without attempting to parse JSON', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetcher);
    await expect(api.remove('test-csrf', 'payment', 'record-id')).resolves.toBeUndefined();
    expect(fetcher.mock.calls[0][1].method).toBe('DELETE');
    expect(fetcher.mock.calls[0][1].credentials).toBe('include');
    expect(fetcher.mock.calls[0][1].headers['X-CSRF-Protection']).toBe('1');
    expect(fetcher.mock.calls[0][1].headers['X-CSRF-Token']).toBe('test-csrf');
  });

  it('explains connection errors and keeps cancellation distinct', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(api.login('user@example.com', 'password')).rejects.toThrow('Could not reach the server');
    const abort = new DOMException('Aborted', 'AbortError');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(abort));
    await expect(api.payments(new AbortController().signal)).rejects.toBe(abort);
    expect(new ApiError('Unauthorized', 401)).toBeInstanceOf(Error);
  });
});
