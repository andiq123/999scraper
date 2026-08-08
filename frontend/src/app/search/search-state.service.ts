import { Injectable, signal } from '@angular/core';
import { Product, QualityThreshold, SortOrder } from '../models';
import { PropertyListingMode, VehicleOrigin } from './search-intent';

const storageKey = '999scraper.search.v7';
const lastStorageKey = '999scraper.search.last.v2';
const historyEntryPrefix = '999scraper.search.entry.v2.';
const historyIndexKey = '999scraper.search.entries.v2';
const historyStateKey = 'searchEntryId';
const maxAge = 12 * 60 * 60 * 1000;
const maxHistoryEntries = 8;

export interface SearchState {
  query: string;
  activeQuery: string;
  order: SortOrder;
  qualityMin: QualityThreshold;
  smartCleanup: boolean;
  excludeNegotiable: boolean;
  onlyWithPhotos: boolean;
  onlyWithVIN: boolean;
  excludedWords: string[];
  excludedWord: string;
  queryExclusions: string[];
  yearFrom: number | null;
  yearTo: number | null;
  priceMin: number | null;
  priceMax: number | null;
  priceCurrency: number | null;
  fuel: string[];
  transmission: string[];
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
  propertySector: string[];
  propertyState: string[];
  housingStock: string[];
  listingAuthor: string[];
  buildingType: string[];
  screenFrom: number | null;
  screenTo: number | null;
  mileageFrom: number | null;
  mileageTo: number | null;
  powerFrom: number | null;
  powerTo: number | null;
  drivetrain: string[];
  bodyType: string[];
  registration: Array<'moldova' | 'other'>;
  originCountry: VehicleOrigin[];
  deviceTags: string[];
  condition: Array<'new' | 'used'>;
  listingMode: PropertyListingMode[];
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

  snapshot(): SearchState | null {
    return this.cached();
  }

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
    try {
      sessionStorage.removeItem(storageKey);
    } catch {
      /* In-memory state still works. */
    }
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
    } catch {
      /* In-memory state still works. */
    }
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
    const entries = [
      id,
      ...(Array.isArray(stored)
        ? stored.filter((item): item is string => typeof item === 'string' && item !== id)
        : []),
    ];
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
      qualityMin: value.qualityMin ?? 0,
      onlyWithVIN: value.onlyWithVIN ?? false,
      fuel: choiceArray(value.fuel),
      transmission: choiceArray(value.transmission),
      drivetrain: choiceArray(value.drivetrain),
      bodyType: choiceArray(value.bodyType),
      registration: choiceArray(value.registration),
      originCountry: choiceArray(value.originCountry),
      condition: choiceArray(value.condition),
      listingMode: choiceArray((value as unknown as { listingMode?: string | string[] }).listingMode).map((mode) =>
        mode === 'rent' ? 'monthly' : mode,
      ) as PropertyListingMode[],
      floorFrom: value.floorFrom ?? null,
      floorTo: value.floorTo ?? null,
      propertySector: choiceArray(value.propertySector),
      propertyState: choiceArray(value.propertyState),
      housingStock: choiceArray(value.housingStock),
      listingAuthor: choiceArray(value.listingAuthor),
      buildingType: choiceArray(value.buildingType),
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
      } catch {
        /* Try a smaller snapshot. */
      }
    }
  }
}

function isSearchState(value: unknown): value is SearchState {
  if (!value || typeof value !== 'object') return false;
  const state = value as Partial<SearchState>;
  const raw = value as Record<string, unknown>;
  return (
    typeof state.query === 'string' &&
    typeof state.activeQuery === 'string' &&
    typeof state.excludedWord === 'string' &&
    (state.order === 'relevance' ||
      state.order === 'qualityDesc' ||
      state.order === 'priceAsc' ||
      state.order === 'priceDesc') &&
    (state.qualityMin === undefined || [0, 5, 7, 9].includes(state.qualityMin)) &&
    typeof state.smartCleanup === 'boolean' &&
    typeof state.excludeNegotiable === 'boolean' &&
    typeof state.onlyWithPhotos === 'boolean' &&
    (typeof state.onlyWithVIN === 'boolean' || state.onlyWithVIN === undefined) &&
    typeof state.searched === 'boolean' &&
    typeof state.updatedAt === 'number' &&
    typeof state.loadedPages === 'number' &&
    typeof state.totalPages === 'number' &&
    typeof state.scrollY === 'number' &&
    [
      state.yearFrom,
      state.yearTo,
      state.priceMin,
      state.priceMax,
      state.priceCurrency,
      state.generationFrom,
      state.generationTo,
      state.storageFrom,
      state.storageTo,
      state.ramFrom,
      state.ramTo,
      state.roomsFrom,
      state.roomsTo,
      state.areaFrom,
      state.areaTo,
      state.floorFrom ?? null,
      state.floorTo ?? null,
      state.screenFrom,
      state.screenTo,
    ].every(isNullableNumber) &&
    [state.mileageFrom, state.mileageTo, state.powerFrom, state.powerTo].every(isNullableNumber) &&
    [
      'fuel',
      'transmission',
      'drivetrain',
      'bodyType',
      'propertySector',
      'propertyState',
      'housingStock',
      'listingAuthor',
      'buildingType',
    ].every((key) => isStringChoice(raw[key])) &&
    isEnumChoice(raw['registration'], ['moldova', 'other']) &&
    isEnumChoice(raw['originCountry'], ['China', 'Coreea', 'Japonia', 'SUA', 'Zona Euro', 'Altă']) &&
    isEnumChoice(raw['condition'], ['new', 'used']) &&
    isEnumChoice(raw['listingMode'], ['sale', 'rent', 'monthly', 'daily']) &&
    isStringArray(state.excludedWords) &&
    isStringArray(state.queryExclusions) &&
    isStringArray(state.deviceTags) &&
    Array.isArray(state.products) &&
    state.products.every((product) => product && typeof product.id === 'string' && typeof product.title === 'string')
  );
}

function isNullableNumber(value: unknown): value is number | null {
  return value === null || typeof value === 'number';
}
function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}
function isStringChoice(value: unknown): boolean {
  return value === undefined || value === null || typeof value === 'string' || isStringArray(value);
}
function isEnumChoice(value: unknown, options: readonly string[]): boolean {
  return (
    value === undefined ||
    value === null ||
    (typeof value === 'string' && options.includes(value)) ||
    (isStringArray(value) && value.every((item) => options.includes(item)))
  );
}
function choiceArray<T extends string>(value: T | T[] | null | undefined): T[] {
  return Array.isArray(value) ? value : value ? [value] : [];
}
