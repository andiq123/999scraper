import { Injectable } from '@angular/core';
import {
  ActivatedRouteSnapshot,
  CanActivate,
  Router,
  RouterStateSnapshot,
  UrlTree,
} from '@angular/router';
import { Observable, of } from 'rxjs';
import { map } from 'rxjs/operators';
import { AuthService } from 'src/app/auth/auth.service';

@Injectable({
  providedIn: 'root',
})
export class AdminGuard implements CanActivate {
  constructor(private router: Router, private authService: AuthService) {}

  canActivate(
    route: ActivatedRouteSnapshot,
    state: RouterStateSnapshot
  ): Observable<boolean> {
    if (!localStorage.getItem('token')) {
      this.router.navigateByUrl('/');
      return of(false);
    }
    return this.authService.User$.pipe(
      map((user) => {
        if (user.isAdmin) return true;

        this.router.navigateByUrl('/');
        return false;
      })
    );
  }
}
