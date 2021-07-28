import { Component, OnDestroy, OnInit } from '@angular/core';
import { NgForm } from '@angular/forms';
import { Observable, Subscription } from 'rxjs';
import { SignalrService } from 'src/app/core/_services/signalr.service';
import { IProduct } from 'src/app/shared/models/product';
import { IProgress } from 'src/app/shared/models/progress';
import { SearchService } from '../search.service';

@Component({
  selector: 'app-products',
  templateUrl: './products.component.html',
  styleUrls: ['./products.component.scss'],
})
export class ProductsComponent implements OnInit, OnDestroy {
  subscriptions: Subscription[] = [];
  products: IProduct[] = [];
  loading: boolean = false;
  progress$!: Observable<IProgress | null>;
  searchCriteria: string = '';

  constructor(
    private searchService: SearchService,
    private signalr: SignalrService
  ) {}

  ngOnDestroy(): void {
    this.signalr.disconnect();
    this.subscriptions.forEach((x) => x.unsubscribe());
  }

  ngOnInit(): void {
    this.signalr.connect();
    this.progress$ = this.signalr.progressChanged$;
    this.subscriptions.push(
      this.searchService.filters$.subscribe((data) => {
        this.searchCriteria = data.productSearchCriteria;
      })
    );
    this.subscriptions.push(
      this.signalr.connectionId$.subscribe((connectionId: string | null) => {
        if (connectionId) this.searchService.addSignalrToFilters(connectionId);
      })
    );
  }

  onSubmit() {
    if (!this.searchCriteria) return;
    this.loadProducts(this.searchCriteria);
  }

  onCancel() {
    this.cancelableRequest.unsubscribe();
    this.loading = false;
  }

  cancelableRequest!: Subscription;
  loadProducts(searchCriteria: string) {
    this.loading = true;
    this.products = [];
    this.searchService.addSearchCriteriaToFilters(searchCriteria);
    this.cancelableRequest = this.searchService.getProducts().subscribe(
      (products: IProduct[]) => {
        this.products = products;
        this.loading = false;
      },
      (e) => {
        console.log(e);
        this.loading = false;
      }
    );
  }
}
