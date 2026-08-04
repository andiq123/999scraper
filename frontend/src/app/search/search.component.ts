import { ChangeDetectionStrategy, Component, ElementRef, HostListener, OnDestroy, afterNextRender, computed, effect, inject, signal, viewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../auth/auth.service';
import { Product, SortOrder } from '../models';
import { ToastService } from '../toast.service';
import { ProductCardComponent } from './product-card.component';
import { SearchEvent, SearchService } from './search.service';
import { SearchState, SearchStateService } from './search-state.service';
import { RecentSearchesService } from './recent-searches.service';
import { UserDataService } from '../user-data.service';
import { CurrencyService } from '../currency.service';
import { SearchIntent, SearchKind, type PropertyListingMode, bodyTypeOptions, drivetrainOptions, fold, fuelOptions, generationIn, parseSearchIntent, storageIn, storageOptions, transmissionOptions } from './search-intent';
import { SearchSuggestion, completeSearchInput, marketCategories, suggestionsFor } from './search-suggestions';
import { RangeFilterComponent, type RangePreset } from './range-filter.component';
import { type CollapsiblePanel, UiPreferencesService } from '../ui-preferences.service';
const carNoise = new Set([
  'accesorii', 'acumulator', 'anvelope', 'capace', 'covorașe', 'covorase', 'dezmembrare', 'dezmembrări',
  'faruri', 'huse', 'jante', 'piese', 'roți', 'scut', 'sticlă', 'sticla', 'radiator', 'radiatoare', 'adaptor',
  'amortizator', 'amortizatoare', 'închiriere', 'inchiriere', 'chirie', 'reparație', 'reparatie', 'разборка',
  'запчасти', 'детали', 'коврики', 'чехлы', 'диски', 'шины', 'аренда', 'ремонт',
]);
const noiseWords = new Set([...carNoise, 'credit', 'leasing', 'livrare', 'rate', 'schimb', 'reparație', 'reparatie', 'доставка', 'кредит']);
const ignoredSuggestionWords = new Set([
  'pentru', 'with', 'from', 'the', 'and', 'sau', 'este', 'sunt', 'auto', 'nou', 'nouă', 'noi', 'vând',
  'продам', 'для', 'или', 'это', 'год', 'anul',
]);
const deviceNoise = new Set([
  'accesorii', 'accessories', 'cablu', 'cable', 'case', 'carcasă', 'carcasa', 'chirie', 'controller', 'husă',
  'husa', 'joc', 'jocuri', 'repair', 'reparație', 'reparatie', 'service', 'abonament', 'subscription', 'cont',
  'account', 'аренда', 'игры', 'ремонт', 'чехол', 'кабель', 'подписка',
]);
const chisinauSectors = ['Aeroport', 'Botanica', 'Buiucani', 'Centru', 'Ciocana', 'Poșta Veche', 'Râșcani', 'Sculeni', 'Telecentru'] as const;
const housingStockOptions = ['Construcții noi', 'Secundar'] as const;
const listingAuthorOptions = ['Persoană fizică', 'Agenție', 'Dezvoltator imobiliar', 'Bancă'] as const;
interface FilterChip { id: string; label: string }

@Component({
  selector: 'app-search',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ProductCardComponent, RangeFilterComponent],
  templateUrl: './search.component.html',
  styleUrl: './search.component.scss',
})
export class SearchComponent implements OnDestroy {
  private readonly searchService = inject(SearchService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  readonly searchState = inject(SearchStateService);
  readonly recentSearches = inject(RecentSearchesService);
  readonly auth = inject(AuthService);
  readonly library = inject(UserDataService);
  readonly currency = inject(CurrencyService);
  readonly uiPreferences = inject(UiPreferencesService);
  private readonly ids = new Set<string>();
  private controller?: AbortController;
  private draftKind: SearchKind = 'generic';
  private draftHadPrice = false;
  private readonly searchInput = viewChild<ElementRef<HTMLInputElement>>('searchInput');

  readonly query = signal('');
  readonly suggestionsOpen = signal(false);
  readonly activeSuggestionIndex = signal(-1);
  readonly activeQuery = signal('');
  readonly searchAssist = signal<string | null>(null);
  readonly order = signal<SortOrder>('relevance');
  readonly smartCleanup = signal(true);
  readonly excludeNegotiable = signal(false);
  readonly onlyWithPhotos = signal(false);
  readonly excludedWords = signal<string[]>([]);
  readonly excludedWord = signal('');
  readonly queryExclusions = signal<string[]>([]);
  readonly yearFrom = signal<number | null>(null);
  readonly yearTo = signal<number | null>(null);
  readonly priceMin = signal<number | null>(null);
  readonly priceMax = signal<number | null>(null);
  readonly priceCurrency = signal<number | null>(null);
  readonly fuel = signal<string | null>(null);
  readonly transmission = signal<string | null>(null);
  readonly generationFrom = signal<number | null>(null);
  readonly generationTo = signal<number | null>(null);
  readonly storageFrom = signal<number | null>(null);
  readonly storageTo = signal<number | null>(null);
  readonly ramFrom = signal<number | null>(null);
  readonly ramTo = signal<number | null>(null);
  readonly roomsFrom = signal<number | null>(null);
  readonly roomsTo = signal<number | null>(null);
  readonly areaFrom = signal<number | null>(null);
  readonly areaTo = signal<number | null>(null);
  readonly floorFrom = signal<number | null>(null);
  readonly floorTo = signal<number | null>(null);
  readonly propertySector = signal('');
  readonly propertyState = signal<string | null>(null);
  readonly housingStock = signal<string | null>(null);
  readonly listingAuthor = signal<string | null>(null);
  readonly buildingType = signal<string | null>(null);
  readonly screenFrom = signal<number | null>(null);
  readonly screenTo = signal<number | null>(null);
  readonly mileageFrom = signal<number | null>(null);
  readonly mileageTo = signal<number | null>(null);
  readonly powerFrom = signal<number | null>(null);
  readonly powerTo = signal<number | null>(null);
  readonly drivetrain = signal<string | null>(null);
  readonly bodyType = signal<string | null>(null);
  readonly registration = signal<'moldova' | 'other' | null>(null);
  readonly deviceTags = signal<string[]>([]);
  readonly condition = signal<'new' | 'used' | null>(null);
  readonly listingMode = signal<PropertyListingMode | null>(null);
  readonly activeIntent = signal<SearchIntent>(parseSearchIntent(''));
  readonly fuelOptions = fuelOptions;
  readonly transmissionOptions = transmissionOptions;
  readonly drivetrainOptions = drivetrainOptions;
  readonly bodyTypeOptions = bodyTypeOptions;
  readonly storageOptions = storageOptions;
  readonly yearPresets: readonly RangePreset[] = [{ label: 'Any', from: null, to: null }, { label: '2010+', from: 2010, to: null }, { label: '2015+', from: 2015, to: null }, { label: '2020+', from: 2020, to: null }];
  readonly mileagePresets: readonly RangePreset[] = [{ label: 'Any', from: null, to: null }, { label: '≤ 50k', from: null, to: 50_000 }, { label: '≤ 100k', from: null, to: 100_000 }, { label: '≤ 200k', from: null, to: 200_000 }];
  readonly powerPresets: readonly RangePreset[] = [{ label: 'Any', from: null, to: null }, { label: '≤ 150', from: null, to: 150 }, { label: '150–250', from: 150, to: 250 }, { label: '250+', from: 250, to: null }];
  readonly roomPresets: readonly RangePreset[] = [{ label: 'Any', from: null, to: null }, { label: '1', from: 1, to: 1 }, { label: '2', from: 2, to: 2 }, { label: '3+', from: 3, to: null }];
  readonly areaPresets: readonly RangePreset[] = [{ label: 'Any', from: null, to: null }, { label: '≤ 50', from: null, to: 50 }, { label: '50–100', from: 50, to: 100 }, { label: '100+', from: 100, to: null }];
  readonly floorPresets: readonly RangePreset[] = [{ label: 'Any', from: null, to: null }, { label: '1–3', from: 1, to: 3 }, { label: '4–8', from: 4, to: 8 }, { label: '9+', from: 9, to: null }];
  readonly housingStockOptions = housingStockOptions;
  readonly listingAuthorOptions = listingAuthorOptions;
  readonly marketCategories = marketCategories;
  readonly searchSuggestions = computed(() => suggestionsFor(this.query(), this.recentSearches.items()));
  readonly deviceTagOptions = computed(() => this.searchIntent().kind === 'iphone' ? ['pro', 'max', 'plus', 'mini'] : ['slim', 'pro', 'digital', 'disc']);

  readonly rawProducts = signal<Product[]>([]);
  readonly propertySectorOptions = computed(() => facetValues(this.rawProducts(), (product) => product.sector, chisinauSectors));
  readonly propertyStateOptions = computed(() => facetValues(this.rawProducts(), (product) => product.propertyState));
  readonly buildingTypeOptions = computed(() => facetValues(this.rawProducts(), (product) => product.buildingType));
  readonly loading = signal(false);
  readonly searched = signal(false);
  readonly loadedPages = signal(0);
  readonly totalPages = signal(0);
  readonly progress = computed(() => this.totalPages() ? Math.round(this.loadedPages() / this.totalPages() * 100) : 0);
  readonly searchIntent = computed(() => parseSearchIntent(this.query()));
  readonly newSearchPending = computed(() => this.searched() && searchKey(this.searchIntent().sourceQuery) !== searchKey(this.activeQuery()));
  readonly showSearchSuggestions = computed(() => this.suggestionsOpen() && (!this.searched() || this.newSearchPending()) && this.query().trim().length > 0 && this.searchSuggestions().length > 0);
  readonly activeSuggestionId = computed(() => this.showSearchSuggestions() && this.activeSuggestionIndex() >= 0 ? `search-suggestion-${this.activeSuggestionIndex()}` : null);
  readonly filterIntent = computed(() => this.newSearchPending() ? this.activeIntent() : this.searchIntent());
  readonly isVehicleSearch = computed(() => this.filterIntent().kind === 'vehicle');
  readonly isDeviceSearch = computed(() => this.filterIntent().kind === 'iphone' || this.filterIntent().kind === 'playstation');
  readonly isComputerSearch = computed(() => this.filterIntent().kind === 'laptop' || this.filterIntent().kind === 'phone');
  readonly isPropertySearch = computed(() => this.filterIntent().kind === 'realEstate');
  readonly isTVSearch = computed(() => this.filterIntent().kind === 'tv');
  readonly hasSmartPrompt = computed(() => this.searchIntent().kind !== 'generic' && !this.newSearchPending());
  readonly activeVehicleSearch = computed(() => this.activeIntent().kind === 'vehicle');
  readonly smartTitle = computed(() => ({
    vehicle: 'Smart vehicle filters', iphone: 'Smart iPhone filters', phone: 'Smart phone filters',
    playstation: 'Smart PlayStation filters', laptop: 'Smart laptop filters', tv: 'Smart TV filters',
    realEstate: 'Smart property filters', generic: 'Smart filters',
  })[this.searchIntent().kind]);
  readonly smartSummary = computed(() => {
    const intent = this.searchIntent();
    if (intent.kind === 'vehicle') {
      const range = this.mileageFrom() !== null || this.mileageTo() !== null ? rangeSummary('Mileage', this.mileageFrom(), this.mileageTo()).replace(/(\d+)/g, '$1 km') : rangeSummary('Model years', this.yearFrom(), this.yearTo());
      return this.registration() ? `${range} · ${this.registration() === 'moldova' ? 'Moldova registration' : 'Other registration'}` : range;
    }
    if (intent.kind === 'iphone' || intent.kind === 'playstation') return rangeSummary(intent.kind === 'iphone' ? 'iPhone generations' : 'PlayStation generations', this.generationFrom(), this.generationTo());
    if (intent.kind === 'realEstate') return this.propertySector().trim() || (this.listingMode() === 'monthly' ? 'Monthly rentals' : this.listingMode() === 'daily' ? 'Daily rentals' : rangeSummary('Rooms', this.roomsFrom(), this.roomsTo()));
    if (intent.kind === 'tv') return rangeSummary('Screen size', this.screenFrom(), this.screenTo());
    return rangeSummary('RAM', this.ramFrom(), this.ramTo());
  });
  readonly yearRangeInvalid = computed(() => this.yearFrom() !== null && this.yearTo() !== null && this.yearFrom()! > this.yearTo()!);
  readonly generationRangeInvalid = computed(() => this.generationFrom() !== null && this.generationTo() !== null && this.generationFrom()! > this.generationTo()!);
  readonly storageRangeInvalid = computed(() => this.storageFrom() !== null && this.storageTo() !== null && this.storageFrom()! > this.storageTo()!);
  readonly ramRangeInvalid = computed(() => this.ramFrom() !== null && this.ramTo() !== null && this.ramFrom()! > this.ramTo()!);
  readonly roomsRangeInvalid = computed(() => this.roomsFrom() !== null && this.roomsTo() !== null && this.roomsFrom()! > this.roomsTo()!);
  readonly areaRangeInvalid = computed(() => this.areaFrom() !== null && this.areaTo() !== null && this.areaFrom()! > this.areaTo()!);
  readonly floorRangeInvalid = computed(() => this.floorFrom() !== null && this.floorTo() !== null && this.floorFrom()! > this.floorTo()!);
  readonly screenRangeInvalid = computed(() => this.screenFrom() !== null && this.screenTo() !== null && this.screenFrom()! > this.screenTo()!);
  readonly mileageRangeInvalid = computed(() => this.mileageFrom() !== null && this.mileageTo() !== null && this.mileageFrom()! > this.mileageTo()!);
  readonly powerRangeInvalid = computed(() => this.powerFrom() !== null && this.powerTo() !== null && this.powerFrom()! > this.powerTo()!);
  readonly priceRangeInvalid = computed(() => this.priceMin() !== null && this.priceMax() !== null && this.priceMin()! > this.priceMax()!);
  private readonly productsBeforePrice = computed(() => this.filterAndSort(this.rawProducts()));
  private readonly availablePrices = computed(() => convertedPrices(this.productsBeforePrice(), this.currency, this.priceCurrency() ?? defaultPriceCurrency(this.filterIntent())));
  private readonly observedPriceRange = computed(() => priceBounds(this.availablePrices()));
  readonly products = computed(() => {
    const min = this.priceMin();
    const max = this.priceMax();
    if (min === null && max === null) return this.productsBeforePrice();
    return this.productsBeforePrice().filter((product) => {
      const value = this.currency.convert(product, this.priceCurrency());
      return value !== null && (min === null || value >= min) && (max === null || value <= max);
    });
  });
  readonly priceRangeUpdating = computed(() => this.loading() && this.availablePrices().length > 0);
  readonly hiddenCount = computed(() => this.rawProducts().length - this.products().length);
  readonly visiblePriceSummary = computed(() => {
    const target = this.priceCurrency() ?? defaultPriceCurrency(this.filterIntent());
    let lowest = Number.POSITIVE_INFINITY;
    let highest = Number.NEGATIVE_INFINITY;
    let converted = false;
    for (const product of this.products()) {
      const value = this.currency.convert(product, target);
      if (value === null) continue;
      lowest = Math.min(lowest, value);
      highest = Math.max(highest, value);
      converted ||= product.currency !== target;
    }
    if (!Number.isFinite(lowest)) return '';
    const minimum = formatNumber(Math.round(lowest));
    const maximum = formatNumber(Math.round(highest));
    const range = minimum === maximum ? minimum : `${minimum}–${maximum}`;
    return `${converted ? '≈ ' : ''}${range} ${['MDL', 'EUR', 'USD'][target]}`;
  });
  readonly hasCustomFilters = computed(() => this.order() !== 'relevance' || !this.smartCleanup() || this.excludeNegotiable() || this.onlyWithPhotos() || this.excludedWords().length > 0 || this.queryExclusions().length > 0 || this.yearFrom() !== null || this.yearTo() !== null || this.priceMin() !== null || this.priceMax() !== null || this.fuel() !== null || this.transmission() !== null || this.mileageFrom() !== null || this.mileageTo() !== null || this.powerFrom() !== null || this.powerTo() !== null || this.drivetrain() !== null || this.bodyType() !== null || this.registration() !== null || this.generationFrom() !== null || this.generationTo() !== null || this.storageFrom() !== null || this.storageTo() !== null || this.ramFrom() !== null || this.ramTo() !== null || this.roomsFrom() !== null || this.roomsTo() !== null || this.areaFrom() !== null || this.areaTo() !== null || this.floorFrom() !== null || this.floorTo() !== null || this.propertySector().trim() !== '' || this.propertyState() !== null || this.housingStock() !== null || this.listingAuthor() !== null || this.buildingType() !== null || this.screenFrom() !== null || this.screenTo() !== null || this.deviceTags().length > 0 || this.condition() !== null || this.listingMode() !== null);
  readonly priceFloor = computed(() => this.observedPriceRange()?.min ?? 0);
  readonly priceCeiling = computed(() => {
    const observed = this.observedPriceRange();
    if (!observed) return priceCap(this.filterIntent(), this.priceCurrency(), this.listingMode());
    return observed.max > observed.min ? observed.max : observed.min + Math.max(1, Math.round(observed.min * .1));
  });
  readonly priceStep = computed(() => priceSliderStep(this.priceCeiling() - this.priceFloor()));
  readonly pricePresets = computed(() => adaptivePricePresets(this.availablePrices(), budgetPresets(this.filterIntent(), this.priceCurrency(), this.listingMode())));
  readonly priceCurrencyLabel = computed(() => ['MDL', 'EUR', 'USD'][this.priceCurrency() ?? -1] ?? 'listing currency');
  readonly priceFloorLabel = computed(() => formatNumber(this.priceFloor()));
  readonly priceCeilingLabel = computed(() => formatNumber(this.priceCeiling()));
  readonly priceMinPercent = computed(() => percentage((this.priceMin() ?? this.priceFloor()) - this.priceFloor(), this.priceCeiling() - this.priceFloor()));
  readonly priceMaxPercent = computed(() => percentage((this.priceMax() ?? this.priceCeiling()) - this.priceFloor(), this.priceCeiling() - this.priceFloor()));
  readonly priceRangeLabel = computed(() => {
    const min = this.priceMin();
    const max = this.priceMax();
    if (min === null && max === null) return 'Any';
    if (min === null) return `Up to ${formatNumber(max!)}`;
    if (max === null) return `From ${formatNumber(min)}`;
    return `${formatNumber(min)}–${formatNumber(max)}`;
  });
  readonly activeFilterChips = computed<FilterChip[]>(() => {
    const chips: FilterChip[] = [];
    if (this.order() !== 'relevance') chips.push({ id: 'order', label: this.order() === 'priceAsc' ? 'Lowest price' : 'Highest price' });
    if (!this.smartCleanup()) chips.push({ id: 'cleanup', label: 'Cleanup off' });
    if (this.onlyWithPhotos()) chips.push({ id: 'photos', label: 'With photos' });
    if (this.excludeNegotiable()) chips.push({ id: 'fixed', label: 'Fixed price' });
    if (this.yearFrom() !== null || this.yearTo() !== null) chips.push({ id: 'year', label: rangeSummary('Year', this.yearFrom(), this.yearTo()) });
    if (this.generationFrom() !== null || this.generationTo() !== null) chips.push({ id: 'generation', label: rangeSummary('Generation', this.generationFrom(), this.generationTo()) });
    if (this.storageFrom() !== null || this.storageTo() !== null) chips.push({ id: 'storage', label: rangeSummary('Storage', this.storageFrom(), this.storageTo()).replace(/(\d+)/g, '$1 GB') });
    if (this.ramFrom() !== null || this.ramTo() !== null) chips.push({ id: 'ram', label: rangeSummary('RAM', this.ramFrom(), this.ramTo()).replace(/(\d+)/g, '$1 GB') });
    if (this.roomsFrom() !== null || this.roomsTo() !== null) chips.push({ id: 'rooms', label: rangeSummary('Rooms', this.roomsFrom(), this.roomsTo()) });
    if (this.areaFrom() !== null || this.areaTo() !== null) chips.push({ id: 'area', label: rangeSummary('Area', this.areaFrom(), this.areaTo()).replace(/(\d+)/g, '$1 m²') });
    if (this.floorFrom() !== null || this.floorTo() !== null) chips.push({ id: 'floor', label: rangeSummary('Floor', this.floorFrom(), this.floorTo()) });
    if (this.propertySector().trim()) chips.push({ id: 'property-sector', label: this.propertySector().trim() });
    if (this.propertyState()) chips.push({ id: 'property-state', label: this.propertyState()! });
    if (this.housingStock()) chips.push({ id: 'housing-stock', label: this.housingStock()! });
    if (this.listingAuthor()) chips.push({ id: 'listing-author', label: this.listingAuthor()! });
    if (this.buildingType()) chips.push({ id: 'building-type', label: this.buildingType()! });
    if (this.screenFrom() !== null || this.screenTo() !== null) chips.push({ id: 'screen', label: rangeSummary('Screen', this.screenFrom(), this.screenTo()).replace(/(\d+(?:\.\d+)?)/g, '$1″') });
    if (this.priceMin() !== null || this.priceMax() !== null) chips.push({ id: 'price', label: `${this.priceRangeLabel()} ${this.priceCurrencyLabel()}` });
    if (this.fuel()) chips.push({ id: 'fuel', label: this.fuel()! });
    if (this.transmission()) chips.push({ id: 'transmission', label: this.transmission()! });
    if (this.mileageFrom() !== null || this.mileageTo() !== null) chips.push({ id: 'mileage', label: rangeSummary('Mileage', this.mileageFrom(), this.mileageTo()).replace(/(\d+)/g, '$1 km') });
    if (this.powerFrom() !== null || this.powerTo() !== null) chips.push({ id: 'power', label: rangeSummary('Power', this.powerFrom(), this.powerTo()).replace(/(\d+)/g, '$1 hp') });
    if (this.drivetrain()) chips.push({ id: 'drivetrain', label: this.drivetrain()! });
    if (this.bodyType()) chips.push({ id: 'body-type', label: this.bodyType()! });
    if (this.registration()) chips.push({ id: 'registration', label: this.registration() === 'moldova' ? 'Registered in Moldova' : 'Other registration' });
    if (this.condition()) chips.push({ id: 'condition', label: this.condition() === 'new' ? 'New' : 'Used' });
    if (this.listingMode()) chips.push({ id: 'listing-mode', label: this.listingMode() === 'monthly' ? 'Monthly rent' : this.listingMode() === 'daily' ? 'Daily rent' : 'For sale' });
    for (const tag of this.deviceTags()) chips.push({ id: `tag:${tag}`, label: tag[0].toUpperCase() + tag.slice(1) });
    for (const word of this.queryExclusions()) chips.push({ id: `query-exclude:${word}`, label: `Without ${word}` });
    const queryExcluded = new Set(this.queryExclusions().map(fold));
    for (const word of this.excludedWords()) if (!queryExcluded.has(fold(word))) chips.push({ id: `exclude:${word}`, label: `Hide ${word}` });
    const labels = new Set<string>();
    return chips.filter((chip) => {
      const label = fold(chip.label);
      if (labels.has(label)) return false;
      labels.add(label);
      return true;
    });
  });
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

  constructor() {
    void this.currency.load();
    const freshEntry = this.route.snapshot.queryParamMap.get('fresh') === '1';
    if (freshEntry) {
      this.searchState.startFresh();
      void this.router.navigate([], { relativeTo: this.route, queryParams: { fresh: null }, replaceUrl: true });
    }
    const cached = this.searchState.snapshot();
    const replay = this.route.snapshot.queryParamMap.get('q')?.trim();
    const canRestore = cached && (!replay || replay === cached.activeQuery);
    if (canRestore) {
      this.restore(cached);
      afterNextRender(() => window.requestAnimationFrame(() => window.scrollTo({ top: cached.scrollY, behavior: 'instant' })));
    } else if (replay) {
      this.updateQuery(replay);
      queueMicrotask(() => void this.search());
    }
    void this.loadPersonalData(!canRestore);
    let handledFreshRequest = this.searchState.freshRequests();
    effect(() => {
      const request = this.searchState.freshRequests();
      if (request === handledFreshRequest) return;
      handledFreshRequest = request;
      this.startFreshWorkspace();
    });
    effect(() => this.searchState.save(this.snapshot(window.scrollY)));
  }

  ngOnDestroy(): void {
    this.controller?.abort();
    this.searchState.save(this.snapshot(window.scrollY), true);
  }

  @HostListener('window:pagehide')
  cacheBeforePageExit(): void { this.searchState.save(this.snapshot(window.scrollY), true); }

  @HostListener('window:scroll')
  closeSuggestionsOnScroll(): void {
    if (this.suggestionsOpen()) this.closeSearchSuggestions();
  }

  async search(event?: SubmitEvent): Promise<void> {
    event?.preventDefault();
    this.closeSearchSuggestions();
    this.searchInput()?.nativeElement.blur();
    const typedQuery = this.query().trim();
    const query = completeSearchInput(typedQuery).trim();
    if (!query || (this.loading() && !this.newSearchPending())) return;
    if (query !== typedQuery) {
      this.updateQuery(query);
      this.searchAssist.set(`Completed “${typedQuery}” to “${query}”`);
    } else {
      this.searchAssist.set(null);
    }

    const intent = parseSearchIntent(query);
    if (this.newSearchPending()) this.applyIntentFilters(intent, true, true);
    if (this.yearRangeInvalid() || this.mileageRangeInvalid() || this.powerRangeInvalid() || this.generationRangeInvalid() || this.storageRangeInvalid() || this.ramRangeInvalid() || this.roomsRangeInvalid() || this.areaRangeInvalid() || this.floorRangeInvalid() || this.screenRangeInvalid() || this.priceRangeInvalid()) return;
    this.recentSearches.add(query);

    this.controller?.abort();
    this.ids.clear();
    this.rawProducts.set([]);
    this.activeQuery.set(intent.sourceQuery);
    this.activeIntent.set(intent);
    this.loadedPages.set(0);
    this.totalPages.set(0);
    this.loading.set(true);
    this.searched.set(true);
    void this.router.navigate([], { relativeTo: this.route, queryParams: { q: intent.sourceQuery }, replaceUrl: true });

    const controller = new AbortController();
    this.controller = controller;
    try {
      await this.searchService.stream(intent.sourceQuery, controller.signal, (streamEvent) => this.receive(streamEvent));
    } catch (error) {
      if (!controller.signal.aborted) this.toast.error(error instanceof Error ? error.message : 'Search failed.');
    } finally {
      if (this.controller === controller) {
        this.controller = undefined;
        this.loading.set(false);
      }
    }
  }

  cancel(): void {
    this.controller?.abort();
    this.controller = undefined;
    this.loading.set(false);
  }

  startOver(): void {
    this.searchState.clearAll();
    this.startFreshWorkspace();
    window.requestAnimationFrame(() => this.searchInput()?.nativeElement.focus());
  }

  updateQuery(value: string): void {
    this.searchAssist.set(null);
    this.activeSuggestionIndex.set(-1);
    const previousKind = this.draftKind;
    this.query.set(value);
    const intent = parseSearchIntent(value);
    const kindChanged = Boolean(value.trim()) && previousKind !== intent.kind;
    const hadParsedPrice = this.draftHadPrice;
    const hasParsedPrice = intent.price.from !== null || intent.price.to !== null;
    if (value.trim()) this.draftKind = intent.kind;
    this.draftHadPrice = hasParsedPrice;
    // Keep the submitted search streaming while a different query is only a
    // draft. Replace it after the user explicitly submits the draft.
    if (this.newSearchPending()) return;
    this.applyIntentFilters(intent, kindChanged, kindChanged || hadParsedPrice || hasParsedPrice);
  }

  openSearchSuggestions(): void { this.suggestionsOpen.set(true); }

  closeSearchSuggestions(): void {
    this.suggestionsOpen.set(false);
    this.activeSuggestionIndex.set(-1);
  }

  handleSearchKeys(event: KeyboardEvent): void {
    const suggestions = this.searchSuggestions();
    if (event.key === 'Escape') return this.closeSearchSuggestions();
    if (event.key === 'Tab') return this.closeSearchSuggestions();
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (!suggestions.length) return;
      event.preventDefault();
      this.suggestionsOpen.set(true);
      const direction = event.key === 'ArrowDown' ? 1 : -1;
      const current = this.activeSuggestionIndex();
      this.activeSuggestionIndex.set(current < 0 ? (direction > 0 ? 0 : suggestions.length - 1) : (current + direction + suggestions.length) % suggestions.length);
      return;
    }
    if (event.key === 'Enter' && this.showSearchSuggestions() && this.activeSuggestionIndex() >= 0) {
      event.preventDefault();
      this.chooseSuggestion(suggestions[this.activeSuggestionIndex()]);
    }
  }

  chooseSuggestion(suggestion: SearchSuggestion): void {
    this.updateQuery(suggestion.value);
    this.closeSearchSuggestions();
    void this.search();
  }

  private applyIntentFilters(intent: SearchIntent, adapt: boolean, resetPrice: boolean): void {
    if (adapt) this.adaptFiltersTo(intent);
    if (this.query().trim() && (adapt || this.priceCurrency() === null)) this.priceCurrency.set(defaultPriceCurrency(intent));
    this.yearFrom.set(intent.year.from);
    this.yearTo.set(intent.year.to);
    this.generationFrom.set(intent.generation.from);
    this.generationTo.set(intent.generation.to);
    this.storageFrom.set(intent.storage.from);
    this.storageTo.set(intent.storage.to);
    this.ramFrom.set(intent.ram.from);
    this.ramTo.set(intent.ram.to);
    this.roomsFrom.set(intent.rooms.from);
    this.roomsTo.set(intent.rooms.to);
    this.areaFrom.set(intent.area.from);
    this.areaTo.set(intent.area.to);
    this.propertySector.set(intent.propertySector ?? '');
    this.screenFrom.set(intent.screen.from);
    this.screenTo.set(intent.screen.to);
    this.mileageFrom.set(intent.mileage.from);
    this.mileageTo.set(intent.mileage.to);
    this.powerFrom.set(intent.power.from);
    this.powerTo.set(intent.power.to);
    this.fuel.set(intent.fuel);
    this.transmission.set(intent.transmission);
    this.drivetrain.set(intent.drivetrain);
    this.bodyType.set(intent.bodyType);
    this.registration.set(intent.registration);
    this.deviceTags.set(intent.tags);
    this.condition.set(intent.condition);
    this.setPropertyListingMode(intent.listingMode);
    this.queryExclusions.set(intent.exclusions);
    if (resetPrice) {
      this.priceMin.set(intent.price.from);
      this.priceMax.set(intent.price.to);
    }
    if (intent.currency !== null) this.priceCurrency.set(intent.currency);
    else if (resetPrice) this.priceCurrency.set(defaultPriceCurrency(intent));
  }

  runRecent(query: string): void {
    this.updateQuery(query);
    void this.search();
  }

  runCategory(query: string): void {
    this.updateQuery(query);
    void this.search();
  }

  resumeLastSearch(): void {
    const state = this.searchState.restoreLast();
    if (!state) return;
    this.controller?.abort();
    this.controller = undefined;
    this.closeSearchSuggestions();
    this.restore(state);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { q: state.activeQuery || null, fresh: null },
      replaceUrl: true,
    });
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
      window.scrollTo({ top: state.scrollY, behavior: 'instant' });
    }));
  }

  removeFilter(id: string): void {
    if (id === 'order') this.order.set('relevance');
    else if (id === 'cleanup') this.smartCleanup.set(true);
    else if (id === 'photos') this.onlyWithPhotos.set(false);
    else if (id === 'fixed') this.excludeNegotiable.set(false);
    else if (id === 'year') { this.yearFrom.set(null); this.yearTo.set(null); }
    else if (id === 'generation') { this.generationFrom.set(null); this.generationTo.set(null); }
    else if (id === 'storage') { this.storageFrom.set(null); this.storageTo.set(null); }
    else if (id === 'ram') { this.ramFrom.set(null); this.ramTo.set(null); }
    else if (id === 'rooms') { this.roomsFrom.set(null); this.roomsTo.set(null); }
    else if (id === 'area') { this.areaFrom.set(null); this.areaTo.set(null); }
    else if (id === 'floor') { this.floorFrom.set(null); this.floorTo.set(null); }
    else if (id === 'property-sector') this.propertySector.set('');
    else if (id === 'property-state') this.propertyState.set(null);
    else if (id === 'housing-stock') this.housingStock.set(null);
    else if (id === 'listing-author') this.listingAuthor.set(null);
    else if (id === 'building-type') this.buildingType.set(null);
    else if (id === 'screen') { this.screenFrom.set(null); this.screenTo.set(null); }
    else if (id === 'price') { this.priceMin.set(null); this.priceMax.set(null); }
    else if (id === 'fuel') this.fuel.set(null);
    else if (id === 'transmission') this.transmission.set(null);
    else if (id === 'mileage') { this.mileageFrom.set(null); this.mileageTo.set(null); }
    else if (id === 'power') { this.powerFrom.set(null); this.powerTo.set(null); }
    else if (id === 'drivetrain') this.drivetrain.set(null);
    else if (id === 'body-type') this.bodyType.set(null);
    else if (id === 'registration') this.registration.set(null);
    else if (id === 'condition') this.condition.set(null);
    else if (id === 'listing-mode') this.setPropertyListingMode(null);
    else if (id.startsWith('tag:')) this.toggleDeviceTag(id.slice(4));
    else if (id.startsWith('query-exclude:')) this.queryExclusions.update((words) => words.filter((word) => word !== id.slice(14)));
    else if (id.startsWith('exclude:')) this.removeExcludedWord(id.slice(8));
  }

  addExcludedWord(event: KeyboardEvent): void {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    this.addExclusion(this.excludedWord());
    this.excludedWord.set('');
  }

  addExclusion(value: string): void {
    const word = tokens(value).join(' ');
    if (word && !this.excludedWords().includes(word)) {
      this.excludedWords.update((words) => [...words, word]);
      void this.library.saveExcludedWords(this.excludedWords());
    }
  }

  removeExcludedWord(word: string): void {
    this.excludedWords.update((words) => words.filter((item) => item !== word));
    void this.library.saveExcludedWords(this.excludedWords());
  }

  async toggleSaved(product: Product): Promise<void> {
    if (!this.auth.session()) {
      this.toast.error('Log in with a private code to save listings.');
      await this.router.navigateByUrl('/login');
      return;
    }
    try {
      await this.library.toggleSaved(product);
    } catch {
      this.toast.error('Could not update saved listings.');
    }
  }

  setGeneration(bound: 'from' | 'to', event: Event): void {
    this.setNumberRange(bound === 'from' ? this.generationFrom : this.generationTo, event);
  }

  setStorage(bound: 'from' | 'to', event: Event): void {
    const value = Number((event.target as HTMLSelectElement).value);
    (bound === 'from' ? this.storageFrom : this.storageTo).set(value > 0 ? value : null);
  }

  setRAM(bound: 'from' | 'to', event: Event): void { this.setNumberRange(bound === 'from' ? this.ramFrom : this.ramTo, event); }
  setRooms(bound: 'from' | 'to', event: Event): void { this.setNumberRange(bound === 'from' ? this.roomsFrom : this.roomsTo, event); }
  setArea(bound: 'from' | 'to', event: Event): void { this.setNumberRange(bound === 'from' ? this.areaFrom : this.areaTo, event); }
  setScreen(bound: 'from' | 'to', event: Event): void { this.setNumberRange(bound === 'from' ? this.screenFrom : this.screenTo, event); }
  toggleDeviceTag(tag: string): void {
    this.deviceTags.update((tags) => tags.includes(tag) ? tags.filter((item) => item !== tag) : [...tags, tag]);
  }

  rememberPanel(panel: CollapsiblePanel, event: Event): void {
    this.uiPreferences.setOpen(panel, (event.currentTarget as HTMLDetailsElement).open);
  }

  setRegistration(value: 'moldova' | 'other' | null): void {
    this.registration.set(value);
    // A session restored from an older app version has no registration facet.
    // Refresh it once; newly streamed searches continue filtering instantly.
    if (value && this.rawProducts().length > 0 && this.rawProducts().every((product) => product.registration === undefined)) {
      void this.search();
    }
  }

  setPrice(bound: 'min' | 'max', event: Event): void {
    const value = (event.target as HTMLInputElement).valueAsNumber;
    (bound === 'min' ? this.priceMin : this.priceMax).set(Number.isFinite(value) && value >= 0 ? value : null);
  }

  setPriceSlider(bound: 'min' | 'max', event: Event): void {
    const value = (event.target as HTMLInputElement).valueAsNumber;
    if (bound === 'min') {
      this.priceMin.set(value <= this.priceFloor() ? null : Math.min(value, this.priceMax() ?? this.priceCeiling()));
      return;
    }
    this.priceMax.set(value >= this.priceCeiling() ? null : Math.max(value, this.priceMin() ?? this.priceFloor()));
  }

  setCurrency(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.priceCurrency.set(value === '' ? null : Number(value));
    this.priceMin.set(null);
    this.priceMax.set(null);
  }

  setPricePreset(value: number): void {
    this.priceMax.set(value);
    if (this.priceMin() !== null && this.priceMin()! > value) this.priceMin.set(null);
  }

  setPropertyListingMode(mode: PropertyListingMode | null): void {
    if (this.listingMode() === mode) return;
    this.listingMode.set(mode);
    // Sale and rental budgets are not comparable; never carry a stale price
    // range across offer types.
    this.priceMin.set(null);
    this.priceMax.set(null);
  }

  resetFilters(clearSavedWords = true): void {
    this.order.set('relevance');
    this.smartCleanup.set(true);
    this.excludeNegotiable.set(false);
    this.onlyWithPhotos.set(false);
    if (clearSavedWords) this.excludedWords.set([]);
    this.queryExclusions.set([]);
    this.yearFrom.set(null);
    this.yearTo.set(null);
    this.priceMin.set(null);
    this.priceMax.set(null);
    this.priceCurrency.set(defaultPriceCurrency(this.filterIntent()));
    this.fuel.set(null);
    this.transmission.set(null);
    this.mileageFrom.set(null);
    this.mileageTo.set(null);
    this.powerFrom.set(null);
    this.powerTo.set(null);
    this.drivetrain.set(null);
    this.bodyType.set(null);
    this.registration.set(null);
    this.generationFrom.set(null);
    this.generationTo.set(null);
    this.storageFrom.set(null);
    this.storageTo.set(null);
    this.ramFrom.set(null);
    this.ramTo.set(null);
    this.roomsFrom.set(null);
    this.roomsTo.set(null);
    this.areaFrom.set(null);
    this.areaTo.set(null);
    this.floorFrom.set(null);
    this.floorTo.set(null);
    this.propertySector.set('');
    this.propertyState.set(null);
    this.housingStock.set(null);
    this.listingAuthor.set(null);
    this.buildingType.set(null);
    this.screenFrom.set(null);
    this.screenTo.set(null);
    this.deviceTags.set([]);
    this.condition.set(null);
    this.listingMode.set(null);
    if (clearSavedWords) void this.library.saveExcludedWords([]);
  }

  private startFreshWorkspace(): void {
    this.controller?.abort();
    this.controller = undefined;
    this.resetFilters(false);
    this.query.set('');
    this.activeQuery.set('');
    this.rawProducts.set([]);
    this.ids.clear();
    this.activeIntent.set(parseSearchIntent(''));
    this.excludedWord.set('');
    this.priceCurrency.set(null);
    this.searched.set(false);
    this.loadedPages.set(0);
    this.totalPages.set(0);
    this.loading.set(false);
    this.draftKind = 'generic';
    this.draftHadPrice = false;
    this.closeSearchSuggestions();
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { q: null, fresh: null },
      replaceUrl: true,
    });
    window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  }

  private setNumberRange(target: { set(value: number | null): void }, event: Event): void {
    const value = (event.target as HTMLInputElement).valueAsNumber;
    target.set(Number.isFinite(value) ? value : null);
  }

  private adaptFiltersTo(intent: SearchIntent): void {
    this.priceMin.set(null);
    this.priceMax.set(null);
    this.condition.set(null);
    if (intent.kind !== 'vehicle') {
      this.yearFrom.set(null);
      this.yearTo.set(null);
      this.fuel.set(null);
      this.transmission.set(null);
      this.mileageFrom.set(null);
      this.mileageTo.set(null);
      this.powerFrom.set(null);
      this.powerTo.set(null);
      this.drivetrain.set(null);
      this.bodyType.set(null);
      this.registration.set(null);
    }
    if (intent.kind !== 'iphone' && intent.kind !== 'playstation') {
      this.generationFrom.set(null);
      this.generationTo.set(null);
      this.deviceTags.set([]);
    }
    if (!['iphone', 'phone', 'playstation', 'laptop'].includes(intent.kind)) {
      this.storageFrom.set(null);
      this.storageTo.set(null);
    }
    if (intent.kind !== 'laptop' && intent.kind !== 'phone') { this.ramFrom.set(null); this.ramTo.set(null); }
    if (intent.kind !== 'realEstate') {
      this.roomsFrom.set(null); this.roomsTo.set(null); this.areaFrom.set(null); this.areaTo.set(null);
      this.floorFrom.set(null); this.floorTo.set(null); this.propertySector.set(''); this.propertyState.set(null);
      this.housingStock.set(null); this.listingAuthor.set(null); this.buildingType.set(null);
      this.listingMode.set(null);
    }
    if (!['laptop', 'phone', 'tv'].includes(intent.kind)) { this.screenFrom.set(null); this.screenTo.set(null); }
  }

  private receive(event: SearchEvent): void {
    if (event.loadedPages != null) this.loadedPages.set(event.loadedPages);
    if (event.totalPages != null) this.totalPages.set(event.totalPages);
	if (event.type === 'done') {
		this.loading.set(false);
		return;
	}
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

  private async loadPersonalData(loadExclusions: boolean): Promise<void> {
    if (loadExclusions) this.excludedWords.set(await this.library.loadExcludedWords());
    if (this.auth.session()) await this.library.loadSaved();
  }

  private restore(state: SearchState): void {
    this.query.set(state.query);
    this.searchAssist.set(null);
    this.activeQuery.set(state.activeQuery);
    this.order.set(state.order);
    this.smartCleanup.set(state.smartCleanup);
    this.excludeNegotiable.set(state.excludeNegotiable);
    this.onlyWithPhotos.set(state.onlyWithPhotos);
    this.excludedWords.set(state.excludedWords);
    this.excludedWord.set(state.excludedWord);
    this.queryExclusions.set(state.queryExclusions);
    this.yearFrom.set(state.yearFrom);
    this.yearTo.set(state.yearTo);
    this.priceMin.set(state.priceMin);
    this.priceMax.set(state.priceMax);
    this.priceCurrency.set(state.priceCurrency);
    this.fuel.set(state.fuel);
    this.transmission.set(state.transmission);
    this.generationFrom.set(state.generationFrom);
    this.generationTo.set(state.generationTo);
    this.storageFrom.set(state.storageFrom);
    this.storageTo.set(state.storageTo);
    this.ramFrom.set(state.ramFrom);
    this.ramTo.set(state.ramTo);
    this.roomsFrom.set(state.roomsFrom);
    this.roomsTo.set(state.roomsTo);
    this.areaFrom.set(state.areaFrom);
    this.areaTo.set(state.areaTo);
    this.floorFrom.set(state.floorFrom);
    this.floorTo.set(state.floorTo);
    this.propertySector.set(state.propertySector);
    this.propertyState.set(state.propertyState);
    this.housingStock.set(state.housingStock);
    this.listingAuthor.set(state.listingAuthor);
    this.buildingType.set(state.buildingType);
    this.screenFrom.set(state.screenFrom);
    this.screenTo.set(state.screenTo);
    this.mileageFrom.set(state.mileageFrom);
    this.mileageTo.set(state.mileageTo);
    this.powerFrom.set(state.powerFrom);
    this.powerTo.set(state.powerTo);
    this.drivetrain.set(state.drivetrain);
    this.bodyType.set(state.bodyType);
    this.registration.set(state.registration);
    this.deviceTags.set(state.deviceTags);
    this.condition.set(state.condition);
    this.listingMode.set(state.listingMode);
    this.rawProducts.set(state.products);
    this.ids.clear();
    for (const product of state.products) this.ids.add(product.id);
    this.searched.set(state.searched);
    this.loadedPages.set(state.loadedPages);
    this.totalPages.set(state.totalPages);
    this.activeIntent.set(parseSearchIntent(state.activeQuery));
    const draftIntent = parseSearchIntent(state.query);
    this.draftKind = draftIntent.kind;
    this.draftHadPrice = draftIntent.price.from !== null || draftIntent.price.to !== null;
    this.loading.set(false);
  }

  private snapshot(scrollY: number): SearchState {
    return {
      query: this.query(), activeQuery: this.activeQuery(), order: this.order(), smartCleanup: this.smartCleanup(),
      excludeNegotiable: this.excludeNegotiable(), onlyWithPhotos: this.onlyWithPhotos(), excludedWords: this.excludedWords(),
      excludedWord: this.excludedWord(),
      queryExclusions: this.queryExclusions(),
      yearFrom: this.yearFrom(), yearTo: this.yearTo(), priceMin: this.priceMin(), priceMax: this.priceMax(),
      priceCurrency: this.priceCurrency(), fuel: this.fuel(), transmission: this.transmission(),
      generationFrom: this.generationFrom(), generationTo: this.generationTo(), storageFrom: this.storageFrom(),
      storageTo: this.storageTo(), ramFrom: this.ramFrom(), ramTo: this.ramTo(), roomsFrom: this.roomsFrom(), roomsTo: this.roomsTo(),
      areaFrom: this.areaFrom(), areaTo: this.areaTo(), floorFrom: this.floorFrom(), floorTo: this.floorTo(),
      propertySector: this.propertySector(), propertyState: this.propertyState(), housingStock: this.housingStock(),
      listingAuthor: this.listingAuthor(), buildingType: this.buildingType(), screenFrom: this.screenFrom(), screenTo: this.screenTo(),
      mileageFrom: this.mileageFrom(), mileageTo: this.mileageTo(), powerFrom: this.powerFrom(), powerTo: this.powerTo(),
      drivetrain: this.drivetrain(), bodyType: this.bodyType(), registration: this.registration(),
      deviceTags: this.deviceTags(), condition: this.condition(), listingMode: this.listingMode(), products: this.rawProducts(),
      searched: this.searched(), loadedPages: this.loadedPages(), totalPages: this.totalPages(), scrollY,
      updatedAt: Date.now(),
    };
  }

  private filterAndSort(source: Product[]): Product[] {
    const intent = this.activeIntent();
    const queryWords = requiredQueryWords(this.activeQuery(), intent);
    const excluded = [...this.excludedWords(), ...this.queryExclusions()].map(tokens);
    const signatures = new Set<string>();
    const vehiclePriceFloor = this.smartCleanup() && this.activeVehicleSearch() ? inferredVehiclePriceFloor(source, this.currency) : 0;
    const devicePriceFloor = this.smartCleanup() && isDeviceIntent(intent) ? inferredDevicePriceFloor(source, this.currency) : 0;
    // Property sale, monthly-rent and daily-rent prices legitimately occupy
    // very different ranges. A shared inferred floor would hide valid rentals.
    const categoryPriceFloor = this.smartCleanup() && isStructuredIntent(intent) && intent.kind !== 'realEstate' ? inferredCategoryPriceFloor(source, this.currency, intent) : 0;
    const products = source.filter((product) => {
      const titleWords = tokens(product.title);
      const signature = `${titleWords.join(' ')}|${product.price ?? ''}|${product.currency}`;
      if (this.smartCleanup() && (product.isBoosted || !containsAll(titleWords, queryWords) || signatures.has(signature))) return false;
      if (this.smartCleanup() && this.activeVehicleSearch() && (!plausibleCar(product, titleWords) || (this.currency.convert(product, 1) ?? 0) < vehiclePriceFloor)) return false;
      if (this.smartCleanup() && isDeviceIntent(intent) && (!plausibleDevice(product, titleWords, intent) || (this.currency.convert(product, 0) ?? 0) < devicePriceFloor)) return false;
      if (this.smartCleanup() && isStructuredIntent(intent) && (!categoryMatches(product, intent) || (this.currency.convert(product, 0) ?? 0) < categoryPriceFloor)) return false;
      const from = this.yearFrom();
      const to = this.yearTo();
      if ((from !== null && (product.year ?? 0) < from) || (to !== null && (product.year ?? 0) > to)) return false;
      if (this.fuel() && !choiceMatches(product.fuel, this.fuel()!)) return false;
      if (this.transmission() && !choiceMatches(product.transmission, this.transmission()!)) return false;
      if (!inRange(product.mileage ?? null, this.mileageFrom(), this.mileageTo())) return false;
      if (!inRange(product.power ?? null, this.powerFrom(), this.powerTo())) return false;
      if (this.drivetrain() && !choiceMatches(product.drivetrain, this.drivetrain()!)) return false;
      if (this.bodyType() && !choiceMatches(product.bodyType, this.bodyType()!)) return false;
      if (this.registration() && !registrationMatches(product.registration, this.registration()!)) return false;
      if (isDeviceIntent(intent) && !matchesDeviceFilters(product, intent, this.generationFrom(), this.generationTo(), this.storageFrom(), this.storageTo(), this.deviceTags())) return false;
      if (isStorageIntent(intent) && !inRange(storageValue(product), this.storageFrom(), this.storageTo())) return false;
      if ((intent.kind === 'laptop' || intent.kind === 'phone') && !inRange(ramValue(product), this.ramFrom(), this.ramTo())) return false;
      if (intent.kind === 'realEstate' && (!inRange(roomsValue(product), this.roomsFrom(), this.roomsTo()) || !inRange(areaValue(product), this.areaFrom(), this.areaTo()) || !inRange(floorValue(product), this.floorFrom(), this.floorTo()))) return false;
      if (intent.kind === 'realEstate' && !offerTypeMatches(product.offerType, this.listingMode())) return false;
      if (intent.kind === 'realEstate' && this.propertySector().trim() && !facetMatches(product.sector, this.propertySector())) return false;
      if (intent.kind === 'realEstate' && this.propertyState() && !facetMatches(product.propertyState, this.propertyState()!)) return false;
      if (intent.kind === 'realEstate' && this.housingStock() && !facetMatches(product.housingStock, this.housingStock()!)) return false;
      if (intent.kind === 'realEstate' && this.listingAuthor() && !facetMatches(product.listingAuthor, this.listingAuthor()!)) return false;
      if (intent.kind === 'realEstate' && this.buildingType() && !facetMatches(product.buildingType, this.buildingType()!)) return false;
      if ((intent.kind === 'laptop' || intent.kind === 'phone' || intent.kind === 'tv') && !inRange(screenValue(product), this.screenFrom(), this.screenTo())) return false;
      if (this.condition() && !conditionMatches(product.condition, this.condition()!)) return false;
      if (this.excludeNegotiable() && product.price == null) return false;
      if (this.onlyWithPhotos() && !product.thumbnailURL) return false;
      if (excluded.some((phrase) => containsPhrase(titleWords, phrase))) return false;
      if (this.smartCleanup()) signatures.add(signature);
      return true;
    });
    const direction = this.order() === 'priceDesc' ? -1 : 1;
    return products.sort((a, b) => {
      if (this.order() === 'relevance') return relevance(b, queryWords) - relevance(a, queryWords) || this.comparePrice(a, b, 1);
      return this.comparePrice(a, b, direction);
    });
  }

  private comparePrice(a: Product, b: Product, direction: number): number {
    const aPrice = this.currency.convert(a, this.priceCurrency());
    const bPrice = this.currency.convert(b, this.priceCurrency());
    if (aPrice === null) return 1;
    if (bPrice === null) return -1;
    return (aPrice - bPrice) * direction;
  }
}

function tokens(value: string): string[] { return value.toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []; }
function searchKey(value: string): string { return fold(value).replace(/\s+/g, ' ').trim(); }
function percentage(value: number, ceiling: number): number { return ceiling > 0 ? Math.min(100, Math.max(0, value / ceiling * 100)) : 0; }
function formatNumber(value: number): string { return new Intl.NumberFormat('ro-MD', { maximumFractionDigits: 0 }).format(value); }
function convertedPrices(products: readonly Product[], currencyService: CurrencyService, target: number): number[] {
  const prices: number[] = [];
  for (const product of products) {
    const value = currencyService.convert(product, target);
    if (value === null || value <= 0) continue;
    prices.push(value);
  }
  return prices.sort((a, b) => a - b);
}
function priceBounds(prices: readonly number[]): { min: number; max: number } | null {
  return prices.length ? { min: Math.floor(prices[0]), max: Math.ceil(prices[prices.length - 1]) } : null;
}
function adaptivePricePresets(prices: readonly number[], fallback: readonly number[]): number[] {
  if (prices.length < 4) return fallback.filter((value) => value > (prices[0] ?? 0) && value < (prices.at(-1) ?? Number.POSITIVE_INFINITY));
  const values = [.25, .5, .75]
    .map((position) => niceBudget(prices[Math.floor((prices.length - 1) * position)]))
    .filter((value, index, all) => value > prices[0] && value < prices[prices.length - 1] && all.indexOf(value) === index);
  return values.length >= 2 ? values : fallback.filter((value) => value > prices[0] && value < prices[prices.length - 1]);
}
function niceBudget(value: number): number {
  const step = value < 100 ? 10 : value < 1_000 ? 50 : value < 10_000 ? 100 : value < 100_000 ? 1_000 : value < 1_000_000 ? 10_000 : 100_000;
  return Math.max(step, Math.round(value / step) * step);
}
function containsAll(words: string[], required: string[]): boolean { return required.every((word) => words.includes(word)); }
function containsPhrase(words: string[], phrase: string[]): boolean { return words.some((_, index) => phrase.every((word, offset) => words[index + offset] === word)); }
function plausibleCar(product: Product, titleWords: string[]): boolean {
  if (!product.make || !product.model || !product.year || product.price == null || titleWords.some((word) => carNoise.has(word))) return false;
  return product.price >= (product.currency === 0 ? 5_000 : 300);
}
function inferredVehiclePriceFloor(products: Product[], currency: CurrencyService): number {
  const prices = products
    .filter((product) => product.make && product.model && product.year && !tokens(product.title).some((word) => carNoise.has(word)))
    .map((product) => currency.convert(product, 1))
    .filter((price): price is number => price !== null && price >= 300)
    .sort((a, b) => a - b);
  if (prices.length < 4) return 300;
  return Math.min(5_000, Math.max(500, prices[Math.floor(prices.length / 2)] * .1));
}
function inferredDevicePriceFloor(products: Product[], currency: CurrencyService): number {
  const prices = products
    .filter((product) => product.deviceModel && product.price != null)
    .map((product) => currency.convert(product, 0))
    .filter((price): price is number => price !== null && price >= 200)
    .sort((a, b) => a - b);
  if (prices.length < 4) return 200;
  return Math.min(3_000, Math.max(500, prices[Math.floor(prices.length / 2)] * .12));
}
function inferredCategoryPriceFloor(products: Product[], currency: CurrencyService, intent: SearchIntent): number {
  if (intent.kind === 'realEstate') return 0;
  const prices = products.filter((product) => categoryMatches(product, intent)).map((product) => currency.convert(product, 0))
    .filter((price): price is number => price !== null && price >= 100).sort((a, b) => a - b);
  if (prices.length < 4) return 100;
  return Math.min(3_000, Math.max(200, prices[Math.floor(prices.length / 2)] * .08));
}
function isDeviceIntent(intent: SearchIntent): boolean { return intent.kind === 'iphone' || intent.kind === 'playstation'; }
function isStorageIntent(intent: SearchIntent): boolean { return intent.kind === 'laptop' || intent.kind === 'phone'; }
function isStructuredIntent(intent: SearchIntent): boolean { return ['laptop', 'phone', 'tv', 'realEstate'].includes(intent.kind); }
function categoryMatches(product: Product, intent: SearchIntent): boolean {
  const category = fold(product.category ?? '');
  const title = fold(product.title);
  if (intent.kind === 'laptop') return category.includes('laptop') || Boolean(product.processor || product.gpu || (product.ram && product.screen)) || Boolean(product.condition && /\b(laptop|notebook|macbook|thinkpad|ideapad|legion)\b/.test(title));
  if (intent.kind === 'phone') return category.includes('telefon') || Boolean(product.deviceModel || (product.brand && product.condition)) || Boolean(product.condition && /\b(telefon|smartphone|galaxy|redmi|pixel)\b/.test(title));
  if (intent.kind === 'tv') return category.includes('televiz') || /(?:android tv|webos|vidaa)/.test(fold(product.os ?? '')) || Boolean(product.condition && /\b(televizor|television|smart tv)\b/.test(title));
  const propertyCategory = /(apart|case|casa|teren|imobil|garaj|spati)/.test(category);
  const propertyDetails = Boolean(product.rooms || product.area || product.buildingType || product.sector);
  return (propertyCategory || propertyDetails) && isPropertyOffer(product.offerType);
}
function isPropertyOffer(value: string | undefined): boolean {
  return /(vand|vanzare|cumpar|inchiri|chirie|rent|sale|schimb|аренд|сда|прод|куп)/u.test(fold(value ?? ''));
}
function plausibleDevice(product: Product, titleWords: string[], intent: SearchIntent): boolean {
  const model = fold(product.deviceModel ?? '');
  const expected = intent.kind === 'iphone' ? 'iphone' : 'playstation';
  return Boolean(product.deviceModel && model.includes(expected) && product.price != null && !titleWords.some((word) => deviceNoise.has(word)));
}
function matchesDeviceFilters(product: Product, intent: SearchIntent, generationFrom: number | null, generationTo: number | null, storageFrom: number | null, storageTo: number | null, tags: string[]): boolean {
  const generation = generationIn(`${product.deviceModel ?? ''} ${product.title}`, intent.kind);
  if ((generationFrom !== null && (generation ?? 0) < generationFrom) || (generationTo !== null && (generation ?? 0) > generationTo)) return false;
  const storage = storageIn(product.storage ?? product.title);
  if ((storageFrom !== null && (storage ?? 0) < storageFrom) || (storageTo !== null && (storage ?? 0) > storageTo)) return false;
  const searchable = fold(`${product.deviceModel ?? ''} ${product.title}`).replace(/disk/g, 'disc');
  return tags.every((tag) => searchable.includes(tag));
}
function inRange(value: number | null, from: number | null, to: number | null): boolean {
  if (from === null && to === null) return true;
  return value !== null && (from === null || value >= from) && (to === null || value <= to);
}
function storageValue(product: Product): number | null { return storageIn(`${product.storage ?? ''} ${product.title}`); }
function ramValue(product: Product): number | null {
  const value = fold(`${product.ram ?? ''} ${product.title}`);
  const match = value.match(/(?:ram\s*)?(\d{1,3})\s*gb\s*(?:ram|memory|memorie)?|ram\s*(\d{1,3})/);
  return match ? Number(match[1] || match[2]) : null;
}
function roomsValue(product: Product): number | null {
  const value = fold(`${product.rooms ?? ''} ${product.title}`);
  const match = value.match(/(\d{1,2})\s*(?:camere?|rooms?|комнат\p{L}*)/u) ?? value.match(/^\s*(\d{1,2})/);
  return match ? Number(match[1]) : null;
}
function areaValue(product: Product): number | null {
  const value = fold(`${product.area ?? ''} ${product.title}`);
  const match = value.match(/(\d{1,4})\s*(?:m2|m²|mp|кв)/u) ?? (product.area ? value.match(/\d{1,4}/) : null);
  return match ? Number(match[1] ?? match[0]) : null;
}
function floorValue(product: Product): number | null {
  const value = fold(`${product.floor ?? ''}`);
  const match = value.match(/-?\d{1,2}/);
  return match ? Number(match[0]) : null;
}
function screenValue(product: Product): number | null {
  const value = fold(`${product.screen ?? ''} ${product.title}`);
  const match = value.match(/(\d{1,3}(?:[.,]\d)?)\s*(?:inch|toli|дюйм|")/u) ?? (product.screen ? value.match(/\d{1,3}(?:[.,]\d)?/) : null);
  return match ? Number((match[1] ?? match[0]).replace(',', '.')) : null;
}
function conditionMatches(value: string | undefined, condition: 'new' | 'used'): boolean {
  const normalized = fold(value ?? '');
  return condition === 'new' ? normalized.includes('nou') : normalized.includes('uzat') || normalized.includes('rulaj');
}
function offerTypeMatches(value: string | undefined, mode: PropertyListingMode | null): boolean {
  if (!mode) return true;
  const normalized = fold(value ?? '');
  if (!normalized) return false;
  if (mode === 'daily') return /(inchiriat pe zi|chirie pe zi|pe noapte|daily|short term|posut|сут)/u.test(normalized);
  if (mode === 'monthly') return /(inchiriat lunar|chirie lunara|monthly|long term|аренд|сда)/u.test(normalized) && !/(pe zi|daily|short term|posut|сут)/u.test(normalized);
  return /(vand|vanzare|sale|прод|sell)/u.test(normalized);
}
function facetMatches(value: string | undefined, expected: string): boolean {
  const actual = fold(value ?? '').trim();
  const choice = fold(expected).trim();
  return Boolean(actual && choice && (actual.includes(choice) || choice.includes(actual)));
}
function facetValues(
  products: readonly Product[],
  picker: (product: Product) => string | undefined,
  defaults: readonly string[] = [],
): string[] {
  const values = new Map<string, string>();
  for (const value of defaults) values.set(fold(value), value);
  for (const product of products) {
    const value = picker(product)?.trim();
    if (value) values.set(fold(value), value);
  }
  return [...values.values()].sort((a, b) => a.localeCompare(b, 'ro'));
}
function registrationMatches(value: string | undefined, registration: 'moldova' | 'other'): boolean {
  const normalized = fold(value ?? '');
  return registration === 'moldova' ? normalized === 'republica moldova' : normalized === 'alta';
}
function choiceMatches(value: string | undefined, expected: string): boolean {
  const actual = fold(value ?? '');
  const choice = fold(expected);
  return choice === 'gaz' ? actual.includes('gaz') : choice === 'hybrid' ? actual.includes('hybrid') : actual.includes(choice);
}
function requiredQueryWords(value: string, intent: SearchIntent): string[] {
  const ignoredByKind: Partial<Record<SearchKind, string[]>> = {
    vehicle: ['autoturism', 'autoturisme', 'automobil', 'automobile', 'masina', 'masini', 'vehicle', 'автомобиль', 'автомобили'],
    iphone: ['iphone'], playstation: ['playstation'], laptop: ['laptop', 'laptops', 'notebook', 'ultrabook', 'ноутбук'],
    phone: ['telefon', 'smartphone', 'телефон', 'смартфон'], tv: ['tv', 'televizor', 'televizoare', 'television', 'телевизор'],
    realEstate: ['apartament', 'apartamente', 'apartment', 'casa', 'house', 'teren', 'land', 'квартира', 'дом', 'участок'],
  };
  const ignored = new Set(['gb', 'tb', ...(ignoredByKind[intent.kind] ?? []), ...intent.tags, ...tokens(intent.propertySector ?? '')]);
  return tokens(value).filter((word) => !ignored.has(word) && !/^ps[1-5]$/.test(word) && (!isDeviceIntent(intent) || !/^\d{1,4}$/.test(word)));
}
function rangeSummary(label: string, from: number | null, to: number | null): string {
  if (from !== null && to !== null) return from === to ? `${label}: ${from}` : `${label}: ${from}–${to}`;
  if (from !== null) return `${label}: ${from}+`;
  if (to !== null) return `${label}: up to ${to}`;
  return `${label} and details can be refined instantly.`;
}
function relevance(product: Product, queryWords: string[]): number {
  const title = tokens(product.title);
  const exact = title.join(' ') === queryWords.join(' ') ? 100 : 0;
  return exact + (containsAll(title, queryWords) ? 40 : 0) + (product.make && product.model ? 20 : 0) + (product.isBoosted ? 0 : 5);
}
function defaultPriceCurrency(intent: SearchIntent): number { return intent.kind === 'vehicle' || intent.kind === 'realEstate' ? 1 : 0; }
function priceCap(intent: SearchIntent, currency: number | null, listingMode: PropertyListingMode | null): number {
  if (intent.kind === 'realEstate' && (listingMode === 'monthly' || listingMode === 'daily')) {
    if (currency === 0) return listingMode === 'daily' ? 20_000 : 100_000;
    return listingMode === 'daily' ? 1_000 : 5_000;
  }
  if (currency === 0) return intent.kind === 'vehicle' || intent.kind === 'realEstate' ? 10_000_000 : isTechIntent(intent) ? 100_000 : 500_000;
  if (currency === 1 || currency === 2) return intent.kind === 'realEstate' ? 500_000 : intent.kind === 'vehicle' ? 50_000 : isTechIntent(intent) ? 5_000 : 10_000;
  return intent.kind === 'realEstate' ? 500_000 : intent.kind === 'vehicle' ? 50_000 : 100_000;
}
function budgetPresets(intent: SearchIntent, currency: number | null, listingMode: PropertyListingMode | null): number[] {
  if (intent.kind === 'realEstate' && listingMode === 'monthly') return currency === 0 ? [5_000, 10_000, 20_000] : [300, 500, 1_000];
  if (intent.kind === 'realEstate' && listingMode === 'daily') return currency === 0 ? [1_000, 2_000, 5_000] : [50, 100, 250];
  if (currency === 0) return intent.kind === 'realEstate' ? [1_000_000, 5_000_000, 10_000_000] : intent.kind === 'vehicle' ? [100_000, 500_000, 1_000_000] : isTechIntent(intent) ? [25_000, 50_000, 100_000] : [50_000, 100_000, 500_000];
  if (intent.kind === 'realEstate') return [50_000, 100_000, 250_000];
  return isTechIntent(intent) ? [1_000, 2_500, 5_000] : [5_000, 10_000, 50_000];
}
function isTechIntent(intent: SearchIntent): boolean { return ['iphone', 'phone', 'playstation', 'laptop', 'tv'].includes(intent.kind); }
function priceSliderStep(cap: number): number {
  if (cap <= 10_000) return 10;
  if (cap <= 50_000) return 500;
  if (cap <= 100_000) return 1_000;
  return 5_000;
}
