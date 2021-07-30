import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { ToastrService } from 'ngx-toastr';
import { Subscription } from 'rxjs';
import { IActivity } from 'src/app/shared/models/activity';
import { IUser } from 'src/app/shared/models/user';
import { MonitorService } from '../monitor.service';
import { SignalrUserRegisterService } from '../signalrUserRegister.service';

@Component({
  selector: 'app-admin',
  templateUrl: './admin.component.html',
  styleUrls: ['./admin.component.scss'],
})
export class AdminComponent implements OnInit, OnDestroy {
  private subscriptions: Subscription[] = [];

  users: IUser[] = [];
  filteredUsers: IUser[] = [];
  activities: IActivity[] = [];

  constructor(
    private monitorService: MonitorService,
    private userAccountSignalr: SignalrUserRegisterService
  ) {}

  ngOnDestroy(): void {
    this.userAccountSignalr.stop();
    this.subscriptions.forEach((x) => x.unsubscribe());
  }

  ngOnInit() {
    this.userAccountSignalr.start();
    this.loadUsers();

    this.subscriptions.push(
      this.userAccountSignalr.UserRegistered$.subscribe((user) => {
        if (user) this.users.unshift(user);
      })
    );

    this.subscriptions.push(
      this.userAccountSignalr.LastActiveUpdated$.subscribe((data) => {
        var user = this.users.find((x) => x.id === data.userId);
        if (user) {
          user.lastActive = data.lastActive;
        }
      })
    );

    this.subscriptions.push(
      this.userAccountSignalr.ActivityUpdated$.subscribe((data) => {
        if (this.currentUserId === data.userId) {
          this.activities.unshift(data.activity);
        }
      })
    );
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
