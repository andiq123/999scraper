import { Injectable, inject } from '@angular/core';
import { environment } from '../../environments/environment';
import { AuthService } from '../auth/auth.service';
import { readSearchStream, type SearchEvent } from './search-stream';
export type { SearchEvent } from './search-stream';

@Injectable({ providedIn: 'root' })
export class SearchService {
  private readonly auth = inject(AuthService);

  async stream(
    query: string,
    extractVINFromDescription: boolean,
    signal: AbortSignal,
    emit: (event: SearchEvent) => void,
  ): Promise<void> {
    const response = await fetch(
      environment.apiUrl + 'products/stream',
      this.auth.withSession({
        method: 'POST',
        body: JSON.stringify({ productSearchCriteria: query, extractVINFromDescription }),
        signal,
      }),
    );
    if (response.status === 401) this.auth.expire();
    if (!response.ok) throw new Error(await this.errorMessage(response));
    if (!response.body) throw new Error('Streaming is unavailable in this browser.');
    if (!response.headers.get('content-type')?.toLowerCase().startsWith('text/event-stream')) {
      throw new Error('The search service returned an invalid stream.');
    }

    await readSearchStream(response.body, signal, emit);
  }

  private async errorMessage(response: Response): Promise<string> {
    try {
      return (await response.json()).error || `Search failed (${response.status}).`;
    } catch {
      return `Search failed (${response.status}).`;
    }
  }
}
