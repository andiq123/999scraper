import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ProductsComponent } from './products/products.component';
import { ProductItemComponent } from './product-item/product-item.component';
import { SearchRoutingModule } from './search-routing.module';
import { FormsModule } from '@angular/forms';
import { SharedModule } from '../shared/shared.module';
import { SearchComponent } from './search/search.component';
import { CoreModule } from '../core/core.module';

@NgModule({
  declarations: [ProductsComponent, ProductItemComponent, SearchComponent],
  imports: [
    CommonModule,
    SearchRoutingModule,
    FormsModule,
    SharedModule,
    CoreModule,
  ],
})
export class SearchModule {}
