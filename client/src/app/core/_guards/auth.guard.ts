import { Injectable } from '@angular/core';
import { CanActivate, Router } from '@angular/router';
import { Observable, of } from 'rxjs';
import { map } from 'rxjs/operators';
import { AuthService } from 'src/app/auth/auth.service';

@Injectable({
  providedIn: 'root',
})
export class AuthGuard implements CanActivate {
  constructor(private router: Router, private authService: AuthService) {}

  canActivate(): Observable<boolean> {
    if (!localStorage.getItem('token')) {
      this.router.navigateByUrl('/auth/login');
      return of(false);
    }
    return this.authService.session$.pipe(
      map((user) => {
        if (user) return true;

        this.router.navigateByUrl('/auth/login');
        return false;
      })
    );
  }
}
