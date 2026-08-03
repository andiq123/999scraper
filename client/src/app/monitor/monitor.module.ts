import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MonitorRoutingModule } from './monitor-routing.module';
import { UserItemComponent } from './user-item/user-item.component';
import { AdminComponent } from './admin/admin.component';
import { ActivityItemComponent } from './activity-item/activity-item.component';
import { SharedModule } from '../shared/shared.module';
import { CoreModule } from '../core/core.module';
import { FormsModule } from '@angular/forms';

@NgModule({
  imports: [
    CommonModule,
    MonitorRoutingModule,
    FormsModule,
  ],
  declarations: [UserItemComponent, AdminComponent, ActivityItemComponent],
})
export class MonitorModule {}
