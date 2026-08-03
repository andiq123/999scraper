import { Injectable, inject } from '@angular/core';
import { environment } from '../../environments/environment';
import { Product, SearchFilters } from '../models';
import { AuthService } from '../auth/auth.service';

export interface SearchEvent {
  type: 'start' | 'chunk' | 'done' | 'error';
  products?: Product[];
  loadedPages?: number;
  totalPages?: number;
  message?: string;
}

@Injectable({ providedIn: 'root' })
export class SearchService {
	private readonly auth = inject(AuthService);

  async stream(filters: SearchFilters, signal: AbortSignal, emit: (event: SearchEvent) => void): Promise<void> {
    const response = await fetch(environment.apiUrl + 'products/stream', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(filters),
      signal,
	});
	if (response.status === 401) this.auth.expire();
	if (!response.ok) throw new Error(await this.errorMessage(response));
    if (!response.body) throw new Error('Streaming is unavailable in this browser.');

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let pending = '';
    while (!signal.aborted) {
      const { value, done } = await reader.read();
      pending += decoder.decode(value, { stream: !done });
      const frames = pending.split('\n\n');
      pending = frames.pop() ?? '';
      frames.forEach((frame) => this.emit(frame, emit));
      if (done) break;
    }
    this.emit(pending, emit);
  }

  private emit(frame: string, emit: (event: SearchEvent) => void): void {
    const data = frame.split('\n').find((line) => line.startsWith('data:'))?.slice(5).trim();
    if (data) emit(JSON.parse(data));
  }

  private async errorMessage(response: Response): Promise<string> {
    try {
      return (await response.json()).error || `Search failed (${response.status}).`;
    } catch {
      return `Search failed (${response.status}).`;
    }
  }
}
