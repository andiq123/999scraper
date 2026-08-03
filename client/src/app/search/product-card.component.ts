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
  readonly convertedPrice = input('');
  readonly exclude = output<string>();
  readonly save = output<Product>();
  readonly selectedWord = signal('');
  readonly popoverId = computed(() => `exclude-${this.product().id.replace(/[^a-zA-Z0-9_-]/g, '')}`);
  readonly titleWords = computed(() => this.product().title.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? []);
  @ViewChild('popover') private popover?: ElementRef<HTMLDivElement>;

  readonly price = computed(() => {
    const product = this.product();
    if (product.price == null) return product.priceString || 'Price negotiable';
    return `${product.price} ${['MDL', 'EUR', 'USD'][product.currency] ?? ''}`.trim();
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
