import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NavComponent } from './nav/nav.component';

import { RouterModule } from '@angular/router';
import { SideFiltersComponent } from './side-filters/side-filters.component';
import { FormsModule } from '@angular/forms';

@NgModule({
  declarations: [NavComponent, SideFiltersComponent],
  imports: [CommonModule, RouterModule, FormsModule],
  exports: [NavComponent, SideFiltersComponent],
})
export class CoreModule {}
