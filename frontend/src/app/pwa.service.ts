import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { concat, filter, interval, timer } from 'rxjs';
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
  readonly applyingUpdate = signal(false);
  readonly updateMessage = signal('A newer version is ready. Refresh when you’re ready.');

  constructor() {
    if (typeof window === 'undefined') return;

    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
    const ios =
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
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
      window.removeEventListener('appinstalled', onInstalled);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    });

    if (this.updates.isEnabled) {
      this.updates.versionUpdates
        .pipe(
          filter((event): event is VersionReadyEvent => event.type === 'VERSION_READY'),
          takeUntilDestroyed(this.destroyRef),
        )
        .subscribe(() => this.showUpdate('A newer version is ready. Refresh when you’re ready.'));
      this.updates.unrecoverable
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe(() => this.showUpdate('This version needs a refresh to recover.'));

      // The worker checks on navigation too. A light six-hour poll keeps a long-open app fresh
      // without adding work to the initial render or repeatedly waking the browser.
      concat(timer(15_000), interval(6 * 60 * 60 * 1_000))
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe(() => void this.checkForUpdate());
    }
  }

  install(): void {
    this.toast.success('In Safari, tap Share, then “Add to Home Screen”.');
  }

  reloadForUpdate(): void {
    if (this.applyingUpdate()) return;
    this.applyingUpdate.set(true);
    requestAnimationFrame(() => window.location.reload());
  }

  private async checkForUpdate(): Promise<void> {
    try {
      await this.updates.checkForUpdate();
    } catch {
      // An update check is opportunistic; the existing app remains usable offline.
    }
  }

  private showUpdate(message: string): void {
    if (this.updateReady()) return;
    this.updateMessage.set(message);
    this.updateReady.set(true);
  }
}
