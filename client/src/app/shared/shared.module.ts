import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LoadingComponent } from './loading/loading.component';
import { TooltipComponent } from './tooltip/tooltip.component';

@NgModule({
  declarations: [LoadingComponent, TooltipComponent],
  imports: [CommonModule],
  exports: [LoadingComponent, TooltipComponent],
})
export class SharedModule {}
