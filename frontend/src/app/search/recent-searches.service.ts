import { Injectable, signal } from '@angular/core';

const storageKey = '999scraper.recentSearches.v1';

@Injectable({ providedIn: 'root' })
export class RecentSearchesService {
  readonly items = signal(read());

  add(query: string): void {
    const normalized = query.trim();
    if (!normalized) return;
    const items = [
      normalized,
      ...this.items().filter((item) => item.toLocaleLowerCase() !== normalized.toLocaleLowerCase()),
    ].slice(0, 8);
    this.items.set(items);
    write(items);
  }

  clear(): void {
    this.items.set([]);
    try {
      localStorage.removeItem(storageKey);
    } catch {
      /* Private browsing can disable storage. */
    }
  }
}

function read(): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(storageKey) ?? '[]');
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string' && item.length <= 160).slice(0, 8)
      : [];
  } catch {
    return [];
  }
}

function write(items: string[]): void {
  try {
    localStorage.setItem(storageKey, JSON.stringify(items));
  } catch {
    /* Recent searches are an optional enhancement. */
  }
}
