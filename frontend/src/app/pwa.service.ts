import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { filter } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ToastService } from './toast.service';

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

@Injectable({ providedIn: 'root' })
export class PwaService {
  private readonly updates = inject(SwUpdate);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);
  private deferredPrompt: InstallPromptEvent | null = null;

  readonly online = signal(typeof navigator === 'undefined' || navigator.onLine);
  readonly installed = signal(false);
  readonly installAvailable = signal(false);
  readonly serviceWorkerEnabled = signal(this.updates.isEnabled);
  readonly updateReady = signal(false);

  constructor() {
    if (typeof window === 'undefined') return;

    const standalone = window.matchMedia('(display-mode: standalone)').matches
      || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent)
      || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    this.installed.set(standalone);
    this.installAvailable.set(!standalone && ios);

    const onInstallPrompt = (event: Event): void => {
      event.preventDefault();
      this.deferredPrompt = event as InstallPromptEvent;
      this.installAvailable.set(true);
    };
    const onInstalled = (): void => {
      this.deferredPrompt = null;
      this.installAvailable.set(false);
      this.installed.set(true);
      this.toast.success('999 Search is installed.');
    };
    const onOnline = (): void => this.online.set(true);
    const onOffline = (): void => this.online.set(false);

    window.addEventListener('beforeinstallprompt', onInstallPrompt);
    window.addEventListener('appinstalled', onInstalled);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    this.destroyRef.onDestroy(() => {
      window.removeEventListener('beforeinstallprompt', onInstallPrompt);
      window.removeEventListener('appinstalled', onInstalled);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    });

    if (this.updates.isEnabled) {
      this.updates.versionUpdates.pipe(
        filter((event): event is VersionReadyEvent => event.type === 'VERSION_READY'),
        takeUntilDestroyed(this.destroyRef),
      ).subscribe(() => this.updateReady.set(true));
      this.updates.unrecoverable.pipe(
        takeUntilDestroyed(this.destroyRef),
      ).subscribe(() => this.updateReady.set(true));
    }
  }

  async install(): Promise<void> {
    if (!this.deferredPrompt) {
      this.toast.success('In Safari, tap Share, then “Add to Home Screen”.');
      return;
    }
    const prompt = this.deferredPrompt;
    this.deferredPrompt = null;
    this.installAvailable.set(false);
    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      if (choice.outcome === 'dismissed') this.toast.success('You can install the app later from your browser menu.');
    } catch {
      this.toast.error('Installation is unavailable here. Use your browser’s Add to Home Screen action.');
    }
  }

  async activateUpdate(): Promise<void> {
    try {
      await this.updates.activateUpdate();
      window.location.reload();
    } catch {
      this.toast.error('The update could not be applied. Reload the page to try again.');
    }
  }
}
