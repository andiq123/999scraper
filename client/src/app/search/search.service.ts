import { HttpClient, HttpParamsOptions } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { filter, map } from 'rxjs/operators';
import { environment } from 'src/environments/environment';
import { Filters } from '../shared/models/filters';
import { IProduct } from '../shared/models/product';
import { IProductsContainer } from '../shared/models/productsContainer';

@Injectable({
  providedIn: 'root',
})
export class SearchService {
  baseUrl = environment.apiUrl;
  private filtersSource = new BehaviorSubject<Filters>(new Filters());
  public filters$ = this.filtersSource.asObservable();

  constructor(private http: HttpClient) {
    const filters = localStorage.getItem('filters');
    if (filters) {
      this.filtersSource.next(JSON.parse(filters));
    }
  }

  getProducts(): Observable<IProduct[]> {
    const filters = this.filtersSource.getValue();
    localStorage.setItem('filters', JSON.stringify(filters));
    return this.http
      .post<IProductsContainer>(this.baseUrl + 'products', filters)
      .pipe(
        map((container) => {
          filters.redisId = container.id;
          return container.products;
        })
      );
  }

  updateFilters(filters: Filters) {
    this.filtersSource.next(filters);
  }

  addSearchCriteriaToFilters(searchCriteria: string) {
    const filters = this.filtersSource.getValue();
    if (
      filters.productSearchCriteria &&
      filters.redisId &&
      filters.productSearchCriteria !== searchCriteria
    ) {
      filters.redisId = '';
    }

    filters.productSearchCriteria = searchCriteria;
    this.filtersSource.next(filters);
  }
}
