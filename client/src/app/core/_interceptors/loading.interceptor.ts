import { Injectable } from '@angular/core';
import {
  HttpRequest,
  HttpHandler,
  HttpEvent,
  HttpInterceptor,
} from '@angular/common/http';
import { Observable } from 'rxjs';
import { FullScreenLoadingService } from '../_services/fullScreenLoading.service';
import { finalize } from 'rxjs/operators';
import { Router } from '@angular/router';

@Injectable()
export class LoadingInterceptor implements HttpInterceptor {
  constructor(
    private fullScreenLoading: FullScreenLoadingService,
    private router: Router
  ) {}

  intercept(
    request: HttpRequest<unknown>,
    next: HttpHandler
  ): Observable<HttpEvent<unknown>> {
    const showLoading = !this.router.url.includes('search');
    if (showLoading) this.fullScreenLoading.enable();
    return next.handle(request).pipe(
      finalize(() => {
        if (showLoading) this.fullScreenLoading.disable();
      })
    );
  }
}
