import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SearchAlertService, alertIntervalLabel, alertIntervalOptions } from '../search-alert.service';
import { searchAlertConfiguration } from '../search/search-filter-chips';
import { decodeSearchFilters } from '../search/search-url-state';
import type { SearchSubscription } from '../models';

@Component({
  selector: 'app-alerts',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, DatePipe],
  templateUrl: './alerts.component.html',
  styleUrl: './alerts.component.scss',
})
export class AlertsComponent {
  readonly alerts = inject(SearchAlertService);
  readonly embedded = input(false);
  readonly removing = signal<ReadonlySet<string>>(new Set());
  readonly testing = signal<ReadonlySet<string>>(new Set());
  readonly updating = signal<ReadonlySet<string>>(new Set());
  readonly pendingInterval = signal<{ id: string; minutes: number } | null>(null);
  readonly confirmingRemoval = signal<string | null>(null);
  readonly now = signal(Date.now());
  readonly changesAvailable = computed(() => this.alerts.items().filter((item) => this.changeCount(item) > 0).length);
  readonly intervalOptions = alertIntervalOptions;
  private readonly clock = window.setInterval(() => {
    const now = Date.now();
    this.now.set(now);
    if (this.alerts.items().some((item) => Date.parse(item.nextCheckAt) <= now)) void this.alerts.load();
  }, 60_000);

  constructor() {
    inject(DestroyRef).onDestroy(() => window.clearInterval(this.clock));
    void this.alerts.load();
  }

  async remove(id: string): Promise<void> {
    if (this.removing().has(id) || this.testing().has(id)) return;
    this.removing.update((items) => new Set(items).add(id));
    try {
      await this.alerts.remove(id);
    } finally {
      this.confirmingRemoval.set(null);
      this.removing.update((items) => {
        const next = new Set(items);
        next.delete(id);
        return next;
      });
    }
  }

  confirmRemoval(id: string): void {
    if (!this.removing().has(id) && !this.testing().has(id)) this.confirmingRemoval.set(id);
  }

  cancelRemoval(): void {
    this.confirmingRemoval.set(null);
  }

  async sendTest(id: string): Promise<void> {
    if (this.testing().has(id) || this.removing().has(id)) return;
    this.testing.update((items) => new Set(items).add(id));
    try {
      await this.alerts.sendTest(id);
    } finally {
      this.testing.update((items) => {
        const next = new Set(items);
        next.delete(id);
        return next;
      });
    }
  }

  chooseInterval(item: SearchSubscription, event: Event): void {
    const minutes = Number((event.target as HTMLSelectElement).value);
    this.pendingInterval.set(minutes === item.intervalMinutes ? null : { id: item.id, minutes });
  }

  cancelInterval(): void {
    this.pendingInterval.set(null);
  }

  async confirmInterval(item: SearchSubscription): Promise<void> {
    const pending = this.pendingInterval();
    if (!pending || pending.id !== item.id || this.updating().has(item.id)) return;
    this.updating.update((items) => new Set(items).add(item.id));
    try {
      await this.alerts.updateInterval(item.id, pending.minutes);
    } finally {
      this.pendingInterval.set(null);
      this.updating.update((items) => {
        const next = new Set(items);
        next.delete(item.id);
        return next;
      });
    }
  }

  selectedInterval(item: SearchSubscription): number {
    const pending = this.pendingInterval();
    return pending?.id === item.id ? pending.minutes : item.intervalMinutes;
  }

  intervalLabel(minutes: number): string {
    return alertIntervalLabel(minutes);
  }

  configuration(filterParam?: string): string[] {
    const filters = decodeSearchFilters(filterParam ?? '');
    return filters ? searchAlertConfiguration(filters).map((filter) => filter.label) : [];
  }

  changeCount(item: SearchSubscription): number {
    return (
      (item.lastChanges?.added.length ?? 0) +
      (item.lastChanges?.removed.length ?? 0) +
      (item.lastChanges?.priceChanges?.length ?? 0)
    );
  }

  lastRunChanged(item: SearchSubscription): boolean {
    return !!item.lastCheckedAt && item.lastCheckedAt === item.lastNotifiedAt;
  }

  nextRunCountdown(nextCheckAt: string): string {
    const totalMinutes = Math.max(0, Math.ceil((Date.parse(nextCheckAt) - this.now()) / 60_000));
    if (!totalMinutes) return 'due now';
    if (totalMinutes < 60) return `in ${totalMinutes}m`;
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (hours < 24) return `in ${hours}h${minutes ? ` ${minutes}m` : ''}`;
    const days = Math.floor(hours / 24);
    return `in ${days}d${hours % 24 ? ` ${hours % 24}h` : ''}`;
  }

  searchPath(item: SearchSubscription): string {
    return `${item.searchPath}&alert=${encodeURIComponent(item.id)}`;
  }
}
