import { HttpErrorResponse } from '@angular/common/http';
import { Component, Input, OnInit, Output } from '@angular/core';
import { Subject } from 'rxjs';
import { IUser } from 'src/app/shared/models/user';
import { MonitorService } from '../monitor.service';

@Component({
  selector: 'app-user-item',
  templateUrl: './user-item.component.html',
  styleUrls: ['./user-item.component.scss'],
})
export class UserItemComponent implements OnInit {
  @Input() user!: IUser;
  @Output('onSelectUser') onSelectUser = new Subject<string>();
  constructor(private monitorService: MonitorService) {}

  ngOnInit() {}

  selectUser() {
    this.onSelectUser.next(this.user.id);
  }

  isAlreadyBanned = false;
  onBanUser() {
    this.monitorService.blockUser(this.user.id).subscribe(
      (data) => {
        this.isAlreadyBanned = true;
      },
      (e: HttpErrorResponse) => {
        if (e.status === 401) {
          this.isAlreadyBanned = true;
        }
      }
    );
  }

  onUnBanUser() {
    this.monitorService.unBlockUser(this.user.id).subscribe(
      (data) => {
        this.isAlreadyBanned = false;
      },
      (e) => console.log(e)
    );
  }
}
