import { ChangeDetectionStrategy, Component, ElementRef, ViewChild, computed, input, output, signal } from '@angular/core';
import { Product } from '../models';

@Component({
	selector: 'app-product-card',
	changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './product-card.component.html',
  styleUrl: './product-card.component.scss',
})
export class ProductCardComponent {
  readonly product = input.required<Product>();
  readonly saved = input(false);
  readonly eager = input(false);
  readonly priority = input(false);
  readonly convertedPrice = input('');
  readonly exclude = output<string>();
  readonly save = output<Product>();
  readonly selectedWord = signal('');
  readonly popoverId = computed(() => `exclude-${this.product().id.replace(/[^a-zA-Z0-9_-]/g, '')}`);
  readonly titleWords = computed(() => this.product().title.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? []);
  readonly metadata = computed(() => {
    const product = this.product();
    const vehicle = [product.mileage && `${product.mileage.toLocaleString('ro-MD')} km`, product.originCountry, product.fuel, product.transmission, product.drivetrain, product.bodyType, product.power && `${product.power} hp`];
    const property = [product.sector, product.offerType, product.rooms, product.area && (/^\d+(?:[.,]\d+)?$/.test(product.area) ? `${product.area} m²` : product.area), product.floor && `Floor ${product.floor}`];
    const technology = [product.ram && `${product.ram} RAM`, product.storage, product.processor, product.screen, product.resolution];
    return [...vehicle, ...property, ...technology, product.condition]
      .filter((value): value is string => Boolean(value)).slice(0, 3);
  });
  @ViewChild('popover') private popover?: ElementRef<HTMLDivElement>;

  readonly price = computed(() => {
    const product = this.product();
    if (product.price == null) return product.priceString || 'Price negotiable';
    return `${product.price.toLocaleString('ro-MD')} ${['MDL', 'EUR', 'USD'][product.currency] ?? ''}`.trim();
  });

  chooseWord(word: string): void {
    this.selectedWord.set(word.toLocaleLowerCase());
  }

  applyExclusion(): void {
    const word = this.selectedWord();
    if (!word) return;
    this.exclude.emit(word);
    this.popover?.nativeElement.hidePopover();
  }
}
