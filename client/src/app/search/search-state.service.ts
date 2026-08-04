import { Injectable, signal } from '@angular/core';
import { Product, SortOrder } from '../models';

const storageKey = '999scraper.search.v6';
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
  screenFrom: number | null;
  screenTo: number | null;
  mileageFrom: number | null;
  mileageTo: number | null;
  powerFrom: number | null;
  powerTo: number | null;
  drivetrain: string | null;
  bodyType: string | null;
  deviceTags: string[];
  condition: 'new' | 'used' | null;
  listingMode: 'sale' | 'rent' | null;
  products: Product[];
  searched: boolean;
  loadedPages: number;
  totalPages: number;
  scrollY: number;
  updatedAt: number;
}

@Injectable({ providedIn: 'root' })
export class SearchStateService {
  private readonly cached = signal<SearchState | null>(readStoredState());
  private writeTimer?: number;

  snapshot(): SearchState | null { return this.cached(); }

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
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(state));
    } catch {
      // Keep the complete in-memory cache for route navigation. If browser storage is
      // full, retain as many results as fit so refresh recovery still degrades safely.
      let products = state.products;
      while (products.length > 25) {
        products = products.slice(0, Math.ceil(products.length / 2));
        try {
          sessionStorage.setItem(storageKey, JSON.stringify({ ...state, products }));
          return;
        } catch { /* Try a smaller snapshot. */ }
      }
    }
  }
}

function readStoredState(): SearchState | null {
  try {
    const value: unknown = JSON.parse(sessionStorage.getItem(storageKey) ?? 'null');
    if (!isSearchState(value) || Date.now() - value.updatedAt > maxAge) {
      sessionStorage.removeItem(storageKey);
      return null;
    }
    return value;
  } catch {
    sessionStorage.removeItem(storageKey);
    return null;
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
      state.roomsTo, state.areaFrom, state.areaTo, state.screenFrom, state.screenTo].every(isNullableNumber)
    && [state.mileageFrom, state.mileageTo, state.powerFrom, state.powerTo].every(isNullableNumber)
    && [state.fuel, state.transmission, state.drivetrain, state.bodyType].every(isNullableString)
    && (state.condition === null || state.condition === 'new' || state.condition === 'used')
    && (state.listingMode === null || state.listingMode === 'sale' || state.listingMode === 'rent')
    && isStringArray(state.excludedWords)
    && isStringArray(state.queryExclusions)
    && isStringArray(state.deviceTags)
    && Array.isArray(state.products)
    && state.products.every((product) => product && typeof product.id === 'string' && typeof product.title === 'string');
}

function isNullableNumber(value: unknown): value is number | null { return value === null || typeof value === 'number'; }
function isNullableString(value: unknown): value is string | null { return value === null || typeof value === 'string'; }
function isStringArray(value: unknown): value is string[] { return Array.isArray(value) && value.every((item) => typeof item === 'string'); }
