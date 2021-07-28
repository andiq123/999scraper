import { Component, OnInit } from '@angular/core';
import { FavoriteService } from 'src/app/fav/favorite.service';
import { IProduct } from 'src/app/shared/models/product';

@Component({
  selector: 'app-favorites',
  templateUrl: './favorites.component.html',
  styleUrls: ['./favorites.component.scss'],
})
export class FavoritesComponent implements OnInit {
  products: IProduct[] = [];
  loading!: boolean;
  constructor(private favorite: FavoriteService) {}

  ngOnInit() {
    this.loadProducts();
  }

  loadProducts() {
    this.loading = true;
    this.favorite.getFavProducts().subscribe(
      (products) => {
        this.products = products;
        this.loading = false;
      },
      (e) => {
        console.log(e);
        this.loading = false;
      }
    );
  }

  onRemoveProduct(id: string) {
    this.products = this.products.filter((x) => x.id !== id);
  }
}
