import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class FullScreenLoadingService {
  private loadingSource = new BehaviorSubject<boolean>(false);
  public isLoading$ = this.loadingSource.asObservable();

  constructor() {}



  public enable() {
    this.loadingSource.next(true);
  }

  public disable() {
    this.loadingSource.next(false);
  }
}
