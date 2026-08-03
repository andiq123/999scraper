import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { HistoryRoutingModule } from './history-routing.module';
import { HistoryComponent } from './history.component';

@NgModule({ declarations: [HistoryComponent], imports: [CommonModule, HistoryRoutingModule] })
export class HistoryModule {}
