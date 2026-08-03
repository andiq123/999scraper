import { ChangeDetectionStrategy, Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { Product, SearchFilters, SortOrder } from '../models';
import { ToastService } from '../toast.service';
import { ProductCardComponent } from './product-card.component';
import { SearchEvent, SearchService } from './search.service';

const vehicleMakes = new Set([
  'acura', 'alfa', 'audi', 'bmw', 'cadillac', 'chery', 'chevrolet', 'chrysler', 'citroen', 'dacia',
  'daewoo', 'dodge', 'fiat', 'ford', 'haval', 'honda', 'hyundai', 'infiniti', 'jaguar', 'jeep', 'kia',
  'land rover', 'lexus', 'lixiang', 'mazda', 'mercedes', 'mercedes-benz', 'mitsubishi', 'nissan', 'opel',
  'peugeot', 'porsche', 'renault', 'seat', 'skoda', 'ssangyong', 'subaru', 'suzuki', 'tank', 'tesla',
  'toyota', 'volkswagen', 'volvo', 'ваз', 'лада', 'газ', 'уаз',
]);
const carNoise = new Set([
  'accesorii', 'acumulator', 'anvelope', 'capace', 'covorașe', 'covorase', 'dezmembrare', 'dezmembrări',
  'faruri', 'huse', 'jante', 'piese', 'roți', 'разборка', 'запчасти', 'детали', 'коврики', 'чехлы', 'диски', 'шины',
]);
const noiseWords = new Set([...carNoise, 'credit', 'leasing', 'livrare', 'rate', 'schimb', 'reparație', 'reparatie', 'доставка', 'кредит']);
const ignoredSuggestionWords = new Set([
  'pentru', 'with', 'from', 'the', 'and', 'sau', 'este', 'sunt', 'auto', 'nou', 'nouă', 'noi', 'vând',
  'продам', 'для', 'или', 'это', 'год', 'anul',
]);

@Component({
  selector: 'app-search',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ProductCardComponent],
  templateUrl: './search.component.html',
  styleUrl: './search.component.scss',
})
export class SearchComponent implements OnDestroy {
  private readonly searchService = inject(SearchService);
  private readonly toast = inject(ToastService);
  private readonly ids = new Set<string>();
  private controller?: AbortController;

  readonly query = signal('');
  readonly activeQuery = signal('');
  readonly order = signal<SortOrder>('relevance');
  readonly smartCleanup = signal(true);
  readonly excludeNegotiable = signal(false);
  readonly onlyWithPhotos = signal(false);
  readonly excludedWords = signal<string[]>([]);
  readonly excludedWord = signal('');
  readonly yearFrom = signal<number | null>(null);
  readonly yearTo = signal<number | null>(null);
  readonly priceMin = signal<number | null>(null);
  readonly priceMax = signal<number | null>(null);
  readonly priceCurrency = signal<number | null>(null);

  readonly rawProducts = signal<Product[]>([]);
  readonly loading = signal(false);
  readonly searched = signal(false);
  readonly loadedPages = signal(0);
  readonly totalPages = signal(0);
  readonly progress = computed(() => this.totalPages() ? Math.round(this.loadedPages() / this.totalPages() * 100) : 0);
  readonly isVehicleSearch = computed(() => isVehicleQuery(this.query()));
  readonly activeVehicleSearch = computed(() => isVehicleQuery(this.activeQuery()));
  readonly queryYear = computed(() => yearIn(this.query()));
  readonly activeQueryYear = computed(() => yearIn(this.activeQuery()));
  readonly yearRangeInvalid = computed(() => this.yearFrom() !== null && this.yearTo() !== null && this.yearFrom()! > this.yearTo()!);
  readonly priceRangeInvalid = computed(() => this.priceMin() !== null && this.priceMax() !== null && this.priceMin()! > this.priceMax()!);
  readonly products = computed(() => this.filterAndSort(this.rawProducts()));
  readonly hiddenCount = computed(() => this.rawProducts().length - this.products().length);
  readonly hasCustomFilters = computed(() => this.order() !== 'relevance' || !this.smartCleanup() || this.excludeNegotiable() || this.onlyWithPhotos() || this.excludedWords().length > 0 || this.yearFrom() !== null || this.yearTo() !== null || this.priceMin() !== null || this.priceMax() !== null || this.priceCurrency() !== null);
  readonly priceCeiling = computed(() => {
    const currency = this.priceCurrency();
    const prices = this.rawProducts().filter((product) => product.price != null && (currency === null || product.currency === currency)).map((product) => product.price!);
    return niceCeiling(Math.max(...prices, 0));
  });
  readonly priceStep = computed(() => Math.max(1, 10 ** Math.max(0, String(this.priceCeiling()).length - 3)));
  readonly suggestedExclusions = computed(() => {
    const queryWords = new Set(tokens(this.activeQuery()));
    const current = new Set(this.excludedWords());
    const counts = new Map<string, number>();
    for (const product of this.rawProducts()) {
      for (const word of new Set(tokens(product.title))) counts.set(word, (counts.get(word) ?? 0) + 1);
    }
    return [...counts]
      .filter(([word, count]) => !queryWords.has(word) && !current.has(word) && !ignoredSuggestionWords.has(word) && word.length > 2 && (noiseWords.has(word) || count >= Math.max(3, Math.ceil(this.rawProducts().length * .18))))
      .sort((a, b) => Number(noiseWords.has(b[0])) - Number(noiseWords.has(a[0])) || b[1] - a[1])
      .slice(0, 5)
      .map(([word]) => word);
  });

  ngOnDestroy(): void { this.controller?.abort(); }

  async search(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    const query = this.query().trim();
    if (!query || this.loading() || this.yearRangeInvalid() || this.priceRangeInvalid()) return;

    this.controller?.abort();
    this.ids.clear();
    this.rawProducts.set([]);
    this.activeQuery.set(query);
    this.loadedPages.set(0);
    this.totalPages.set(0);
    this.loading.set(true);
    this.searched.set(true);

    const queryYear = this.queryYear();
    const filters: SearchFilters = {
      smartCleanup: this.smartCleanup(),
      productSearchCriteria: query,
      excludeBoosted: this.smartCleanup(),
      excludePriceNegotiable: this.excludeNegotiable(),
      excludeOtherAds: this.smartCleanup(),
      order: this.order(),
      keysToExclude: this.excludedWords(),
      intent: this.isVehicleSearch() ? 'car' : undefined,
      yearFrom: this.yearFrom() ?? queryYear ?? undefined,
      yearTo: this.yearTo() ?? queryYear ?? undefined,
      priceMin: this.priceMin() ?? undefined,
      priceMax: this.priceMax() ?? undefined,
      currency: this.priceCurrency() ?? undefined,
    };
    const controller = new AbortController();
    this.controller = controller;
    try {
      await this.searchService.stream(filters, controller.signal, (streamEvent) => this.receive(streamEvent));
    } catch (error) {
      if (!controller.signal.aborted) this.toast.error(error instanceof Error ? error.message : 'Search failed.');
    } finally {
      if (this.controller === controller) this.loading.set(false);
    }
  }

  cancel(): void {
    this.controller?.abort();
    this.loading.set(false);
  }

  addExcludedWord(event: KeyboardEvent): void {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    this.addExclusion(this.excludedWord());
    this.excludedWord.set('');
  }

  addExclusion(value: string): void {
    const word = tokens(value).join(' ');
    if (word && !this.excludedWords().includes(word)) this.excludedWords.update((words) => [...words, word]);
  }

  removeExcludedWord(word: string): void {
    this.excludedWords.update((words) => words.filter((item) => item !== word));
  }

  setYear(bound: 'from' | 'to', event: Event): void {
    const value = (event.target as HTMLInputElement).valueAsNumber;
    (bound === 'from' ? this.yearFrom : this.yearTo).set(Number.isFinite(value) ? value : null);
  }

  setYearPreset(year: number | null): void {
    this.yearFrom.set(year);
    this.yearTo.set(null);
  }

  setPrice(bound: 'min' | 'max', event: Event): void {
    const value = (event.target as HTMLInputElement).valueAsNumber;
    (bound === 'min' ? this.priceMin : this.priceMax).set(Number.isFinite(value) && value >= 0 ? value : null);
  }

  setBudget(event: Event): void {
    const value = (event.target as HTMLInputElement).valueAsNumber;
    this.priceMax.set(value >= this.priceCeiling() ? null : value);
  }

  setCurrency(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.priceCurrency.set(value === '' ? null : Number(value));
    this.priceMax.set(null);
  }

  resetFilters(): void {
    this.order.set('relevance');
    this.smartCleanup.set(true);
    this.excludeNegotiable.set(false);
    this.onlyWithPhotos.set(false);
    this.excludedWords.set([]);
    this.yearFrom.set(null);
    this.yearTo.set(null);
    this.priceMin.set(null);
    this.priceMax.set(null);
    this.priceCurrency.set(null);
  }

  private receive(event: SearchEvent): void {
    if (event.loadedPages != null) this.loadedPages.set(event.loadedPages);
    if (event.totalPages != null) this.totalPages.set(event.totalPages);
    if (event.type === 'error') {
      this.loading.set(false);
      this.toast.error(event.message || 'Search ended early.');
    }
    if (event.type !== 'chunk') return;
    const additions = (event.products ?? []).filter((product) => {
      if (this.ids.has(product.id)) return false;
      this.ids.add(product.id);
      return true;
    });
    if (additions.length) this.rawProducts.update((products) => [...products, ...additions]);
  }

  private filterAndSort(source: Product[]): Product[] {
    const queryWords = tokens(this.activeQuery()).filter((word) => !this.activeVehicleSearch() || !isYear(word));
    const excluded = this.excludedWords().map(tokens);
    const signatures = new Set<string>();
    const products = source.filter((product) => {
      const titleWords = tokens(product.title);
      const signature = `${titleWords.join(' ')}|${product.price ?? ''}|${product.currency}`;
      if (this.smartCleanup() && (product.isBoosted || !containsAll(titleWords, queryWords) || signatures.has(signature))) return false;
      if (this.smartCleanup() && this.activeVehicleSearch() && !plausibleCar(product, titleWords)) return false;
      const from = this.yearFrom() ?? this.activeQueryYear();
      const to = this.yearTo() ?? this.activeQueryYear();
      if ((from !== null && (product.year ?? 0) < from) || (to !== null && (product.year ?? 0) > to)) return false;
      if (this.excludeNegotiable() && product.price == null) return false;
      if (this.onlyWithPhotos() && !product.thumbnailURL) return false;
      if (this.priceCurrency() !== null && product.currency !== this.priceCurrency()) return false;
      if (this.priceMin() !== null && (product.price == null || product.price < this.priceMin()!)) return false;
      if (this.priceMax() !== null && (product.price == null || product.price > this.priceMax()!)) return false;
      if (excluded.some((phrase) => containsPhrase(titleWords, phrase))) return false;
      if (this.smartCleanup()) signatures.add(signature);
      return true;
    });
    const direction = this.order() === 'priceDesc' ? -1 : 1;
    return products.sort((a, b) => {
      if (this.order() === 'relevance') return relevance(b, queryWords) - relevance(a, queryWords) || comparePrice(a, b, 1);
      return comparePrice(a, b, direction);
    });
  }
}

function tokens(value: string): string[] { return value.toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []; }
function isVehicleQuery(value: string): boolean { return tokens(value).some((word) => vehicleMakes.has(word)); }
function yearIn(value: string): number | null { const match = value.match(/\b(19[5-9]\d|20[0-3]\d)\b/)?.[0]; return match ? Number(match) : null; }
function isYear(value: string): boolean { const year = Number(value); return Number.isInteger(year) && year >= 1950 && year <= 2030; }
function containsAll(words: string[], required: string[]): boolean { return required.length > 0 && required.every((word) => words.includes(word)); }
function containsPhrase(words: string[], phrase: string[]): boolean { return words.some((_, index) => phrase.every((word, offset) => words[index + offset] === word)); }
function plausibleCar(product: Product, titleWords: string[]): boolean {
  if (!product.make || !product.model || !product.year || product.price == null || titleWords.some((word) => carNoise.has(word))) return false;
  return product.price >= (product.currency === 0 ? 5_000 : 300);
}
function relevance(product: Product, queryWords: string[]): number {
  const title = tokens(product.title);
  const exact = title.join(' ') === queryWords.join(' ') ? 100 : 0;
  return exact + (containsAll(title, queryWords) ? 40 : 0) + (product.make && product.model ? 20 : 0) + (product.isBoosted ? 0 : 5);
}
function comparePrice(a: Product, b: Product, direction: number): number {
  if (a.price == null) return 1;
  if (b.price == null) return -1;
  return (a.price - b.price) * direction;
}
function niceCeiling(value: number): number {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  return Math.ceil(value / magnitude * 10) / 10 * magnitude;
}
