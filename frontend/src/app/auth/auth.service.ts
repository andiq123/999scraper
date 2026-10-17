import { Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { environment } from '../../environments/environment';
import { Registration, Session } from '../models';
import { ApiError, requestJson } from '../api-request';
import { returnPath } from './return-path';

const tokenKey = '999scraper.session';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly router = inject(Router);
  private readonly url = environment.apiUrl + 'account/';
  private restoreRequest?: Promise<boolean>;

  readonly session = signal<Session | null>(null);
  readonly ready = signal(false);
  readonly restoreError = signal<string | null>(null);

  restore(): Promise<boolean> {
    if (this.session()) {
      this.ready.set(true);
      return Promise.resolve(true);
    }
    if (this.restoreRequest) return this.restoreRequest;
    const request = this.loadSession();
    this.restoreRequest = request;
    void request.finally(() => {
      if (this.restoreRequest === request) this.restoreRequest = undefined;
      this.ready.set(true);
    });
    return request;
  }

  async login(code: string): Promise<void> {
    const { token, ...session } = await this.request<Session>('login', {
      method: 'POST',
      body: JSON.stringify({ code }),
    });
    if (!token || typeof token !== 'string' || !session.id || typeof session.id !== 'string') {
      throw new Error('The server returned an invalid login. Please try again.');
    }
    this.writeToken(token);
    this.session.set(session);
    this.restoreError.set(null);
    this.ready.set(true);
  }

  async register(): Promise<Registration> {
    const registration = await this.request<Registration>('register', { method: 'POST', body: '{}' });
    if (!registration || !/^[0-9]{6}$/.test(registration.code))
      throw new Error('The server returned an invalid login code. Please try again.');
    return registration;
  }

  async logout(): Promise<void> {
    this.clearSession();
    await this.router.navigateByUrl('/');
  }

  expire(): void {
    const destination = returnPath(this.router.url);
    this.clearSession();
    void this.router.navigate(['/login'], { queryParams: { returnUrl: destination } });
  }

  async requestPrivate<T>(path: string, init?: RequestInit): Promise<T> {
    const token = this.readToken();
    try {
      return await requestJson<T>(environment.apiUrl + path, this.withSession({ ...init, cache: 'no-store' }));
    } catch (error) {
      if (error instanceof ApiError && error.status === 401 && token === this.readToken()) this.expire();
      throw error;
    }
  }

  withSession(init: RequestInit = {}): RequestInit {
    const headers = new Headers(init.headers);
    const token = this.readToken();
    if (token) headers.set('Authorization', `Bearer ${token}`);
    if (init.body) headers.set('Content-Type', 'application/json');
    return { ...init, credentials: 'omit', headers };
  }

  private async loadSession(): Promise<boolean> {
    const token = this.readToken();
    if (!token) return false;
    this.restoreError.set(null);
    try {
      const session = await this.request<Session | null>('current');
      if (token !== this.readToken()) return !!this.session();
      if (session !== null && (!session?.id || typeof session.id !== 'string')) {
        throw new Error('The account response couldn’t be read. Please retry the connection.');
      }
      this.session.set(session);
      if (!session) this.clearSession();
      return session !== null;
    } catch (error) {
      if (token !== this.readToken()) return !!this.session();
      if (error instanceof ApiError && error.status === 401) this.clearSession();
      else this.restoreError.set(error instanceof Error ? error.message : 'Couldn’t reconnect to your account.');
      return false;
    }
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    return requestJson<T>(this.url + path, this.withSession({ ...init, cache: 'no-store' }));
  }

  private readToken(): string | null {
    try {
      return localStorage.getItem(tokenKey);
    } catch {
      return null;
    }
  }

  private writeToken(token: string): void {
    try {
      localStorage.setItem(tokenKey, token);
    } catch {
      throw new Error('This browser could not save the login session.');
    }
  }

  private clearSession(): void {
    try {
      localStorage.removeItem(tokenKey);
    } catch {
      /* Storage can be unavailable in private browsing. */
    }
    this.restoreRequest = undefined;
    this.session.set(null);
    this.restoreError.set(null);
  }
}
