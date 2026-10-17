import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ProductCardComponent } from '../search/product-card.component';
import { UserDataService } from '../user-data.service';
import { Product } from '../models';
import { ListingSummaryService, type BulkDownloadProgress } from '../listing-summary.service';
import { ToastService } from '../toast.service';
import { listingBatchSize } from '../listing-view';

@Component({
  selector: 'app-saved',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, ProductCardComponent],
  templateUrl: './saved.component.html',
  styleUrl: './saved.component.scss',
})
export class SavedComponent {
  readonly library = inject(UserDataService);
  readonly listingBatchSize = listingBatchSize;
  readonly loading = signal(true);
  readonly failed = signal(false);
  private readonly summaries = inject(ListingSummaryService);
  private readonly toast = inject(ToastService);
  readonly selectedOrigin = signal<'SUA' | 'Zona Euro' | null>(null);
  readonly exporting = signal(false);
  readonly exportProgress = signal<BulkDownloadProgress>({ completed: 0, total: 0 });
  readonly filteredSaved = computed(() => {
    const origin = this.selectedOrigin();
    return origin === null
      ? this.library.saved()
      : this.library.saved().filter((item) => item.product.originCountry === origin);
  });
  readonly originCounts = computed(() => {
    const saved = this.library.saved();
    return {
      SUA: saved.filter((item) => item.product.originCountry === 'SUA').length,
      'Zona Euro': saved.filter((item) => item.product.originCountry === 'Zona Euro').length,
    };
  });
  readonly visibleSaved = computed(() => this.filteredSaved().slice(0, this.library.savedRenderLimit()));
  readonly hasOriginFilter = computed(() =>
    Boolean(this.selectedOrigin() || this.originCounts().SUA || this.originCounts()['Zona Euro']),
  );
  readonly remainingSaved = computed(() => this.filteredSaved().length - this.visibleSaved().length);

  showMore(): void {
    this.library.savedRenderLimit.update((count) => count + listingBatchSize);
  }

  constructor() {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.failed.set(false);
    try {
      await this.library.loadSaved();
    } catch {
      this.failed.set(true);
    } finally {
      this.loading.set(false);
    }
  }
  toggle(product: Product): void {
    void this.library.toggleSaved(product).catch(() => this.toast.error('Could not update saved listings. Try again.'));
  }

  async downloadJSON(): Promise<void> {
    if (this.exporting()) return;
    const ids = this.filteredSaved().map((item) => item.product.id);
    if (!ids.length) return;

    this.exporting.set(true);
    this.exportProgress.set({ completed: 0, total: ids.length });
    try {
      const result = await this.summaries.download(ids, (progress) => this.exportProgress.set(progress));
      const unavailable = result.unavailable
        ? ` ${result.unavailable} unavailable listing${result.unavailable === 1 ? ' was' : 's were'} noted in the file.`
        : '';
      this.toast.success(
        `${result.exported} saved listing${result.exported === 1 ? '' : 's'} downloaded.${unavailable}`,
      );
    } catch (error) {
      this.toast.error(error instanceof Error ? error.message : 'Could not prepare the JSON download.');
    } finally {
      this.exporting.set(false);
    }
  }
}
