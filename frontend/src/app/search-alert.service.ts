import { Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { environment } from '../environments/environment';
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

@Injectable({ providedIn: 'root' })
export class SearchAlertService {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly endpoint = environment.apiUrl + 'subscriptions';
  private draft: AlertDraft | null = null;

  readonly visible = signal(false);
  readonly loading = signal(false);
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

  async open(query: string, filterParam: string, currentProducts: Product[]): Promise<void> {
    if (!(await this.auth.restore())) {
      this.toast.success('Log in to receive private search alerts.');
      await this.router.navigate(['/login']);
      return;
    }
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
    if (this.loading() || !(await this.auth.restore())) return;
    this.loading.set(true);
    this.error.set(null);
    try {
      const response = await this.request<SearchSubscriptionsResponse>('');
      this.available.set(response.available);
      this.checkIntervalMinutes.set(response.checkIntervalMinutes);
      this.items.set(response.items);
    } catch (error) {
      this.error.set(message(error));
    } finally {
      this.loading.set(false);
    }
  }

  async subscribe(): Promise<void> {
    if (!this.draft || this.saving()) return;
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
      this.items.update((items) => [item, ...items.filter((candidate) => candidate.id !== item.id)]);
      this.toast.success('Search alert enabled. Email will be sent only when results change.');
      this.visible.set(false);
    } catch (error) {
      this.error.set(message(error));
    } finally {
      this.saving.set(false);
    }
  }

  async remove(id: string): Promise<void> {
    try {
      await this.request<void>(`/${encodeURIComponent(id)}`, { method: 'DELETE' });
      this.items.update((items) => items.filter((item) => item.id !== id));
      this.toast.success('Search alert stopped and its saved snapshot was removed.');
    } catch (error) {
      this.toast.error(message(error));
    }
  }

  async updateInterval(id: string, intervalMinutes: number): Promise<boolean> {
    try {
      const schedule = await this.request<{ intervalMinutes: number; nextCheckAt: string }>(
        `/${encodeURIComponent(id)}`,
        { method: 'PUT', body: JSON.stringify({ intervalMinutes }) },
      );
      this.items.update((items) => items.map((item) => (item.id === id ? { ...item, ...schedule } : item)));
      this.toast.success(`Schedule saved: ${alertIntervalLabel(schedule.intervalMinutes)}.`);
      return true;
    } catch (error) {
      this.toast.error(message(error));
      return false;
    }
  }

  async sendTest(id: string): Promise<void> {
    try {
      await this.request<void>(`/${encodeURIComponent(id)}/test`, { method: 'POST' });
      this.toast.success('Test email sent. Check your inbox.');
    } catch (error) {
      this.toast.error(message(error));
    }
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(this.endpoint + path, this.auth.withSession({ cache: 'no-store', ...init }));
    if (response.status === 401) this.auth.expire();
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error || `Request failed (${response.status}).`);
    }
    return response.status === 204 ? (undefined as T) : response.json();
  }
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : 'Search alerts are temporarily unavailable.';
}
