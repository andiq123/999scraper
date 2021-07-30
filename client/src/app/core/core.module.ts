import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NavComponent } from './nav/nav.component';

import { RouterModule } from '@angular/router';
import { SideFiltersComponent } from './side-filters/side-filters.component';
import { FormsModule } from '@angular/forms';
import { FullScreenComponent } from './full-screen/full-screen.component';

@NgModule({
  declarations: [NavComponent, SideFiltersComponent, FullScreenComponent],
  imports: [CommonModule, RouterModule, FormsModule],
  exports: [NavComponent, SideFiltersComponent, FullScreenComponent],
})
export class CoreModule {}
