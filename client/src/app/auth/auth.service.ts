import { Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { environment } from '../../environments/environment';
import { Registration, Session } from '../models';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly router = inject(Router);
  private readonly url = environment.apiUrl + 'account/';
  private restoreRequest?: Promise<boolean>;

  readonly session = signal<Session | null>(null);

  restore(): Promise<boolean> {
    if (this.session()) return Promise.resolve(true);
    return this.restoreRequest ??= this.loadSession();
  }

  async login(code: string): Promise<void> {
    this.session.set(await this.request<Session>('login', { method: 'POST', body: JSON.stringify({ code }) }));
  }

  register(): Promise<Registration> {
    return this.request('register', { method: 'POST', body: '{}' });
  }

  async logout(): Promise<void> {
    try {
      await this.request('logout', { method: 'POST', body: '{}' });
    } finally {
      this.restoreRequest = undefined;
      this.session.set(null);
      await this.router.navigateByUrl('/');
    }
  }

  expire(): void {
    this.restoreRequest = undefined;
    this.session.set(null);
    void this.router.navigateByUrl('/login');
  }

  private async loadSession(): Promise<boolean> {
    try {
      this.session.set(await this.request<Session>('current'));
      return true;
    } catch {
      return false;
    }
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(this.url + path, {
      ...init,
      credentials: 'include',
      headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error || `Request failed (${response.status}).`);
    }
    return response.status === 204 ? undefined as T : response.json();
  }
}
