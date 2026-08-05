import { Injectable } from '@angular/core';
import { environment } from '../environments/environment';

type CachedSummary = { json: string; expiresAt: number };
type CopyResult = 'copied' | 'ready';

const cacheTTL = 60 * 60 * 1_000;
const maxCachedSummaries = 40;

@Injectable({ providedIn: 'root' })
export class ListingSummaryService {
  private readonly summaries = new Map<string, CachedSummary>();
  private readonly requests = new Map<string, Promise<string>>();

  async copy(id: string): Promise<CopyResult> {
    if (!navigator.clipboard) throw new Error('Clipboard access is unavailable.');

    const cached = this.cachedJSON(id);
    if (cached !== null) {
      await navigator.clipboard.writeText(cached);
      return 'copied';
    }

    if (navigator.clipboard.write && typeof ClipboardItem !== 'undefined') {
      const content = this.summaryJSON(id).then((json) => new Blob([json], { type: 'text/plain' }));
      await navigator.clipboard.write([new ClipboardItem({ 'text/plain': content })]);
      return 'copied';
    }

    await this.summaryJSON(id);
    return 'ready';
  }

  private summaryJSON(id: string): Promise<string> {
    const cached = this.cachedJSON(id);
    if (cached !== null) return Promise.resolve(cached);
    const running = this.requests.get(id);
    if (running) return running;

    const request = fetch(`${environment.apiUrl}products/${encodeURIComponent(id)}/summary`)
      .then(async (response) => {
        if (!response.ok) throw new Error('Could not load listing details.');
        const json = JSON.stringify(await response.json(), null, 2);
        this.cache(id, json);
        return json;
      })
      .finally(() => this.requests.delete(id));
    this.requests.set(id, request);
    return request;
  }

  private cachedJSON(id: string): string | null {
    const cached = this.summaries.get(id);
    if (!cached) return null;
    if (cached.expiresAt <= Date.now()) {
      this.summaries.delete(id);
      return null;
    }
    this.summaries.delete(id);
    this.summaries.set(id, cached);
    return cached.json;
  }

  private cache(id: string, json: string): void {
    this.summaries.delete(id);
    this.summaries.set(id, { json, expiresAt: Date.now() + cacheTTL });
    if (this.summaries.size <= maxCachedSummaries) return;
    const oldest = this.summaries.keys().next().value;
    if (oldest !== undefined) this.summaries.delete(oldest);
  }
}
