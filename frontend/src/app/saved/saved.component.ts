import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ProductCardComponent } from '../search/product-card.component';
import { UserDataService } from '../user-data.service';
import { Product } from '../models';

@Component({
  selector: 'app-saved',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, ProductCardComponent],
  templateUrl: './saved.component.html',
  styleUrl: './saved.component.scss',
})
export class SavedComponent {
  readonly library = inject(UserDataService);
  readonly selectedOrigin = signal<'SUA' | 'Zona Euro' | null>(null);
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

  constructor() {
    void this.library.loadSaved();
  }
  toggle(product: Product): void {
    void this.library.toggleSaved(product);
  }
}
