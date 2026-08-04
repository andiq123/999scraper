import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
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
  constructor() { void this.library.loadSaved(); }
  toggle(product: Product): void { void this.library.toggleSaved(product); }
}
