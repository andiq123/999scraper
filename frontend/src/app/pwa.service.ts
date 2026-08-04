import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { filter } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ToastService } from './toast.service';

@Injectable({ providedIn: 'root' })
export class PwaService {
  private readonly updates = inject(SwUpdate);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);
  readonly online = signal(typeof navigator === 'undefined' || navigator.onLine);
  readonly installed = signal(false);
  readonly installAvailable = signal(false);
  readonly serviceWorkerEnabled = signal(this.updates.isEnabled);
  readonly updateReady = signal(false);
  readonly updateCountdown = signal(3);
  private updateTimer?: number;
  private activating = false;

  constructor() {
    if (typeof window === 'undefined') return;

    const standalone = window.matchMedia('(display-mode: standalone)').matches
      || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent)
      || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    this.installed.set(standalone);
    this.installAvailable.set(!standalone && ios);

    const onInstalled = (): void => {
      this.installAvailable.set(false);
      this.installed.set(true);
      this.toast.success('999 Search is installed.');
    };
    const onOnline = (): void => this.online.set(true);
    const onOffline = (): void => this.online.set(false);

    window.addEventListener('appinstalled', onInstalled);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    this.destroyRef.onDestroy(() => {
      if (this.updateTimer !== undefined) window.clearInterval(this.updateTimer);
      window.removeEventListener('appinstalled', onInstalled);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    });

    if (this.updates.isEnabled) {
      this.updates.versionUpdates.pipe(
        filter((event): event is VersionReadyEvent => event.type === 'VERSION_READY'),
        takeUntilDestroyed(this.destroyRef),
      ).subscribe(() => this.beginUpdateCountdown());
      this.updates.unrecoverable.pipe(
        takeUntilDestroyed(this.destroyRef),
      ).subscribe(() => this.beginUpdateCountdown());
    }
  }

  install(): void {
    this.toast.success('In Safari, tap Share, then “Add to Home Screen”.');
  }

  async activateUpdate(): Promise<void> {
    if (this.activating) return;
    this.activating = true;
    if (this.updateTimer !== undefined) window.clearInterval(this.updateTimer);
    this.updateTimer = undefined;
    try {
      await this.updates.activateUpdate();
      window.location.reload();
    } catch {
      this.activating = false;
      this.toast.error('The update could not be applied. Reload the page to try again.');
    }
  }

  private beginUpdateCountdown(): void {
    if (this.updateTimer !== undefined || this.activating) return;
    this.updateReady.set(true);
    this.updateCountdown.set(3);
    this.updateTimer = window.setInterval(() => {
      const remaining = this.updateCountdown() - 1;
      this.updateCountdown.set(Math.max(0, remaining));
      if (remaining > 0) return;
      window.clearInterval(this.updateTimer);
      this.updateTimer = undefined;
      void this.activateUpdate();
    }, 1_000);
  }
}
