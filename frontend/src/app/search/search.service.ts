import { Injectable, inject } from '@angular/core';
import { environment } from '../../environments/environment';
import { Product } from '../models';
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

  async stream(query: string, signal: AbortSignal, emit: (event: SearchEvent) => void): Promise<void> {
    const response = await fetch(environment.apiUrl + 'products/stream', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productSearchCriteria: query }),
      signal,
	});
	if (response.status === 401) this.auth.expire();
	if (!response.ok) throw new Error(await this.errorMessage(response));
    if (!response.body) throw new Error('Streaming is unavailable in this browser.');
	if (!response.headers.get('content-type')?.toLowerCase().startsWith('text/event-stream')) {
		throw new Error('The search service returned an invalid stream.');
	}

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let pending = '';
    try {
		while (!signal.aborted) {
			const { value, done } = await reader.read();
			pending = (pending + decoder.decode(value, { stream: !done })).replace(/\r\n/g, '\n');
			const frames = pending.split('\n\n');
			pending = frames.pop() ?? '';
			for (const frame of frames) this.emit(frame, emit);
			if (done) break;
		}
		if (pending.trim()) this.emit(pending, emit);
	} finally {
		reader.releaseLock();
	}
  }

  private emit(frame: string, emit: (event: SearchEvent) => void): void {
    const data = frame.split('\n').filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trimStart()).join('\n');
    if (!data) return;
	try {
		emit(JSON.parse(data) as SearchEvent);
	} catch {
		throw new Error('The search service returned a malformed event.');
	}
  }

  private async errorMessage(response: Response): Promise<string> {
    try {
      return (await response.json()).error || `Search failed (${response.status}).`;
    } catch {
      return `Search failed (${response.status}).`;
    }
  }
}
