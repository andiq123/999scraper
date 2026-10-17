import { Injectable, effect, inject, signal } from '@angular/core';
import { AuthService } from './auth/auth.service';
import { Preferences, Product, SavedListing } from './models';
import { listingBatchSize } from './listing-view';

const localWordsKey = '999scraper.excludedWords';

@Injectable({ providedIn: 'root' })
export class UserDataService {
  private readonly auth = inject(AuthService);
  readonly saved = signal<SavedListing[]>([]);
  readonly savedRenderLimit = signal(listingBatchSize);
  readonly savedIds = signal<ReadonlySet<string>>(new Set());
  readonly savingIds = signal<ReadonlySet<string>>(new Set());

  constructor() {
    let previousAccount: string | null | undefined;
    effect(() => {
      const account = this.auth.session()?.id ?? null;
      if (account === previousAccount) return;
      previousAccount = account;
      this.saved.set([]);
      this.savedIds.set(new Set());
      this.savingIds.set(new Set());
      this.savedRenderLimit.set(listingBatchSize);
    });
  }

  async loadExcludedWords(): Promise<string[]> {
    const local = this.localWords();
    if (!(await this.auth.restore())) return local;
    const account = this.auth.session()?.id;
    try {
      const remote = (await this.request<Preferences>('preferences')).excludedWords;
      if (account !== this.auth.session()?.id) return local;
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
    if (!(await this.auth.restore())) return;
    const account = this.auth.session()?.id;
    const items = await this.request<SavedListing[]>('saved');
    if (this.auth.session()?.id !== account) return;
    this.saved.set(items);
    this.savedIds.set(new Set(items.map((item) => item.product.id)));
  }

  async toggleSaved(product: Product): Promise<boolean> {
    if (!this.auth.session() || this.savingIds().has(product.id)) return false;
    const account = this.auth.session()?.id;
    const saved = this.savedIds().has(product.id);
    this.savingIds.update((ids) => new Set(ids).add(product.id));
    try {
      await this.request<void>(
        `saved/${encodeURIComponent(product.id)}`,
        saved ? { method: 'DELETE' } : { method: 'PUT', body: JSON.stringify(product) },
      );
      if (this.auth.session()?.id !== account) return false;
      this.saved.update((items) => {
        const remaining = items.filter((item) => item.product.id !== product.id);
        return saved ? remaining : [{ product, savedAt: new Date().toISOString() }, ...remaining];
      });
      this.savedIds.set(new Set(this.saved().map((item) => item.product.id)));
      return true;
    } finally {
      if (this.auth.session()?.id === account) {
        this.savingIds.update((ids) => {
          const remaining = new Set(ids);
          remaining.delete(product.id);
          return remaining;
        });
      }
    }
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
    return this.auth.requestPrivate<T>(path, init);
  }
}
