import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, ReplaySubject } from 'rxjs';
import { tap } from 'rxjs/operators';
import { environment } from 'src/environments/environment';
import { IRegistration, ISession } from '../shared/models/session';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private baseUrl = environment.apiUrl + 'account/';
  private sessionSource = new ReplaySubject<ISession | null>(1);
  readonly session$ = this.sessionSource.asObservable();

  constructor(private http: HttpClient, private router: Router) {}

  login(code: string): Observable<ISession> {
    return this.http.post<ISession>(this.baseUrl + 'login', { code }).pipe(
      tap((session) => this.setSession(session))
    );
  }

  register(): Observable<IRegistration> {
    return this.http.post<IRegistration>(this.baseUrl + 'register', {});
  }

  logOut() {
    localStorage.removeItem('token');
    this.sessionSource.next(null);
    this.router.navigateByUrl('/');
  }

  loadUser() {
    const userToken = localStorage.getItem('token');
    if (userToken) {
      this.http
        .get<ISession>(this.baseUrl + 'current')
        .subscribe({
          next: (session) => this.setSession(session),
          error: () => this.logOut(),
        });
    } else {
      this.sessionSource.next(null);
    }
  }

  private setSession(session: ISession) {
    if (session.token) {
      localStorage.setItem('token', session.token);
    }
    this.sessionSource.next(session);
  }
}
