export class ApiError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/** Bound ordinary API calls; streams use their own cancellation and completion checks. */
export async function requestJson<T>(url: string, init: RequestInit = {}, timeoutMs = 15_000): Promise<T> {
  const controller = new AbortController();
  let timedOut = false;
  const abort = () => controller.abort(init.signal?.reason);
  if (init.signal?.aborted) abort();
  else init.signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const signal = controller.signal;
  try {
    const response = await fetch(url, { ...init, signal });
    if (!response.ok) {
      const body: unknown = await response.json().catch(() => null);
      const detail = body && typeof body === 'object' && 'error' in body ? body.error : null;
      const fallback =
        response.status >= 500
          ? 'The service is temporarily unavailable. Please try again.'
          : `Request failed (${response.status}).`;
      throw new ApiError(typeof detail === 'string' && detail.trim() ? detail : fallback, response.status);
    }
    if (response.status === 204) return undefined as T;
    try {
      return await response.json();
    } catch (error) {
      if (signal.aborted) throw error;
      throw new Error('The service returned an unreadable response. Please try again.');
    }
  } catch (error) {
    if (init.signal?.aborted) throw error;
    if (timedOut) throw new Error('The connection took too long. Please try again.');
    if (error instanceof TypeError) throw new Error('Couldn’t reach the service. Check your connection and try again.');
    throw error;
  } finally {
    clearTimeout(timer);
    init.signal?.removeEventListener('abort', abort);
  }
}
