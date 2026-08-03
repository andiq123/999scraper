import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NavComponent } from './nav/nav.component';

import { RouterModule } from '@angular/router';
import { SideFiltersComponent } from './side-filters/side-filters.component';
import { FormsModule } from '@angular/forms';
import { FullScreenComponent } from './full-screen/full-screen.component';
import { FilterFormComponent } from './filter-form/filter-form.component';

@NgModule({
  declarations: [NavComponent, SideFiltersComponent, FullScreenComponent, FilterFormComponent],
  imports: [CommonModule, RouterModule, FormsModule],
  exports: [NavComponent, SideFiltersComponent, FullScreenComponent],
})
export class CoreModule {}
