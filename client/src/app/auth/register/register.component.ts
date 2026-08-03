import { HttpErrorResponse } from '@angular/common/http';
import { Component, signal } from '@angular/core';
import { ToastService } from '../../core/_services/toast.service';
import { AuthService } from '../auth.service';

@Component({
  standalone: false,
  selector: 'app-register',
  templateUrl: './register.component.html',
  styleUrls: ['./register.component.scss'],
})
export class RegisterComponent {
  readonly loginCode = signal('');
  readonly creating = signal(false);
  readonly copied = signal(false);

  constructor(
    private authService: AuthService,
    private toast: ToastService
  ) {}

  createCode(): void {
    this.creating.set(true);
    this.authService.register().subscribe(
      ({ code }) => {
        this.loginCode.set(code);
        this.creating.set(false);
      },
      (error: HttpErrorResponse) => {
        this.creating.set(false);
        this.toast.error(error.error?.error ?? 'Registration failed');
      }
    );
  }

  async copy(): Promise<void> {
    await navigator.clipboard.writeText(this.loginCode());
    this.copied.set(true);
    this.toast.success('Login code copied');
  }
}
