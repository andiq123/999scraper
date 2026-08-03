import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { Subscription } from 'rxjs';
import { ToastService } from 'src/app/core/_services/toast.service';
import { IProduct } from 'src/app/shared/models/product';
import { SearchService, SearchStreamEvent } from '../search.service';

@Component({
  standalone: false,
  selector: 'app-products',
  templateUrl: './products.component.html',
  styleUrls: ['./products.component.scss'],
})
export class ProductsComponent implements OnInit, OnDestroy {
  initial = true;
  loading = false;
  products: IProduct[] = [];
  searchCriteria = '';
  loadedPages = 0;
  totalPages = 0;

  private readonly subscriptions: Subscription[] = [];
  private readonly productIds = new Set<string>();
  private request?: Subscription;

  constructor(
    private readonly searchService: SearchService,
    private readonly toast: ToastService,
    private readonly changeDetector: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.subscriptions.push(
      this.searchService.filters$.subscribe((filters) => {
        this.searchCriteria = filters.productSearchCriteria;
      })
    );
  }

  ngOnDestroy(): void {
    this.request?.unsubscribe();
    this.subscriptions.forEach((subscription) => subscription.unsubscribe());
  }

  onSubmit(): void {
    const query = this.searchCriteria.trim();
    if (query) this.loadProducts(query);
  }

  onCancel(): void {
    this.request?.unsubscribe();
    this.loading = false;
    this.initial = false;
  }

  loadProducts(searchCriteria: string): void {
    this.request?.unsubscribe();
    this.loading = true;
    this.products = [];
    this.productIds.clear();
    this.loadedPages = 0;
    this.totalPages = 0;
    this.searchService.addSearchCriteriaToFilters(searchCriteria);

    this.request = this.searchService.streamProducts().subscribe({
      next: (event) => this.handleEvent(event),
      error: (error: Error) => {
        this.loading = false;
        this.initial = false;
        this.toast.error(error.message || 'Search failed.');
        this.changeDetector.detectChanges();
      },
      complete: () => {
        this.loading = false;
        this.initial = false;
        this.sortProducts();
        this.changeDetector.detectChanges();
      },
    });
  }

  trackProduct(_: number, product: IProduct): string {
    return product.id;
  }

  get progress(): number {
    return this.totalPages ? Math.round((this.loadedPages / this.totalPages) * 100) : 0;
  }

  private handleEvent(event: SearchStreamEvent): void {
    this.loadedPages = event.loadedPages ?? this.loadedPages;
    this.totalPages = event.totalPages ?? this.totalPages;
    if (event.type === 'chunk') {
      for (const product of event.products ?? []) {
        if (!this.productIds.has(product.id)) {
          this.productIds.add(product.id);
          this.products.push(product);
        }
      }
    }
    if (event.type === 'error') {
      this.loading = false;
      this.initial = false;
      this.sortProducts();
      this.toast.error(event.message || 'Search stopped before all pages loaded.');
    }
    this.changeDetector.detectChanges();
  }

  private sortProducts(): void {
    const descending = this.searchService.currentFilters().order === 'priceDesc';
    this.products.sort((left, right) => {
      if (left.price == null) return 1;
      if (right.price == null) return -1;
      return descending ? right.price - left.price : left.price - right.price;
    });
  }
}
