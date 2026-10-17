import { Injectable, signal } from '@angular/core';
import { environment } from '../environments/environment';
import { Product } from './models';
import { requestJson } from './api-request';

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
  readonly loading = signal(false);
  readonly unavailable = signal(false);

  load(): Promise<void> {
    if (this.rates()) return Promise.resolve();
    if (this.request) return this.request;
    this.loading.set(true);
    return (this.request = requestJson<Rates>(environment.apiUrl + 'rates')
      .then((rates) => {
        if (!this.codes.every((code) => Number.isFinite(rates.values?.[code]) && rates.values[code] > 0)) {
          throw new Error('Invalid exchange rates');
        }
        this.rates.set(rates);
        this.unavailable.set(false);
      })
      .catch(() => this.unavailable.set(true))
      .finally(() => {
        this.request = undefined;
        this.loading.set(false);
      }));
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
