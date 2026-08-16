import assert from 'node:assert/strict';
import { searchAlertConfiguration } from '../src/app/search/search-filter-chips.ts';

const filters = {
  order: 'qualityDesc',
  qualityMin: 7,
  smartCleanup: true,
  excludeNegotiable: true,
  onlyWithPhotos: true,
  onlyWithVIN: true,
  excludedWords: ['dealer'],
  queryExclusions: ['parts'],
  yearFrom: 2020,
  yearTo: 2024,
  priceMin: 10_000,
  priceMax: 25_000,
  priceCurrency: 1,
  fuel: ['Electricitate'],
  transmission: ['Automată'],
  generationFrom: null,
  generationTo: null,
  storageFrom: null,
  storageTo: null,
  ramFrom: null,
  ramTo: null,
  roomsFrom: null,
  roomsTo: null,
  areaFrom: null,
  areaTo: null,
  floorFrom: null,
  floorTo: null,
  propertySector: [],
  propertyState: [],
  housingStock: [],
  listingAuthor: [],
  buildingType: [],
  screenFrom: null,
  screenTo: null,
  mileageFrom: null,
  mileageTo: 100_000,
  powerFrom: null,
  powerTo: null,
  drivetrain: ['4x4'],
  bodyType: ['SUV'],
  registration: ['moldova'],
  originCountry: ['SUA', 'Zona Euro'],
  deviceTags: [],
  condition: ['used'],
  listingMode: [],
};

const labels = searchAlertConfiguration(filters).map(({ label }) => label);
for (const expected of [
  'Smart cleanup on',
  'Best ad quality',
  'Ad quality 7+',
  'Year: 2020–2024',
  '10.000–25.000 EUR',
  'Origin: SUA',
  'Origin: Zona Euro',
  'Used',
]) {
  assert(labels.includes(expected), `missing visible saved configuration: ${expected}`);
}

console.log('Search filter configuration check passed.');
