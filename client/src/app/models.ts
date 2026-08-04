export interface Session { id: string }
export interface Registration { code: string }
export interface SearchHistory { id: string; query: string; searchedAt: string }
export interface Preferences { excludedWords: string[] }
export interface SavedListing { product: Product; savedAt: string }

export type SortOrder = 'relevance' | 'priceAsc' | 'priceDesc';

export interface SearchFilters {
  smartCleanup: boolean;
  productSearchCriteria: string;
  excludeBoosted: boolean;
  excludePriceNegotiable: boolean;
  excludeOtherAds: boolean;
  order: SortOrder;
  keysToExclude: string[];
  intent?: 'car' | 'iphone' | 'phone' | 'playstation' | 'laptop' | 'tv' | 'realEstate';
  yearFrom?: number;
  yearTo?: number;
  priceMin?: number;
  priceMax?: number;
  currency?: number;
}

export interface Product {
  id: string;
  title: string;
  thumbnailURL: string;
  description: string;
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
  floor?: string;
  propertyState?: string;
  buildingType?: string;
  category?: string;
  condition?: string;
  urlToProduct: string;
}
