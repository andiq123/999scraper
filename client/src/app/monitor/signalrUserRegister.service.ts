import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';
import { IActivity } from '../shared/models/activity';
import { IUser } from '../shared/models/user';
import { SignalR } from '../shared/signalR';

@Injectable({
  providedIn: 'root',
})
export class SignalrUserRegisterService extends SignalR {
  private userRegisteredSource = new Subject<IUser>();
  public UserRegistered$ = this.userRegisteredSource.asObservable();

  private lastActiveUpdatedSource = new Subject<LastActive>();
  public LastActiveUpdated$ = this.lastActiveUpdatedSource.asObservable();

  private activityUpdatedSource = new Subject<ActiviyUpdate>();
  public ActivityUpdated$ = this.activityUpdatedSource.asObservable();

  constructor() {
    super('userAccount');
  }

  start() {
    this.connect()
      .then(() => {
        this.connection.on('UserRegistered', (user: IUser) => {
          this.userRegisteredSource.next(user);
        });

        this.connection.on('LastActiveUpdated', (data: LastActive) => {
          this.lastActiveUpdatedSource.next(data);
        });

        this.connection.on('ActivityAdded', (data: ActiviyUpdate) => {
          console.log('gdfg');
          this.activityUpdatedSource.next(data);
        });
      })
      .catch((e) => console.log(e));
  }

  stop() {
    this.disconnect().then(() => {});
  }
}

export interface LastActive {
  userId: string;
  lastActive: string;
}

export interface ActiviyUpdate {
  userId: string;
  activity: IActivity;
}
