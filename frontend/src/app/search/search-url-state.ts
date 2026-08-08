import { type SearchState } from './search-state.service';

export type SharedSearchFilters = Pick<
  SearchState,
  | 'order'
  | 'qualityMin'
  | 'smartCleanup'
  | 'excludeNegotiable'
  | 'onlyWithPhotos'
  | 'onlyWithVIN'
  | 'excludedWords'
  | 'queryExclusions'
  | 'yearFrom'
  | 'yearTo'
  | 'priceMin'
  | 'priceMax'
  | 'priceCurrency'
  | 'fuel'
  | 'transmission'
  | 'generationFrom'
  | 'generationTo'
  | 'storageFrom'
  | 'storageTo'
  | 'ramFrom'
  | 'ramTo'
  | 'roomsFrom'
  | 'roomsTo'
  | 'areaFrom'
  | 'areaTo'
  | 'floorFrom'
  | 'floorTo'
  | 'propertySector'
  | 'propertyState'
  | 'housingStock'
  | 'listingAuthor'
  | 'buildingType'
  | 'screenFrom'
  | 'screenTo'
  | 'mileageFrom'
  | 'mileageTo'
  | 'powerFrom'
  | 'powerTo'
  | 'drivetrain'
  | 'bodyType'
  | 'registration'
  | 'originCountry'
  | 'deviceTags'
  | 'condition'
  | 'listingMode'
>;

const filterFields: readonly (keyof SharedSearchFilters)[] = [
  'order',
  'smartCleanup',
  'excludeNegotiable',
  'onlyWithPhotos',
  'excludedWords',
  'queryExclusions',
  'yearFrom',
  'yearTo',
  'priceMin',
  'priceMax',
  'priceCurrency',
  'fuel',
  'transmission',
  'generationFrom',
  'generationTo',
  'storageFrom',
  'storageTo',
  'ramFrom',
  'ramTo',
  'roomsFrom',
  'roomsTo',
  'areaFrom',
  'areaTo',
  'floorFrom',
  'floorTo',
  'propertySector',
  'propertyState',
  'housingStock',
  'listingAuthor',
  'buildingType',
  'screenFrom',
  'screenTo',
  'mileageFrom',
  'mileageTo',
  'powerFrom',
  'powerTo',
  'drivetrain',
  'bodyType',
  'registration',
  'originCountry',
  'deviceTags',
  'condition',
  'listingMode',
  'onlyWithVIN',
  'qualityMin',
];

const nullableNumbers: readonly (keyof SharedSearchFilters)[] = [
  'yearFrom',
  'yearTo',
  'priceMin',
  'priceMax',
  'priceCurrency',
  'generationFrom',
  'generationTo',
  'storageFrom',
  'storageTo',
  'ramFrom',
  'ramTo',
  'roomsFrom',
  'roomsTo',
  'areaFrom',
  'areaTo',
  'floorFrom',
  'floorTo',
  'screenFrom',
  'screenTo',
  'mileageFrom',
  'mileageTo',
  'powerFrom',
  'powerTo',
];
const multiSelectFields: readonly (keyof SharedSearchFilters)[] = [
  'fuel',
  'transmission',
  'propertySector',
  'propertyState',
  'housingStock',
  'listingAuthor',
  'buildingType',
  'drivetrain',
  'bodyType',
  'registration',
  'originCountry',
  'condition',
  'listingMode',
];

export function encodeSearchFilters(filters: SharedSearchFilters): string {
  const bytes = new TextEncoder().encode(JSON.stringify([4, ...filterFields.map((key) => filters[key])]));
  return btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');
}

export function searchFiltersFromState(state: SearchState): SharedSearchFilters {
  return {
    order: state.order,
    qualityMin: state.qualityMin,
    smartCleanup: state.smartCleanup,
    excludeNegotiable: state.excludeNegotiable,
    onlyWithPhotos: state.onlyWithPhotos,
    onlyWithVIN: state.onlyWithVIN,
    excludedWords: state.excludedWords,
    queryExclusions: state.queryExclusions,
    yearFrom: state.yearFrom,
    yearTo: state.yearTo,
    priceMin: state.priceMin,
    priceMax: state.priceMax,
    priceCurrency: state.priceCurrency,
    fuel: state.fuel,
    transmission: state.transmission,
    generationFrom: state.generationFrom,
    generationTo: state.generationTo,
    storageFrom: state.storageFrom,
    storageTo: state.storageTo,
    ramFrom: state.ramFrom,
    ramTo: state.ramTo,
    roomsFrom: state.roomsFrom,
    roomsTo: state.roomsTo,
    areaFrom: state.areaFrom,
    areaTo: state.areaTo,
    floorFrom: state.floorFrom,
    floorTo: state.floorTo,
    propertySector: state.propertySector,
    propertyState: state.propertyState,
    housingStock: state.housingStock,
    listingAuthor: state.listingAuthor,
    buildingType: state.buildingType,
    screenFrom: state.screenFrom,
    screenTo: state.screenTo,
    mileageFrom: state.mileageFrom,
    mileageTo: state.mileageTo,
    powerFrom: state.powerFrom,
    powerTo: state.powerTo,
    drivetrain: state.drivetrain,
    bodyType: state.bodyType,
    registration: state.registration,
    originCountry: state.originCountry,
    deviceTags: state.deviceTags,
    condition: state.condition,
    listingMode: state.listingMode,
  };
}

export function decodeSearchFilters(value: string | null): SharedSearchFilters | null {
  if (!value || value.length > 8_000 || !/^[A-Za-z0-9_-]+$/.test(value)) return null;
  try {
    const base64 = value
      .replaceAll('-', '+')
      .replaceAll('_', '/')
      .padEnd(Math.ceil(value.length / 4) * 4, '=');
    const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
    const payload: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (!Array.isArray(payload) || ![1, 2, 3, 4].includes(payload[0] as number)) return null;
    const version = payload[0] as number;
    const legacy = version === 1 || version === 2;
    const fields = legacy ? filterFields.slice(0, -2) : version === 3 ? filterFields.slice(0, -1) : filterFields;
    if (payload.length !== fields.length + 1) return null;
    const filters = Object.fromEntries(fields.map((key, index) => [key, payload[index + 1]]));
    if (legacy) filters['onlyWithVIN'] = false;
    if (version < 4) filters['qualityMin'] = 0;
    if (version === 1) {
      for (const key of multiSelectFields) filters[key] = filters[key] === null ? [] : [filters[key]];
    }
    return isSharedSearchFilters(filters) ? filters : null;
  } catch {
    return null;
  }
}

function isSharedSearchFilters(value: unknown): value is SharedSearchFilters {
  if (!value || typeof value !== 'object') return false;
  const filters = value as Record<string, unknown>;
  return (
    (filters.order === 'relevance' ||
      filters.order === 'qualityDesc' ||
      filters.order === 'priceAsc' ||
      filters.order === 'priceDesc') &&
    (filters.qualityMin === 0 || filters.qualityMin === 5 || filters.qualityMin === 7 || filters.qualityMin === 9) &&
    typeof filters.smartCleanup === 'boolean' &&
    typeof filters.excludeNegotiable === 'boolean' &&
    typeof filters.onlyWithPhotos === 'boolean' &&
    typeof filters.onlyWithVIN === 'boolean' &&
    isStringArray(filters.excludedWords) &&
    isStringArray(filters.queryExclusions) &&
    nullableNumbers.every((key) => isNullableFiniteNumber(filters[key])) &&
    (filters.priceCurrency === null ||
      filters.priceCurrency === 0 ||
      filters.priceCurrency === 1 ||
      filters.priceCurrency === 2) &&
    multiSelectFields.every((key) => isStringArray(filters[key])) &&
    isStringArray(filters.deviceTags) &&
    isEnumArray(filters.registration, ['moldova', 'other']) &&
    isEnumArray(filters.originCountry, ['China', 'Coreea', 'Japonia', 'SUA', 'Zona Euro', 'Altă']) &&
    isEnumArray(filters.condition, ['new', 'used']) &&
    isEnumArray(filters.listingMode, ['sale', 'monthly', 'daily'])
  );
}

function isNullableFiniteNumber(value: unknown): boolean {
  return value === null || (typeof value === 'number' && Number.isFinite(value));
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.length <= 30 && value.every((item) => typeof item === 'string' && item.length <= 100)
  );
}

function isEnumArray(value: unknown, options: readonly string[]): boolean {
  return isStringArray(value) && value.every((item) => options.includes(item));
}
