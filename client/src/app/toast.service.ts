import { Injectable, signal } from '@angular/core';

type Toast = { kind: 'success' | 'error'; message: string };

@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly message = signal<Toast | null>(null);
  private timer?: ReturnType<typeof setTimeout>;

  success(message: string): void { this.show('success', message); }
  error(message: string): void { this.show('error', message); }

  private show(kind: Toast['kind'], message: string): void {
    clearTimeout(this.timer);
    this.message.set({ kind, message });
    this.timer = setTimeout(() => this.message.set(null), 4000);
  }
}
