import { Injectable } from '@angular/core';
import { ToastrService } from 'ngx-toastr';

import { BehaviorSubject, Subject } from 'rxjs';
import { SignalR } from 'src/app/shared/signalR';
import { IProgress } from '../../shared/models/progress';

@Injectable({
  providedIn: 'root',
})
export class SignalrService extends SignalR {
  private connectionIdSource = new BehaviorSubject<string | null>(null);
  public connectionId$ = this.connectionIdSource.asObservable();

  private progressChangedSource = new Subject<IProgress | null>();
  public progressChanged$ = this.progressChangedSource.asObservable();

  constructor(private toastrService: ToastrService) {
    super('progress');
  }

  start() {
    this.connect().then(
      () => {
        this.connectionIdSource.next(this.connection.connectionId);
        this.connection.on('ProgressChanged', (progress: IProgress) => {
          this.progressChangedSource.next(progress);
        });
      },
      (e) => console.log(e)
    );
  }

  stop() {
    this.disconnect().then(() => {});
  }
}
