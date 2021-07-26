import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LoadingComponent } from './loading/loading.component';
import { TooltipComponent } from './tooltip/tooltip.component';
import { ReactiveFormsModule } from '@angular/forms';

@NgModule({
  declarations: [LoadingComponent, TooltipComponent],
  imports: [CommonModule, ReactiveFormsModule],
  exports: [LoadingComponent, TooltipComponent, ReactiveFormsModule],
})
export class SharedModule {}
