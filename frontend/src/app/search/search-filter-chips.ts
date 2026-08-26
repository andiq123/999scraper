import type { SharedSearchFilters } from './search-url-state';

export interface SearchFilterChip {
  id: string;
  label: string;
}

export function searchFilterChips(filters: SharedSearchFilters): SearchFilterChip[] {
  const chips: SearchFilterChip[] = [];
  if (filters.order !== 'relevance') {
    chips.push({
      id: 'order',
      label: {
        qualityDesc: 'Best ad quality',
        priceAsc: 'Lowest price',
        priceDesc: 'Highest price',
      }[filters.order],
    });
  }
  if (filters.qualityMin) chips.push({ id: 'quality', label: `Ad quality ${filters.qualityMin}+` });
  if (!filters.smartCleanup) chips.push({ id: 'cleanup', label: 'Cleanup off' });
  if (filters.onlyWithPhotos) chips.push({ id: 'photos', label: 'With photos' });
  if (filters.onlyWithVIN) chips.push({ id: 'vin', label: 'VIN available' });
  if (filters.excludeNegotiable) chips.push({ id: 'fixed', label: 'Fixed price' });
  addValues(chips, 'category', filters.categories, (value) => `Category: ${value}`);
  addRange(chips, 'year', 'Year', filters.yearFrom, filters.yearTo);
  addRange(chips, 'generation', 'Generation', filters.generationFrom, filters.generationTo);
  addRange(chips, 'storage', 'Storage', filters.storageFrom, filters.storageTo, ' GB');
  addRange(chips, 'ram', 'RAM', filters.ramFrom, filters.ramTo, ' GB');
  addRange(chips, 'rooms', 'Rooms', filters.roomsFrom, filters.roomsTo);
  addRange(chips, 'area', 'Area', filters.areaFrom, filters.areaTo, ' m²');
  addRange(chips, 'floor', 'Floor', filters.floorFrom, filters.floorTo);
  addValues(chips, 'property-sector', filters.propertySector);
  addValues(chips, 'property-state', filters.propertyState);
  addValues(chips, 'housing-stock', filters.housingStock);
  addValues(chips, 'listing-author', filters.listingAuthor);
  addValues(chips, 'building-type', filters.buildingType);
  addRange(chips, 'screen', 'Screen', filters.screenFrom, filters.screenTo, '″');
  if (filters.priceMin !== null || filters.priceMax !== null) {
    const currency = ['MDL', 'EUR', 'USD'][filters.priceCurrency ?? -1] ?? 'listing currency';
    chips.push({ id: 'price', label: `${rangeValue(filters.priceMin, filters.priceMax)} ${currency}` });
  }
  addValues(chips, 'fuel', filters.fuel);
  addValues(chips, 'transmission', filters.transmission);
  addRange(chips, 'mileage', 'Mileage', filters.mileageFrom, filters.mileageTo, ' km');
  addRange(chips, 'power', 'Power', filters.powerFrom, filters.powerTo, ' hp');
  addValues(chips, 'drivetrain', filters.drivetrain);
  addValues(chips, 'body-type', filters.bodyType);
  addValues(chips, 'registration', filters.registration, (value) =>
    value === 'moldova' ? 'Registered in Moldova' : 'Other registration',
  );
  addValues(chips, 'origin-country', filters.originCountry, (value) => `Origin: ${value}`);
  addValues(chips, 'condition', filters.condition, (value) => (value === 'new' ? 'New' : 'Used'));
  addValues(chips, 'listing-mode', filters.listingMode, (value) =>
    value === 'monthly' ? 'Monthly rent' : value === 'daily' ? 'Daily rent' : 'For sale',
  );
  addValues(chips, 'tag', filters.deviceTags, titleCase);
  addValues(chips, 'query-exclude', filters.queryExclusions, (value) => `Without ${value}`);
  const queryExcluded = new Set(filters.queryExclusions.map(normalize));
  addValues(
    chips,
    'exclude',
    filters.excludedWords.filter((value) => !queryExcluded.has(normalize(value))),
    (value) => `Hide ${value}`,
  );
  const labels = new Set<string>();
  return chips.filter((chip) => {
    const label = normalize(chip.label);
    if (labels.has(label)) return false;
    labels.add(label);
    return true;
  });
}

export function searchAlertConfiguration(filters: SharedSearchFilters): SearchFilterChip[] {
  return [
    { id: 'cleanup', label: `Smart cleanup ${filters.smartCleanup ? 'on' : 'off'}` },
    ...searchFilterChips(filters).filter((chip) => chip.id !== 'cleanup'),
  ];
}

function addRange(
  chips: SearchFilterChip[],
  id: string,
  label: string,
  from: number | null,
  to: number | null,
  unit = '',
): void {
  if (from === null && to === null) return;
  const withUnit = (value: number) => `${value}${unit}`;
  const value =
    from !== null && to !== null
      ? from === to
        ? withUnit(from)
        : `${withUnit(from)}–${withUnit(to)}`
      : from !== null
        ? `${withUnit(from)}+`
        : `up to ${withUnit(to!)}`;
  chips.push({ id, label: `${label}: ${value}` });
}

function addValues(
  chips: SearchFilterChip[],
  id: string,
  values: readonly string[],
  label: (value: string) => string = (value) => value,
): void {
  for (const value of values) chips.push({ id: `${id}:${value}`, label: label(value) });
}

function rangeValue(from: number | null, to: number | null): string {
  if (from !== null && to !== null) return `${formatNumber(from)}–${formatNumber(to)}`;
  if (from !== null) return `From ${formatNumber(from)}`;
  return `Up to ${formatNumber(to!)}`;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('ro-MD', { maximumFractionDigits: 0 }).format(value);
}

function titleCase(value: string): string {
  return value ? value[0].toUpperCase() + value.slice(1) : value;
}

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase();
}
