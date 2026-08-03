import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

export interface ToastMessage {
  kind: 'success' | 'error';
  message: string;
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  private readonly messages = new Subject<ToastMessage>();
  readonly messages$ = this.messages.asObservable();
  private timer?: ReturnType<typeof setTimeout>;

  success(message: string): void { this.show('success', message); }
  error(message: string): void { this.show('error', message); }

  private show(kind: ToastMessage['kind'], message: string): void {
    clearTimeout(this.timer);
    this.messages.next({ kind, message });
    this.timer = setTimeout(() => this.messages.next({ kind, message: '' }), 4000);
  }
}
