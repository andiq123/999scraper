import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { environment } from '../../environments/environment';

interface HealthStatus {
  status: 'ok' | 'degraded';
  services: {
    backend: boolean;
    database: boolean;
    redis: boolean;
  };
}

@Component({
  selector: 'app-settings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.scss',
})
export class SettingsComponent {
  readonly health = signal<HealthStatus | null>(null);
  readonly checking = signal(false);
  readonly unavailable = signal(false);
  readonly latency = signal<number | null>(null);
  readonly lastChecked = signal<Date | null>(null);

  private readonly destroyRef = inject(DestroyRef);
  private request: AbortController | null = null;
  private readonly refreshTimer: number;

  constructor() {
    void this.refresh();
    this.refreshTimer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void this.refresh();
    }, 30_000);
    this.destroyRef.onDestroy(() => {
      window.clearInterval(this.refreshTimer);
      this.request?.abort();
    });
  }

  async refresh(): Promise<void> {
    if (this.checking()) return;
    this.checking.set(true);
    this.request?.abort();
    const request = new AbortController();
    this.request = request;
    const timeout = window.setTimeout(() => request.abort(), 5_000);
    const started = performance.now();
    try {
      const response = await fetch(environment.apiUrl + 'health', {
        credentials: 'omit',
        cache: 'no-store',
        signal: request.signal,
      });
      const body = await response.json() as HealthStatus;
      if (!body.services || typeof body.services.backend !== 'boolean') throw new Error('Invalid health response');
      this.health.set(body);
      this.unavailable.set(false);
      this.latency.set(Math.max(1, Math.round(performance.now() - started)));
      this.lastChecked.set(new Date());
    } catch {
      if (this.request === request) {
        this.unavailable.set(true);
        this.health.set(null);
        this.latency.set(null);
        this.lastChecked.set(new Date());
      }
    } finally {
      window.clearTimeout(timeout);
      if (this.request === request) {
        this.request = null;
        this.checking.set(false);
      }
    }
  }

  statusLabel(value: boolean | undefined): string {
    if (value === true) return 'Enabled';
    if (this.checking() && !this.health()) return 'Checking';
    return 'Unavailable';
  }
}
