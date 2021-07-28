import { Component, Input, OnInit, Output } from '@angular/core';
import { Subject } from 'rxjs';
import { IUser } from 'src/app/shared/models/user';

@Component({
  selector: 'app-user-item',
  templateUrl: './user-item.component.html',
  styleUrls: ['./user-item.component.scss'],
})
export class UserItemComponent implements OnInit {
  @Input() user!: IUser;
  @Output('onSelectUser') onSelectUser = new Subject<string>();
  constructor() {}

  ngOnInit() {}

  selectUser() {
    this.onSelectUser.next(this.user.username);
  }
}
