import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SearchAlertService } from '../search-alert.service';
import { searchAlertConfiguration } from '../search/search-filter-chips';
import { decodeSearchFilters } from '../search/search-url-state';

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
  readonly confirmingRemoval = signal<string | null>(null);

  constructor() {
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

  intervalLabel(minutes: number): string {
    if (minutes === 60) return 'Every hour';
    if (minutes === 1440) return 'Daily';
    if (minutes > 60) return `Every ${minutes / 60} hours`;
    return `Every ${minutes} minutes`;
  }

  configuration(filterParam?: string): string[] {
    const filters = decodeSearchFilters(filterParam ?? '');
    return filters ? searchAlertConfiguration(filters).map((filter) => filter.label) : [];
  }
}
