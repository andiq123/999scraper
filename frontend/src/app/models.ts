export interface Session { id: string }
export interface Registration { code: string }
export interface SearchHistory { id: string; query: string; searchedAt: string }
export interface Preferences { excludedWords: string[] }
export interface SavedListing { product: Product; savedAt: string }

export type SortOrder = 'relevance' | 'priceAsc' | 'priceDesc';

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
  bodyType?: string;
  mileage?: number;
  power?: number;
  drivetrain?: string;
  registration?: string;
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
