import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { BehaviorSubject, Observable, ReplaySubject } from 'rxjs';
import { tap } from 'rxjs/operators';
import { environment } from 'src/environments/environment';
import { IUser } from '../shared/models/user';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private baseUrl = environment.apiUrl + 'account/';
  private userSource = new ReplaySubject<IUser>(1);
  public User$ = this.userSource.asObservable();

  constructor(private http: HttpClient, private router: Router) {}

  login(loginDto: ILoginDto): Observable<IUser> {
    return this.http.post<IUser>(this.baseUrl + 'login', loginDto).pipe(
      tap((user: IUser) => {
        this.setUser(user);
      })
    );
  }

  register(registerDto: IRegisterDto) {
    return this.http.post<IUser>(this.baseUrl + 'register', registerDto).pipe(
      tap((user: IUser) => {
        this.setUser(user);
      })
    );
  }

  logOut() {
    localStorage.removeItem('token');
    this.userSource.next(undefined);
    this.router.navigateByUrl('/');
  }

  loadUser() {
    var userToken = localStorage.getItem('token');
    if (userToken) {
      this.http
        .get<IUser>(this.baseUrl + 'current')
        .subscribe((user: IUser) => {
          this.setUser(user);
        });
    }
  }

  private setUser(user: IUser) {
    if (user.token) {
      localStorage.setItem('token', user.token);
    }
    user.isAdmin = this.getDecodedToken(user.token);
    this.userSource.next(user);
  }

  getDecodedToken(token: string) {
    return !!JSON.parse(atob(token.split('.')[1])).role;
  }
}

interface ILoginDto {
  username: string;
  password: string;
}

interface IRegisterDto {
  username: string;
  email: string;
  password: string;
}
