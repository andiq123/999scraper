import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FavoritesComponent } from './favorites/favorites.component';
import { FavRoutingModule } from './fav-routing.module';
import { FavItemComponent } from './fav-item/fav-item.component';
import { CoreModule } from '../core/core.module';
import { SharedModule } from '../shared/shared.module';

@NgModule({
  declarations: [FavoritesComponent, FavItemComponent],
  imports: [CommonModule, FavRoutingModule, SharedModule],
})
export class FavModule {}
