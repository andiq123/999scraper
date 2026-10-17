import { Injectable, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from './auth/auth.service';
import { Product, SearchSubscription, SearchSubscriptionsResponse } from './models';
import { ToastService } from './toast.service';

interface AlertDraft {
  query: string;
  filterParam: string;
  searchPath: string;
  snapshotProductIds: string[];
  snapshotProducts: Product[];
}

export const alertIntervalOptions = [
  { value: 15, label: 'Every 15 minutes' },
  { value: 60, label: 'Once an hour' },
  { value: 360, label: 'Four times a day' },
  { value: 720, label: 'Twice a day' },
  { value: 1440, label: 'Once a day' },
] as const;

export function alertIntervalLabel(minutes: number): string {
  return alertIntervalOptions.find((option) => option.value === minutes)?.label ?? `Every ${minutes} minutes`;
}

export function validAlertInterval(minutes: number): boolean {
  return alertIntervalOptions.some((option) => option.value === minutes);
}

@Injectable({ providedIn: 'root' })
export class SearchAlertService {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private draft: AlertDraft | null = null;
  private loadRequest?: Promise<void>;
  private account = this.auth.session()?.id ?? null;

  readonly visible = signal(false);
  readonly loading = signal(false);
  readonly loaded = signal(false);
  readonly saving = signal(false);
  readonly available = signal<boolean | null>(null);
  readonly checkIntervalMinutes = signal(15);
  readonly intervalMinutes = signal(15);
  readonly items = signal<SearchSubscription[]>([]);
  readonly query = signal('');
  readonly filterParam = signal('');
  readonly matchingCount = signal(0);
  readonly recipientEmail = signal('');
  readonly error = signal<string | null>(null);

  constructor() {
    effect(() => this.syncAccount());
  }

  private syncAccount(): string | null {
    const account = this.auth.session()?.id ?? null;
    if (account !== this.account) {
      this.account = account;
      this.draft = null;
      this.loadRequest = undefined;
      this.visible.set(false);
      this.loading.set(false);
      this.loaded.set(false);
      this.saving.set(false);
      this.available.set(null);
      this.items.set([]);
      this.query.set('');
      this.filterParam.set('');
      this.matchingCount.set(0);
      this.recipientEmail.set('');
      this.checkIntervalMinutes.set(15);
      this.intervalMinutes.set(15);
      this.error.set(null);
    }
    return account;
  }

  async open(query: string, filterParam: string, currentProducts: Product[]): Promise<void> {
    if (!(await this.auth.restore())) {
      this.toast.success('Log in to receive private search alerts.');
      await this.router.navigate(['/login'], { queryParams: { returnUrl: this.router.url } });
      return;
    }
    const account = this.syncAccount();
    const snapshotProducts = [...new Map(currentProducts.map((product) => [product.id, product])).values()].slice(
      0,
      1000,
    );
    this.draft = {
      query,
      filterParam,
      searchPath: `/?q=${encodeURIComponent(query)}&filters=${encodeURIComponent(filterParam)}`,
      snapshotProductIds: snapshotProducts.map((product) => product.id),
      snapshotProducts,
    };
    this.query.set(query);
    this.filterParam.set(filterParam);
    this.matchingCount.set(this.draft.snapshotProductIds.length);
    this.error.set(null);
    this.visible.set(true);
    await this.load();
    if (account !== this.auth.session()?.id) return;
    const existing = this.items().find((item) => item.query === query && (item.filterParam ?? '') === filterParam);
    this.recipientEmail.set(existing?.recipientEmail ?? this.items()[0]?.recipientEmail ?? '');
    this.intervalMinutes.set(existing?.intervalMinutes ?? this.checkIntervalMinutes());
  }

  close(): void {
    if (this.saving()) return;
    this.visible.set(false);
    this.error.set(null);
  }

  async load(): Promise<void> {
    if (!(await this.auth.restore())) return;
    const account = this.syncAccount();
    if (this.loadRequest) return this.loadRequest;
    const request = this.loadForAccount(account);
    this.loadRequest = request;
    try {
      await request;
    } finally {
      if (this.loadRequest === request) this.loadRequest = undefined;
    }
  }

  private async loadForAccount(account: string | null): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const response = await this.request<SearchSubscriptionsResponse>('');
      if (account !== this.auth.session()?.id) return;
      if (response.items.some((item) => !validAlertInterval(item.intervalMinutes))) {
        throw new Error('The server returned an invalid alert schedule.');
      }
      this.available.set(response.available);
      this.checkIntervalMinutes.set(response.checkIntervalMinutes);
      this.items.set(response.items);
    } catch (error) {
      if (account === this.auth.session()?.id) this.error.set(message(error));
    } finally {
      if (account === this.auth.session()?.id) {
        this.loaded.set(true);
        this.loading.set(false);
      }
    }
  }

  async subscribe(): Promise<void> {
    const account = this.syncAccount();
    if (!account || !this.draft || this.saving()) return;
    this.saving.set(true);
    this.error.set(null);
    try {
      const item = await this.request<SearchSubscription>('', {
        method: 'POST',
        body: JSON.stringify({
          ...this.draft,
          recipientEmail: this.recipientEmail().trim(),
          intervalMinutes: this.intervalMinutes(),
        }),
      });
      if (account !== this.auth.session()?.id) return;
      this.items.update((items) => [item, ...items.filter((candidate) => candidate.id !== item.id)]);
      this.toast.success('Search alert enabled. Email will be sent only when results change.');
      this.visible.set(false);
    } catch (error) {
      if (account === this.auth.session()?.id) this.error.set(message(error));
    } finally {
      if (account === this.auth.session()?.id) this.saving.set(false);
    }
  }

  async remove(id: string): Promise<void> {
    const account = this.syncAccount();
    if (!account) return;
    try {
      await this.request<void>(`/${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (account !== this.auth.session()?.id) return;
      this.items.update((items) => items.filter((item) => item.id !== id));
      this.toast.success('Search alert stopped and its saved snapshot was removed.');
    } catch (error) {
      if (account === this.auth.session()?.id) this.toast.error(message(error));
    }
  }

  async updateInterval(id: string, intervalMinutes: number): Promise<boolean> {
    const account = this.syncAccount();
    if (!account) return false;
    try {
      const schedule = await this.request<{ intervalMinutes: number; nextCheckAt: string }>(
        `/${encodeURIComponent(id)}`,
        { method: 'PUT', body: JSON.stringify({ intervalMinutes }) },
      );
      if (account !== this.auth.session()?.id) return false;
      this.items.update((items) => items.map((item) => (item.id === id ? { ...item, ...schedule } : item)));
      this.toast.success(`Schedule saved: ${alertIntervalLabel(schedule.intervalMinutes)}.`);
      return true;
    } catch (error) {
      if (account === this.auth.session()?.id) this.toast.error(message(error));
      return false;
    }
  }

  async sendTest(id: string): Promise<void> {
    const account = this.syncAccount();
    if (!account) return;
    try {
      await this.request<void>(`/${encodeURIComponent(id)}/test`, { method: 'POST' });
      if (account !== this.auth.session()?.id) return;
      this.toast.success('Test email sent. Check your inbox.');
    } catch (error) {
      if (account === this.auth.session()?.id) this.toast.error(message(error));
    }
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    return this.auth.requestPrivate<T>('subscriptions' + path, init);
  }
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : 'Search alerts are temporarily unavailable.';
}
