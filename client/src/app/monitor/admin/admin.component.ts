import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit } from '@angular/core';
import { IActivity } from 'src/app/shared/models/activity';
import { IUser } from 'src/app/shared/models/user';
import { MonitorService } from '../monitor.service';

@Component({
  standalone: false,
  selector: 'app-admin',
  templateUrl: './admin.component.html',
  styleUrls: ['./admin.component.scss'],
})
export class AdminComponent implements OnInit {
  users: IUser[] = [];
  filteredUsers: IUser[] = [];
  activities: IActivity[] = [];

  constructor(private monitorService: MonitorService) {}

  ngOnInit() {
    this.loadUsers();
  }

  searchUserCriteria: string = '';
  onSearchUser() {
    if (this.searchUserCriteria) {
      this.filteredUsers = this.users.filter((x) =>
        x.username.toLowerCase().includes(this.searchUserCriteria.toLowerCase())
      );
    } else {
      this.filteredUsers = this.users;
    }
  }

  usersLoaded = false;
  loadUsers() {
    this.usersLoaded = false;
    this.monitorService.getUsers().subscribe(
      (users) => {
        this.users = users;
        this.filteredUsers = this.users;
        this.usersLoaded = true;
      },
      (e: HttpErrorResponse) => {
        this.usersLoaded = true;
        this.users = [];
      }
    );
  }

  onSelectUser(userId: string) {
    this.activities = [];
    this.loadActivity(userId);
  }

  currentUserId: string = '';
  activityLoaded = false;
  loadActivity(userId: string) {
    this.currentUserId = '';
    this.activityLoaded = false;
    this.monitorService.getActivitiesForUser(userId).subscribe(
      (data) => {
        this.currentUserId = userId;
        this.activityLoaded = true;
        this.activities = data;
      },
      (e) => {
        this.activityLoaded = true;
        this.activities = [];
      }
    );
  }
}
