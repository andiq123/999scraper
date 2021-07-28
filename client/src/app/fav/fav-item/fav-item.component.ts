import { Component, Input, OnInit, Output } from '@angular/core';
import { ToastrService } from 'ngx-toastr';
import { Subject } from 'rxjs';
import { Currency } from 'src/app/shared/models/currency';
import { IProduct } from 'src/app/shared/models/product';
import { FavoriteService } from '../favorite.service';

@Component({
  selector: 'app-fav-item',
  templateUrl: './fav-item.component.html',
  styleUrls: ['./fav-item.component.scss'],
})
export class FavItemComponent implements OnInit {
  @Output('onProductRemoved') onProductRemoved = new Subject<string>();
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

  onRemoveFromFav() {
    this.favService.removeProductFromFav(this.product.id).subscribe(
      () => {
        this.toastrService.success('Product Removed');
        this.onProductRemoved.next(this.product.id);
      },
      (e) => {
        this.toastrService.error('This product is not in your list');
      }
    );
  }
}
