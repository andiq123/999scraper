import { HttpErrorResponse } from '@angular/common/http';
import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { IUser } from 'src/app/shared/models/user';
import { MonitorService } from '../monitor.service';

@Component({
  standalone: false,
  selector: 'app-user-item',
  templateUrl: './user-item.component.html',
  styleUrls: ['./user-item.component.scss'],
})
export class UserItemComponent implements OnInit {
  @Input() user!: IUser;
  @Output() onSelectUser = new EventEmitter<string>();
  constructor(private monitorService: MonitorService) {}

  ngOnInit() { this.isAlreadyBanned = this.user.isBanned; }

  selectUser() {
    this.onSelectUser.next(this.user.id);
  }

  isAlreadyBanned = false;
  onBanUnbanUser() {
    this.monitorService.blockUnBlockUser(this.user.id).subscribe(
      (data) => {
        this.isAlreadyBanned = data.status;
      },
      (e: HttpErrorResponse) => {
        console.log(e);
      }
    );
  }
}
