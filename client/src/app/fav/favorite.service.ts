import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { IProduct } from 'src/app/shared/models/product';
import { environment } from 'src/environments/environment';

@Injectable({
  providedIn: 'root',
})
export class FavoriteService {
  private baseUrl = environment.apiUrl + 'favorites/';
  constructor(private http: HttpClient) {}

  addProductToFav(product: IProduct): Observable<void> {
    return this.http.post<void>(this.baseUrl, product);
  }

  removeProductFromFav(productId: string): Observable<void> {
    return this.http.delete<void>(this.baseUrl + productId);
  }

  getFavProducts(): Observable<IProduct[]> {
    return this.http.get<IProduct[]>(this.baseUrl);
  }
}
