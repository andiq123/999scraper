import { Injectable, inject, signal } from '@angular/core';
import { environment } from '../environments/environment';
import { AuthService } from './auth/auth.service';
import { Preferences, Product, SavedListing } from './models';

const localWordsKey = '999scraper.excludedWords';

@Injectable({ providedIn: 'root' })
export class UserDataService {
  private readonly auth = inject(AuthService);
  private readonly api = environment.apiUrl;
  readonly saved = signal<SavedListing[]>([]);
  readonly savedIds = signal<ReadonlySet<string>>(new Set());

  async loadExcludedWords(): Promise<string[]> {
    const local = this.localWords();
    if (!await this.auth.restore()) return local;
    try {
      const remote = (await this.request<Preferences>('preferences')).excludedWords;
      const merged = [...new Set([...remote, ...local])];
      if (merged.length !== remote.length) await this.saveExcludedWords(merged);
      return merged;
    } catch {
      return local;
    }
  }

  async saveExcludedWords(words: string[]): Promise<void> {
    localStorage.setItem(localWordsKey, JSON.stringify(words));
    if (!this.auth.session()) return;
    try {
      await this.request<Preferences>('preferences', { method: 'PUT', body: JSON.stringify({ excludedWords: words }) });
    } catch {
      // The local copy stays usable and will merge into the account on the next session.
    }
  }

  async loadSaved(): Promise<void> {
    if (!await this.auth.restore()) return;
    const items = await this.request<SavedListing[]>('saved');
    this.saved.set(items);
    this.savedIds.set(new Set(items.map((item) => item.product.id)));
  }

  async toggleSaved(product: Product): Promise<boolean> {
    if (!this.auth.session()) return false;
    const saved = this.savedIds().has(product.id);
    await this.request<void>(`saved/${encodeURIComponent(product.id)}`, saved ? { method: 'DELETE' } : { method: 'PUT', body: JSON.stringify(product) });
    if (saved) {
      this.saved.update((items) => items.filter((item) => item.product.id !== product.id));
    } else {
      this.saved.update((items) => [{ product, savedAt: new Date().toISOString() }, ...items]);
    }
    this.savedIds.set(new Set(this.saved().map((item) => item.product.id)));
    return true;
  }

  private localWords(): string[] {
    try {
      const value = JSON.parse(localStorage.getItem(localWordsKey) ?? '[]');
      return Array.isArray(value) ? value.filter((word): word is string => typeof word === 'string') : [];
    } catch {
      return [];
    }
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(this.api + path, this.auth.withSession(init));
    if (response.status === 401) this.auth.expire();
    if (!response.ok) throw new Error(`Request failed (${response.status}).`);
    return response.status === 204 ? undefined as T : response.json();
  }
}
