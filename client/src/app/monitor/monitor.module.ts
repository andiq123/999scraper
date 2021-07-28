import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MonitorRoutingModule } from './monitor-routing.module';
import { UserItemComponent } from './user-item/user-item.component';
import { AdminComponent } from './admin/admin.component';

@NgModule({
  imports: [CommonModule, MonitorRoutingModule],
  declarations: [UserItemComponent, AdminComponent],
})
export class MonitorModule {}
