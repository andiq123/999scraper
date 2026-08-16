import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SearchAlertService } from './search-alert.service';
import { searchAlertConfiguration } from './search/search-filter-chips';
import { decodeSearchFilters } from './search/search-url-state';

@Component({
  selector: 'app-search-alert',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  templateUrl: './search-alert.component.html',
  styleUrl: './search-alert.component.scss',
})
export class SearchAlertComponent {
  readonly alerts = inject(SearchAlertService);
  readonly configuration = computed(() => {
    const filters = decodeSearchFilters(this.alerts.filterParam());
    return filters ? searchAlertConfiguration(filters) : [];
  });
  readonly intervalOptions = [
    { value: 15, label: 'Every 15 minutes' },
    { value: 60, label: 'Every hour' },
    { value: 360, label: 'Every 6 hours' },
    { value: 1440, label: 'Once a day' },
  ] as const;
  private readonly dialog = viewChild<ElementRef<HTMLDialogElement>>('dialog');

  constructor() {
    effect(() => {
      const dialog = this.dialog()?.nativeElement;
      if (!dialog) return;
      if (this.alerts.visible() && !dialog.open) dialog.showModal();
      if (!this.alerts.visible() && dialog.open) dialog.close();
    });
  }

  submit(event: SubmitEvent): void {
    event.preventDefault();
    void this.alerts.subscribe();
  }

  cancel(event: Event): void {
    event.preventDefault();
    this.alerts.close();
  }

  closeFromBackdrop(event: MouseEvent): void {
    if (event.target === this.dialog()?.nativeElement) this.alerts.close();
  }
}
