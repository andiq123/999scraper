import { Currency } from './currency';

export interface IProduct {
  id: string;
  title: string;
  thumbnailURL: string;
  description: string;
  price?: number | null;
  priceString?: string | null;
  currency: Currency | number;
  isBoosted: boolean;
  urlToProduct: string;
  isGood: boolean;
}
