import { Injectable, signal } from '@angular/core';
import { Product, SortOrder } from '../models';
import { PropertyListingMode, VehicleOrigin } from './search-intent';

const storageKey = '999scraper.search.v6';
const lastStorageKey = '999scraper.search.last.v1';
const historyEntryPrefix = '999scraper.search.entry.v1.';
const historyIndexKey = '999scraper.search.entries.v1';
const historyStateKey = 'searchEntryId';
const maxAge = 12 * 60 * 60 * 1000;
const maxHistoryEntries = 8;

export interface SearchState {
  query: string;
  activeQuery: string;
  order: SortOrder;
  smartCleanup: boolean;
  excludeNegotiable: boolean;
  onlyWithPhotos: boolean;
  excludedWords: string[];
  excludedWord: string;
  queryExclusions: string[];
  yearFrom: number | null;
  yearTo: number | null;
  priceMin: number | null;
  priceMax: number | null;
  priceCurrency: number | null;
  fuel: string | null;
  transmission: string | null;
  generationFrom: number | null;
  generationTo: number | null;
  storageFrom: number | null;
  storageTo: number | null;
  ramFrom: number | null;
  ramTo: number | null;
  roomsFrom: number | null;
  roomsTo: number | null;
  areaFrom: number | null;
  areaTo: number | null;
  floorFrom: number | null;
  floorTo: number | null;
  propertySector: string;
  propertyState: string | null;
  housingStock: string | null;
  listingAuthor: string | null;
  buildingType: string | null;
  screenFrom: number | null;
  screenTo: number | null;
  mileageFrom: number | null;
  mileageTo: number | null;
  powerFrom: number | null;
  powerTo: number | null;
  drivetrain: string | null;
  bodyType: string | null;
  registration: 'moldova' | 'other' | null;
  originCountry: VehicleOrigin | null;
  deviceTags: string[];
  condition: 'new' | 'used' | null;
  listingMode: PropertyListingMode | null;
  products: Product[];
  searched: boolean;
  loadedPages: number;
  totalPages: number;
  scrollY: number;
  updatedAt: number;
}

@Injectable({ providedIn: 'root' })
export class SearchStateService {
  private readonly cached = signal<SearchState | null>(readStoredState(storageKey));
  readonly lastSearch = signal<SearchState | null>(readStoredState(lastStorageKey));
  private readonly historyEntries = new Map<string, SearchState>();
  private activeHistoryEntry: string | null = null;
  private readonly freshRequest = signal(0);
  readonly freshRequests = this.freshRequest.asReadonly();
  private writeTimer?: number;

  snapshot(): SearchState | null { return this.cached(); }

  attachToCurrentHistoryEntry(): SearchState | null {
    let id = readHistoryEntryId(window.history.state);
    if (!id) {
      id = this.createHistoryEntry();
      window.history.replaceState({ ...window.history.state, [historyStateKey]: id }, document.title);
      return this.cached();
    }
    return this.activateHistoryEntry(id) ?? this.cached();
  }

  createHistoryState(): Record<string, string> {
    return { [historyStateKey]: this.createHistoryEntry() };
  }

  currentHistoryState(): Record<string, string> {
    return this.activeHistoryEntry ? { [historyStateKey]: this.activeHistoryEntry } : {};
  }

  restoreHistoryEntry(browserState: unknown): SearchState | null {
    const id = readHistoryEntryId(browserState);
    return id ? this.activateHistoryEntry(id) : null;
  }

  startFresh(): void {
    if (this.writeTimer !== undefined) window.clearTimeout(this.writeTimer);
    this.writeTimer = undefined;
    const current = this.cached();
    try { sessionStorage.removeItem(storageKey); } catch { /* In-memory state still works. */ }
    if (current && (current.searched || current.query.trim())) {
      this.lastSearch.set(current);
      writeStoredState(lastStorageKey, current);
    }
    this.cached.set(null);
    this.freshRequest.update((value) => value + 1);
  }

  clearAll(): void {
    if (this.writeTimer !== undefined) window.clearTimeout(this.writeTimer);
    this.writeTimer = undefined;
    try {
      sessionStorage.removeItem(storageKey);
      sessionStorage.removeItem(lastStorageKey);
    } catch { /* In-memory state still works. */ }
    this.cached.set(null);
    this.lastSearch.set(null);
  }

  restoreLast(): SearchState | null {
    const state = this.lastSearch();
    if (!state) return null;
    this.cached.set(state);
    this.write(state);
    return state;
  }

  save(state: SearchState, immediately = false): void {
    this.cached.set(state);
    const historyEntry = this.activeHistoryEntry;
    if (historyEntry) this.historyEntries.set(historyEntry, state);
    if (this.writeTimer !== undefined) window.clearTimeout(this.writeTimer);
    if (immediately) return this.write(state, historyEntry);
    // Route navigation uses the in-memory snapshot immediately. Persist the
    // growing streamed list less often because sessionStorage is synchronous.
    this.writeTimer = window.setTimeout(() => this.write(state, historyEntry), 900);
  }

  private write(state: SearchState, historyEntry = this.activeHistoryEntry): void {
    this.writeTimer = undefined;
    writeStoredState(storageKey, state);
    if (historyEntry) writeStoredState(historyEntryPrefix + historyEntry, state);
  }

  private createHistoryEntry(): string {
    const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    this.activeHistoryEntry = id;
    rememberHistoryEntry(id);
    return id;
  }

  private activateHistoryEntry(id: string): SearchState | null {
    this.activeHistoryEntry = id;
    const state = this.historyEntries.get(id) ?? readStoredState(historyEntryPrefix + id);
    if (!state) return null;
    this.historyEntries.set(id, state);
    this.cached.set(state);
    return state;
  }
}

function readHistoryEntryId(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null;
  const id = (value as Record<string, unknown>)[historyStateKey];
  return typeof id === 'string' && /^[a-z0-9-]{8,40}$/.test(id) ? id : null;
}

function rememberHistoryEntry(id: string): void {
  try {
    const stored: unknown = JSON.parse(sessionStorage.getItem(historyIndexKey) ?? '[]');
    const entries = [id, ...(Array.isArray(stored) ? stored.filter((item): item is string => typeof item === 'string' && item !== id) : [])];
    for (const expired of entries.slice(maxHistoryEntries)) sessionStorage.removeItem(historyEntryPrefix + expired);
    sessionStorage.setItem(historyIndexKey, JSON.stringify(entries.slice(0, maxHistoryEntries)));
  } catch {
    // In-memory history still supports Back and Forward for this app session.
  }
}

function readStoredState(key: string): SearchState | null {
  try {
    const value: unknown = JSON.parse(sessionStorage.getItem(key) ?? 'null');
    if (!isSearchState(value) || Date.now() - value.updatedAt > maxAge) {
      sessionStorage.removeItem(key);
      return null;
    }
    return {
      ...value,
      registration: value.registration ?? null,
      originCountry: value.originCountry ?? null,
      listingMode: (value as unknown as { listingMode?: string }).listingMode === 'rent' ? 'monthly' : value.listingMode,
      floorFrom: value.floorFrom ?? null,
      floorTo: value.floorTo ?? null,
      propertySector: value.propertySector ?? '',
      propertyState: value.propertyState ?? null,
      housingStock: value.housingStock ?? null,
      listingAuthor: value.listingAuthor ?? null,
      buildingType: value.buildingType ?? null,
    };
  } catch {
    sessionStorage.removeItem(key);
    return null;
  }
}

function writeStoredState(key: string, state: SearchState): void {
  try {
    sessionStorage.setItem(key, JSON.stringify(state));
  } catch {
    let products = state.products;
    while (products.length > 25) {
      products = products.slice(0, Math.ceil(products.length / 2));
      try {
        sessionStorage.setItem(key, JSON.stringify({ ...state, products }));
        return;
      } catch { /* Try a smaller snapshot. */ }
    }
  }
}

function isSearchState(value: unknown): value is SearchState {
  if (!value || typeof value !== 'object') return false;
  const state = value as Partial<SearchState>;
  return typeof state.query === 'string'
    && typeof state.activeQuery === 'string'
    && typeof state.excludedWord === 'string'
    && (state.order === 'relevance' || state.order === 'priceAsc' || state.order === 'priceDesc')
    && typeof state.smartCleanup === 'boolean'
    && typeof state.excludeNegotiable === 'boolean'
    && typeof state.onlyWithPhotos === 'boolean'
    && typeof state.searched === 'boolean'
    && typeof state.updatedAt === 'number'
    && typeof state.loadedPages === 'number'
    && typeof state.totalPages === 'number'
    && typeof state.scrollY === 'number'
    && [state.yearFrom, state.yearTo, state.priceMin, state.priceMax, state.priceCurrency, state.generationFrom,
      state.generationTo, state.storageFrom, state.storageTo, state.ramFrom, state.ramTo, state.roomsFrom,
      state.roomsTo, state.areaFrom, state.areaTo, state.floorFrom ?? null, state.floorTo ?? null, state.screenFrom, state.screenTo].every(isNullableNumber)
    && [state.mileageFrom, state.mileageTo, state.powerFrom, state.powerTo].every(isNullableNumber)
    && [state.fuel, state.transmission, state.drivetrain, state.bodyType, state.registration ?? null, state.originCountry ?? null].every(isNullableString)
    && (state.registration === undefined || state.registration === null || state.registration === 'moldova' || state.registration === 'other')
    && (state.originCountry === undefined || state.originCountry === null || ['China', 'Coreea', 'Japonia', 'SUA', 'Zona Euro', 'Altă'].includes(state.originCountry))
    && (state.condition === null || state.condition === 'new' || state.condition === 'used')
    && (state.listingMode === null || state.listingMode === 'sale' || (state as unknown as { listingMode?: string }).listingMode === 'rent' || state.listingMode === 'monthly' || state.listingMode === 'daily')
    && (state.propertySector === undefined || typeof state.propertySector === 'string')
    && [state.propertyState ?? null, state.housingStock ?? null, state.listingAuthor ?? null, state.buildingType ?? null].every(isNullableString)
    && isStringArray(state.excludedWords)
    && isStringArray(state.queryExclusions)
    && isStringArray(state.deviceTags)
    && Array.isArray(state.products)
    && state.products.every((product) => product && typeof product.id === 'string' && typeof product.title === 'string');
}

function isNullableNumber(value: unknown): value is number | null { return value === null || typeof value === 'number'; }
function isNullableString(value: unknown): value is string | null { return value === null || typeof value === 'string'; }
function isStringArray(value: unknown): value is string[] { return Array.isArray(value) && value.every((item) => typeof item === 'string'); }
