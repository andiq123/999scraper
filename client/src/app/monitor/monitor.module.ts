import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MonitorRoutingModule } from './monitor-routing.module';
import { UserItemComponent } from './user-item/user-item.component';
import { AdminComponent } from './admin/admin.component';
import { ActivityItemComponent } from './activity-item/activity-item.component';
import { SharedModule } from '../shared/shared.module';
import { CoreModule } from '../core/core.module';
import { FormsModule } from '@angular/forms';
import { TimeagoModule } from 'ngx-timeago';

@NgModule({
  imports: [
    CommonModule,
    MonitorRoutingModule,
    FormsModule,
    TimeagoModule.forRoot(),
  ],
  declarations: [UserItemComponent, AdminComponent, ActivityItemComponent],
})
export class MonitorModule {}
