import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { filter, timer } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

const UPDATE_INTERVAL = 6 * 60 * 60 * 1_000;
const FOREGROUND_CHECK_INTERVAL = 30 * 60 * 1_000;
const RELOAD_DELAY = 480;

@Injectable({ providedIn: 'root' })
export class PwaService {
  private readonly updates = inject(SwUpdate);
  private readonly destroyRef = inject(DestroyRef);
  private checking = false;
  private lastCheckedAt = 0;
  readonly online = signal(typeof navigator === 'undefined' || navigator.onLine);
  readonly updateReady = signal(false);
  readonly applyingUpdate = signal(false);
  readonly updateMessage = signal('Restart once to use the latest version.');

  constructor() {
    if (typeof window === 'undefined') return;

    const onOnline = (): void => {
      this.online.set(true);
      void this.checkForUpdate(true);
    };
    const onOffline = (): void => this.online.set(false);
    const onVisible = (): void => {
      if (document.visibilityState === 'visible') void this.checkForUpdate();
    };

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    document.addEventListener('visibilitychange', onVisible);
    this.destroyRef.onDestroy(() => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      document.removeEventListener('visibilitychange', onVisible);
    });

    if (this.updates.isEnabled) {
      this.updates.versionUpdates
        .pipe(
          filter((event): event is VersionReadyEvent => event.type === 'VERSION_READY'),
          takeUntilDestroyed(this.destroyRef),
        )
        .subscribe(() => this.showUpdate('Restart once to use the latest version.'));
      this.updates.unrecoverable
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe(() => this.showUpdate('Restart to restore the saved app.'));

      // Navigation already triggers checks; this covers long-lived installed sessions.
      timer(15_000, UPDATE_INTERVAL)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe(() => void this.checkForUpdate());
    }
  }

  reloadForUpdate(): void {
    if (this.applyingUpdate()) return;
    this.applyingUpdate.set(true);
    window.setTimeout(() => window.location.reload(), RELOAD_DELAY);
  }

  private async checkForUpdate(force = false): Promise<void> {
    const now = Date.now();
    if (
      !this.updates.isEnabled ||
      !this.online() ||
      this.checking ||
      (!force && now - this.lastCheckedAt < FOREGROUND_CHECK_INTERVAL)
    )
      return;

    this.checking = true;
    this.lastCheckedAt = now;
    try {
      await this.updates.checkForUpdate();
    } catch {
      // An update check is opportunistic; the existing app remains usable offline.
    } finally {
      this.checking = false;
    }
  }

  private showUpdate(message: string): void {
    if (this.updateReady()) return;
    this.updateMessage.set(message);
    this.updateReady.set(true);
  }
}
