import { signal } from '@angular/core';
import { environment } from '../environments/environment';
import { watchRequests } from './api-request';

const RETRY_EVERY = 5_000;
const PROBE_TIMEOUT = 5_000;
/** What a proxy answers when nothing is listening behind it. */
const GATEWAY_ERRORS = [502, 503, 504];

const reachable = signal(true);
const probing = signal(false);
let retryTimer: ReturnType<typeof setTimeout> | undefined;

/** Whether the last request to the backend got an answer. Nothing is polled while
 *  it does: every ordinary request doubles as the heartbeat. */
export const backendReachable = reachable.asReadonly();
export const probingBackend = probing.asReadonly();

/** Records how a request to the backend ended: an HTTP status, or none when it never answered. */
export function reportBackend(status?: number): void {
  if (status !== undefined && !GATEWAY_ERRORS.includes(status)) {
    reachable.set(true);
    clearTimeout(retryTimer);
    retryTimer = undefined;
    return;
  }
  reachable.set(false);
  retryTimer ??= setTimeout(() => {
    retryTimer = undefined;
    void probeBackend();
  }, RETRY_EVERY);
}

/** Asks the health endpoint whether the backend is back; keeps asking until it is. */
export async function probeBackend(): Promise<void> {
  if (probing()) return;
  if (document.visibilityState !== 'visible' || !navigator.onLine) return reportBackend();
  probing.set(true);
  try {
    const response = await fetch(environment.apiUrl + 'health', {
      credentials: 'omit',
      cache: 'no-store',
      signal: AbortSignal.timeout(PROBE_TIMEOUT),
    });
    reportBackend(response.status);
  } catch {
    reportBackend();
  } finally {
    probing.set(false);
  }
}

watchRequests(reportBackend);
