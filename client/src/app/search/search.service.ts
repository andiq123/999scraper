import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, Subscriber } from 'rxjs';
import { environment } from 'src/environments/environment';
import { Filters } from '../shared/models/filters';
import { IProduct } from '../shared/models/product';

export interface SearchStreamEvent {
  type: 'start' | 'chunk' | 'done' | 'error';
  id?: string;
  products?: IProduct[];
  page?: number;
  loadedPages?: number;
  totalPages?: number;
  received?: number;
  total?: number;
  cached?: boolean;
  message?: string;
}

@Injectable({ providedIn: 'root' })
export class SearchService {
  private readonly baseUrl = environment.apiUrl;
  private readonly filtersSource = new BehaviorSubject<Filters>(new Filters());
  readonly filters$ = this.filtersSource.asObservable();

  constructor() {
    const filters = localStorage.getItem('filters');
    if (filters) this.filtersSource.next(JSON.parse(filters));
  }

  streamProducts(): Observable<SearchStreamEvent> {
    const filters = this.filtersSource.getValue();
    localStorage.setItem('filters', JSON.stringify(filters));

    return new Observable<SearchStreamEvent>((subscriber) => {
      const controller = new AbortController();
      void this.consumeStream(filters, controller.signal, subscriber);
      return () => controller.abort();
    });
  }

  updateFilters(filters: Filters): void {
    this.filtersSource.next(filters);
  }

  currentFilters(): Filters {
    return this.filtersSource.getValue();
  }

  addSearchCriteriaToFilters(searchCriteria: string): void {
    const filters = this.filtersSource.getValue();
    if (filters.productSearchCriteria !== searchCriteria) filters.redisId = '';
    filters.productSearchCriteria = searchCriteria;
    this.filtersSource.next(filters);
  }

  private async consumeStream(
    filters: Filters,
    signal: AbortSignal,
    subscriber: Subscriber<SearchStreamEvent>
  ): Promise<void> {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(this.baseUrl + 'products/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(filters),
        signal,
      });
      if (!response.ok) throw new Error(await this.responseError(response));
      if (!response.body) throw new Error('Streaming is not supported by this browser.');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let pending = '';
      while (true) {
        const { value, done } = await reader.read();
        pending += decoder.decode(value, { stream: !done });
        const lines = pending.split('\n');
        pending = lines.pop() ?? '';
        for (const line of lines) this.emit(line, filters, subscriber);
        if (done) break;
      }
      this.emit(pending, filters, subscriber);
      subscriber.complete();
    } catch (error) {
      if (!signal.aborted) {
        subscriber.error(error instanceof Error ? error : new Error('Search failed.'));
      }
    }
  }

  private emit(
    line: string,
    filters: Filters,
    subscriber: Subscriber<SearchStreamEvent>
  ): void {
    if (!line.trim() || subscriber.closed) return;
    const event = JSON.parse(line) as SearchStreamEvent;
    if (event.type === 'start' && event.id) {
      filters.redisId = event.id;
      localStorage.setItem('filters', JSON.stringify(filters));
    }
    subscriber.next(event);
  }

  private async responseError(response: Response): Promise<string> {
    try {
      const body = (await response.json()) as { error?: string };
      return body.error || `Search failed (${response.status}).`;
    } catch {
      return `Search failed (${response.status}).`;
    }
  }
}
