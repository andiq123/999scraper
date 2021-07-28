import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit } from '@angular/core';
import { ToastrService } from 'ngx-toastr';
import { IUser } from 'src/app/shared/models/user';
import { MonitorService } from '../monitor.service';

@Component({
  selector: 'app-admin',
  templateUrl: './admin.component.html',
  styleUrls: ['./admin.component.scss'],
})
export class AdminComponent implements OnInit {
  users: IUser[] = [];

  constructor(
    private monitorService: MonitorService,
    private toastrService: ToastrService
  ) {}

  ngOnInit() {
    this.loadUsers();
  }

  loadUsers() {
    this.monitorService.getUsers().subscribe(
      (users) => (this.users = users),
      (e: HttpErrorResponse) => console.log(e)
    );
  }

  onSelectUser(username: string) {
    console.log(username);
  }
}
