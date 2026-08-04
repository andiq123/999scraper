import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../auth.service';
import { ToastService } from '../../toast.service';

@Component({
	selector: 'app-login',
	changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  templateUrl: './login.component.html',
  styleUrl: '../auth.scss',
})
export class LoginComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  readonly code = signal('');
  readonly submitting = signal(false);

  updateCode(event: Event): void {
    this.code.set((event.target as HTMLInputElement).value.replace(/\D/g, '').slice(0, 6));
  }

  async submit(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    const code = this.code();
    if (code.length !== 6) return;
    this.submitting.set(true);
		try {
			await this.auth.login(code);
			await this.router.navigateByUrl('/');
		} catch (error) {
			this.toast.error(error instanceof Error ? error.message : 'Invalid login code');
		} finally {
			this.submitting.set(false);
		}
  }
}
