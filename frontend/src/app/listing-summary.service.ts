import { Injectable, signal } from '@angular/core';
import { environment } from '../environments/environment';

type CachedSummary = { json: string; expiresAt: number };
type CopyResult = 'copied' | 'ready';

const cacheTTL = 60 * 60 * 1_000;
const maxCachedSummaries = 40;
const recentCopiesKey = '999scraper.recentJsonCopies';
const maxRecentCopies = 5;

@Injectable({ providedIn: 'root' })
export class ListingSummaryService {
  private readonly summaries = new Map<string, CachedSummary>();
  private readonly requests = new Map<string, Promise<string>>();
  private readonly recentCopies = signal(readRecentCopies());

  rank(id: string): number | null {
    const index = this.recentCopies().indexOf(id);
    return index === -1 ? null : index + 1;
  }

  async copy(id: string): Promise<CopyResult> {
    if (!navigator.clipboard) throw new Error('Clipboard access is unavailable.');

    const cached = this.cachedJSON(id);
    if (cached !== null) {
      await navigator.clipboard.writeText(cached);
      this.recordCopy(id);
      return 'copied';
    }

    if (navigator.clipboard.write && typeof ClipboardItem !== 'undefined') {
      const content = this.summaryJSON(id).then((json) => new Blob([json], { type: 'text/plain' }));
      await navigator.clipboard.write([new ClipboardItem({ 'text/plain': content })]);
      this.recordCopy(id);
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

  private recordCopy(id: string): void {
    const recent = [id, ...this.recentCopies().filter((item) => item !== id)].slice(0, maxRecentCopies);
    this.recentCopies.set(recent);
    try {
      localStorage.setItem(recentCopiesKey, JSON.stringify(recent));
    } catch {
      // Ranking remains available for the current session when storage is unavailable.
    }
  }
}

function readRecentCopies(): string[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const value = JSON.parse(localStorage.getItem(recentCopiesKey) ?? '[]');
    return Array.isArray(value)
      ? value.filter((id): id is string => typeof id === 'string' && /^\d{1,32}$/.test(id)).slice(0, maxRecentCopies)
      : [];
  } catch {
    return [];
  }
}
