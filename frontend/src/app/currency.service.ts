import { Injectable, signal } from '@angular/core';
import { environment } from '../environments/environment';
import { Product } from './models';

interface Rates {
  date: string;
  source: string;
  values: Record<string, number>;
}

@Injectable({ providedIn: 'root' })
export class CurrencyService {
  private readonly codes = ['MDL', 'EUR', 'USD'];
  private readonly rates = signal<Rates | null>(null);
  private request?: Promise<void>;

  load(): Promise<void> {
    return (this.request ??= fetch(environment.apiUrl + 'rates')
      .then(async (response) => {
        if (response.ok) this.rates.set(await response.json());
      })
      .catch(() => undefined));
  }

  convert(product: Product, target: number | null): number | null {
    if (product.price == null) return null;
    if (target === null || target === product.currency) return product.price;
    const rates = this.rates()?.values;
    const sourceCode = this.codes[product.currency];
    const targetCode = this.codes[target];
    if (!rates?.[sourceCode] || !rates[targetCode]) return null;
    return (product.price * rates[sourceCode]) / rates[targetCode];
  }

  label(product: Product, target: number | null): string {
    if (target === null || target === product.currency) return '';
    const value = this.convert(product, target);
    if (value === null) return '';
    return `≈ ${Math.round(value).toLocaleString()} ${this.codes[target]}`;
  }
}
