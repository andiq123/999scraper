import { Injectable } from '@angular/core';
import { CanActivate, Router } from '@angular/router';
import { Observable, of } from 'rxjs';
import { map } from 'rxjs/operators';
import { AuthService } from 'src/app/auth/auth.service';
import { IUser } from 'src/app/shared/models/user';

@Injectable({
  providedIn: 'root',
})
export class AuthGuard implements CanActivate {
  constructor(private router: Router, private authService: AuthService) {}

  canActivate(): Observable<boolean> {
    if (!localStorage.getItem('token')) {
      this.router.navigateByUrl('/');
      return of(false);
    }
    return this.authService.User$.pipe(
      map((user) => {
        if (user) return true;

        this.router.navigateByUrl('/');
        return false;
      })
    );
  }
}
