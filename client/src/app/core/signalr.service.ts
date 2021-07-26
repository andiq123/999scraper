import { Injectable } from '@angular/core';
import * as signalR from '@microsoft/signalr';
import { Subject } from 'rxjs';
import { IProgress } from '../shared/models/progress';

@Injectable({
  providedIn: 'root',
})
export class SignalrService {
  private connection: signalR.HubConnection;
  private url = 'https://localhost:5001/progress';

  private progressChangedSource = new Subject<IProgress | null>();
  public progressChanged$ = this.progressChangedSource.asObservable();

  constructor() {
    this.connection = new signalR.HubConnectionBuilder()
      .withUrl(this.url)
      .build();
    this.connection.start().then(
      () => {},
      (e) => {
        console.log(e);
      }
    );

    this.connection.on('ProgressChanged', (progress: IProgress) => {
      this.progressChangedSource.next(progress);
    });
  }
}
