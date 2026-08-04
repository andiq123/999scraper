import { Injectable, signal } from '@angular/core';
import { Product, SortOrder } from '../models';
import { PropertyListingMode } from './search-intent';

const storageKey = '999scraper.search.v6';
const lastStorageKey = '999scraper.search.last.v1';
const maxAge = 12 * 60 * 60 * 1000;

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
  private readonly freshRequest = signal(0);
  readonly freshRequests = this.freshRequest.asReadonly();
  private writeTimer?: number;

  snapshot(): SearchState | null { return this.cached(); }

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

  restoreLast(): SearchState | null {
    const state = this.lastSearch();
    if (!state) return null;
    this.cached.set(state);
    this.write(state);
    return state;
  }

  save(state: SearchState, immediately = false): void {
    this.cached.set(state);
    if (this.writeTimer !== undefined) window.clearTimeout(this.writeTimer);
    if (immediately) return this.write(state);
    // Route navigation uses the in-memory snapshot immediately. Persist the
    // growing streamed list less often because sessionStorage is synchronous.
    this.writeTimer = window.setTimeout(() => this.write(state), 900);
  }

  private write(state: SearchState): void {
    this.writeTimer = undefined;
    writeStoredState(storageKey, state);
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
    && [state.fuel, state.transmission, state.drivetrain, state.bodyType, state.registration ?? null].every(isNullableString)
    && (state.registration === undefined || state.registration === null || state.registration === 'moldova' || state.registration === 'other')
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
