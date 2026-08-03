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

  streamProducts(): Observable<SearchStreamEvent> {
	const filters = this.filtersSource.getValue();

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
        const messages = pending.split('\n\n');
        pending = messages.pop() ?? '';
        for (const message of messages) this.emit(message, subscriber);
        if (done) break;
      }
      this.emit(pending, subscriber);
      subscriber.complete();
    } catch (error) {
      if (!signal.aborted) {
        subscriber.error(error instanceof Error ? error : new Error('Search failed.'));
      }
    }
  }

  private emit(
	message: string,
	subscriber: Subscriber<SearchStreamEvent>
  ): void {
    if (!message.trim() || subscriber.closed) return;
    const data = message
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trimStart())
      .join('\n');
    if (!data) return;
    const event = JSON.parse(data) as SearchStreamEvent;
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
