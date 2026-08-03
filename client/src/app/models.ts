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
  intent?: 'car';
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
  currency: number;
  isBoosted: boolean;
  year?: number;
  make?: string;
  model?: string;
  urlToProduct: string;
}
