export interface Session {
  id: string;
  token?: string;
}
export interface Registration {
  code: string;
}
export interface SearchHistory {
  id: string;
  query: string;
  searchedAt: string;
}
export interface Preferences {
  excludedWords: string[];
}
export interface SavedListing {
  product: Product;
  savedAt: string;
}
export interface SearchSubscription {
  id: string;
  query: string;
  filterParam?: string;
  searchPath: string;
  recipientEmail: string;
  intervalMinutes: number;
  createdAt: string;
  lastCheckedAt?: string;
  lastNotifiedAt?: string;
  lastChanges?: SearchChanges;
}
export interface SearchChanges {
  added: Product[];
  removed: Product[];
  priceChanges?: PriceChange[];
  detectedAt: string;
}
export interface PriceChange {
  before: Product;
  after: Product;
}
export interface SearchSubscriptionsResponse {
  available: boolean;
  checkIntervalMinutes: number;
  items: SearchSubscription[];
}

export type SortOrder = 'relevance' | 'qualityDesc' | 'priceAsc' | 'priceDesc';
export type QualityThreshold = 0 | 5 | 7 | 9;
export type VehicleFlag = 'accidentDamage' | 'mechanicalIssue' | 'documentRisk';

export interface Product {
  id: string;
  title: string;
  thumbnailURL: string;
  price?: number | null;
  priceString?: string | null;
  offerType?: string;
  currency: number;
  isBoosted: boolean;
  year?: number;
  make?: string;
  model?: string;
  fuel?: string;
  transmission?: string;
  bodyType?: string;
  mileage?: number;
  power?: number;
  drivetrain?: string;
  registration?: string;
  originCountry?: string;
  vin?: string;
  imageCount?: number;
  descriptionWordCount?: number;
  descriptionUsefulWordCount?: number;
  descriptionMarketingPercent?: number;
  vehicleFlags?: VehicleFlag[];
  deviceModel?: string;
  storage?: string;
  brand?: string;
  ram?: string;
  processor?: string;
  gpu?: string;
  screen?: string;
  resolution?: string;
  os?: string;
  rooms?: string;
  area?: string;
  sector?: string;
  housingStock?: string;
  listingAuthor?: string;
  floor?: string;
  propertyState?: string;
  buildingType?: string;
  category?: string;
  condition?: string;
  urlToProduct: string;
}
