import { Injectable } from '@angular/core';
import * as signalR from '@microsoft/signalr';
import { BehaviorSubject, Subject } from 'rxjs';
import { IProgress } from '../../shared/models/progress';

@Injectable({
  providedIn: 'root',
})
export class SignalrService {
  private connection: signalR.HubConnection;
  private url = 'https://localhost:5001/progress';
  private connectionIdSource = new BehaviorSubject<string | null>(null);
  public connectionId$ = this.connectionIdSource.asObservable();

  private progressChangedSource = new Subject<IProgress | null>();
  public progressChanged$ = this.progressChangedSource.asObservable();

  constructor() {
    this.connection = new signalR.HubConnectionBuilder()
      .withUrl(this.url)
      .build();
  }

  connect() {
    this.connection.start().then(
      () => {
        this.connectionIdSource.next(this.connection.connectionId);
      },
      (e) => {
        console.log(e);
      }
    );

    this.connection.on('ProgressChanged', (progress: IProgress) => {
      this.progressChangedSource.next(progress);
    });
  }

  disconnect() {
    this.connection.stop();
  }
}
