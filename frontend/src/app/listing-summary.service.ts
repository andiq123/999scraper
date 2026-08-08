import { Injectable, signal } from '@angular/core';
import { environment } from '../environments/environment';

type CachedSummary = { json: string; expiresAt: number };
type CopyResult = 'copied' | 'ready';
export type BulkDownloadProgress = { completed: number; total: number };

const cacheTTL = 60 * 60 * 1_000;
const maxCachedSummaries = 40;
const recentCopiesKey = '999scraper.recentJsonCopies';
const recentOpensKey = '999scraper.recentOpenedListings';
const maxRecentCopies = 5;
const maxRecentOpens = 5;
const bulkRequestConcurrency = 2;

@Injectable({ providedIn: 'root' })
export class ListingSummaryService {
  private readonly summaries = new Map<string, CachedSummary>();
  private readonly requests = new Map<string, Promise<string>>();
  private readonly recentCopies = signal(readRecentIds(recentCopiesKey, maxRecentCopies));
  private readonly recentOpens = signal(readRecentIds(recentOpensKey, maxRecentOpens));

  rank(id: string): number | null {
    const index = this.recentCopies().indexOf(id);
    return index === -1 ? null : index + 1;
  }

  openRank(id: string): number | null {
    const index = this.recentOpens().indexOf(id);
    return index === -1 ? null : index + 1;
  }

  recordOpen(id: string): void {
    const recent = [id, ...this.recentOpens().filter((item) => item !== id)].slice(0, maxRecentOpens);
    this.recentOpens.set(recent);
    persistRecentIds(recentOpensKey, recent);
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

  async download(ids: readonly string[], onProgress?: (progress: BulkDownloadProgress) => void): Promise<void> {
    if (!ids.length) throw new Error('Select at least one listing.');

    const listings = new Array<unknown>(ids.length);
    let cursor = 0;
    let completed = 0;
    let failure: unknown;
    onProgress?.({ completed, total: ids.length });

    const worker = async (): Promise<void> => {
      while (cursor < ids.length && failure === undefined) {
        const index = cursor++;
        try {
          listings[index] = JSON.parse(await this.summaryJSON(ids[index]));
          onProgress?.({ completed: ++completed, total: ids.length });
        } catch (error) {
          failure = error;
        }
      }
    };

    await Promise.all(Array.from({ length: Math.min(bulkRequestConcurrency, ids.length) }, () => worker()));
    if (failure !== undefined) throw failure;

    const exportedAt = new Date();
    const json = JSON.stringify(
      {
        source: '999.md',
        exportedAt: exportedAt.toISOString(),
        count: listings.length,
        listings,
      },
      null,
      2,
    );
    downloadJSON(json, `999-listings-${fileTimestamp(exportedAt)}.json`);
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
    persistRecentIds(recentCopiesKey, recent);
  }
}

function downloadJSON(json: string, filename: string): void {
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url));
}

function fileTimestamp(date: Date): string {
  return date.toISOString().replace(/[:.]/g, '-');
}

function readRecentIds(key: string, limit: number): string[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? '[]');
    return Array.isArray(value)
      ? value.filter((id): id is string => typeof id === 'string' && /^\d{1,32}$/.test(id)).slice(0, limit)
      : [];
  } catch {
    return [];
  }
}

function persistRecentIds(key: string, ids: readonly string[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(ids));
  } catch {
    // Ranking remains available for the current session when storage is unavailable.
  }
}
