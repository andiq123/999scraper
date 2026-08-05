import { ChangeDetectionStrategy, Component, ElementRef, ViewChild, computed, inject, input, output, signal } from '@angular/core';
import { Product } from '../models';
import { ListingSummaryService } from '../listing-summary.service';
import { ToastService } from '../toast.service';

@Component({
	selector: 'app-product-card',
	changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './product-card.component.html',
  styleUrl: './product-card.component.scss',
})
export class ProductCardComponent {
  private readonly summaries = inject(ListingSummaryService);
  private readonly toast = inject(ToastService);
  readonly product = input.required<Product>();
  readonly saved = input(false);
  readonly eager = input(false);
  readonly priority = input(false);
  readonly convertedPrice = input('');
  readonly bulkMode = input(false);
  readonly bulkSelected = input(false);
  readonly exclude = output<string>();
  readonly save = output<Product>();
  readonly bulkSelect = output<Product>();
  readonly selectedWord = signal('');
  readonly copyState = signal<'idle' | 'loading' | 'ready' | 'copied'>('idle');
  readonly copyRank = computed(() => this.summaries.rank(this.product().id));
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

  async copyJSON(): Promise<void> {
    if (this.copyState() === 'loading') return;
    this.copyState.set('loading');
    try {
      const result = await this.summaries.copy(this.product().id);
      if (result === 'ready') {
        this.copyState.set('ready');
        this.toast.success('Details ready. Tap Copy JSON once more.');
        return;
      }
      this.copyState.set('copied');
      this.toast.success('Listing JSON copied to clipboard.');
      window.setTimeout(() => this.copyState.set('idle'), 1_800);
    } catch (error) {
      this.copyState.set('idle');
      this.toast.error(error instanceof Error ? error.message : 'Could not copy listing JSON.');
    }
  }
}
