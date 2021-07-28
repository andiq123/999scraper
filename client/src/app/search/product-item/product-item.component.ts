import { Component, Input, OnInit } from '@angular/core';
import { ToastrService } from 'ngx-toastr';
import { FavoriteService } from 'src/app/fav/favorite.service';
import { Currency } from 'src/app/shared/models/currency';
import { IProduct } from 'src/app/shared/models/product';

@Component({
  selector: 'app-product-item',
  templateUrl: './product-item.component.html',
  styleUrls: ['./product-item.component.scss'],
})
export class ProductItemComponent implements OnInit {
  @Input() product!: IProduct;
  currency = Currency;

  constructor(
    private favService: FavoriteService,
    private toastrService: ToastrService
  ) {}

  ngOnInit(): void {}

  onShowToolTip() {
    if (this.timeOut) {
      clearTimeout(this.timeOut);
    }
    this.showToolTip = true;
  }

  public showToolTip = false;
  private timeOutTime = 1;
  private timeOut: any;
  onCloseToolTip() {
    if (this.timeOut) {
      clearTimeout(this.timeOut);
    }

    this.timeOut = setTimeout(() => {
      this.showToolTip = false;
      clearTimeout(this.timeOut);
    }, this.timeOutTime * 1000);
  }

  addedToFav: boolean = false;
  onAddToFav() {
    this.favService.addProductToFav(this.product).subscribe(
      () => {
        this.toastrService.success('Product added to favorite');
        this.addedToFav = true;
      },
      (e) => {
        this.addedToFav = true;
        this.toastrService.error('This product is already in your favorites');
      }
    );
  }
}
