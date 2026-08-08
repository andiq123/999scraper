import { Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { environment } from '../../environments/environment';
import { Registration, Session } from '../models';

const tokenKey = '999scraper.session';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly router = inject(Router);
  private readonly url = environment.apiUrl + 'account/';
  private restoreRequest?: Promise<boolean>;

  readonly session = signal<Session | null>(null);
  readonly ready = signal(false);

  restore(): Promise<boolean> {
    if (this.session()) {
      this.ready.set(true);
      return Promise.resolve(true);
    }
    return (this.restoreRequest ??= this.loadSession().finally(() => this.ready.set(true)));
  }

  async login(code: string): Promise<void> {
    const { token, ...session } = await this.request<Session>('login', {
      method: 'POST',
      body: JSON.stringify({ code }),
    });
    if (!token) throw new Error('The server did not return a session token.');
    this.writeToken(token);
    this.restoreRequest = Promise.resolve(true);
    this.session.set(session);
    this.ready.set(true);
  }

  register(): Promise<Registration> {
    return this.request('register', { method: 'POST', body: '{}' });
  }

  async logout(): Promise<void> {
    this.clearSession();
    await this.router.navigateByUrl('/');
  }

  expire(): void {
    this.clearSession();
    void this.router.navigateByUrl('/login');
  }

  withSession(init: RequestInit = {}): RequestInit {
    const headers = new Headers(init.headers);
    const token = this.readToken();
    if (token) headers.set('Authorization', `Bearer ${token}`);
    if (init.body) headers.set('Content-Type', 'application/json');
    return { ...init, credentials: 'omit', headers };
  }

  private async loadSession(): Promise<boolean> {
    if (!this.readToken()) return false;
    try {
      const session = await this.request<Session | null>('current');
      this.session.set(session);
      if (!session) this.clearSession();
      return session !== null;
    } catch {
      this.clearSession();
      return false;
    }
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(this.url + path, this.withSession(init));
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error || `Request failed (${response.status}).`);
    }
    return response.status === 204 ? (undefined as T) : response.json();
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
  }
}
