import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class FullScreenLoadingService {
  private activeRequests = 0;
  private loadingSource = new BehaviorSubject<boolean>(false);
  public isLoading$ = this.loadingSource.asObservable();

  public enable() {
    this.activeRequests++;
    if (this.activeRequests === 1) this.loadingSource.next(true);
  }

  public disable() {
    this.activeRequests = Math.max(0, this.activeRequests - 1);
    if (this.activeRequests === 0) this.loadingSource.next(false);
  }
}
