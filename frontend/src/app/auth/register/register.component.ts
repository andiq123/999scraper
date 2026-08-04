import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../auth.service';
import { ToastService } from '../../toast.service';

@Component({
	selector: 'app-register',
	changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  templateUrl: './register.component.html',
  styleUrl: '../auth.scss',
})
export class RegisterComponent {
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);

  readonly code = signal('');
  readonly creating = signal(false);
  readonly copied = signal(false);

  async create(): Promise<void> {
		this.creating.set(true);
		try {
			this.code.set((await this.auth.register()).code);
		} catch (error) {
			this.toast.error(error instanceof Error ? error.message : 'Registration failed');
		} finally {
			this.creating.set(false);
		}
  }

  async copy(): Promise<void> {
    await navigator.clipboard.writeText(this.code());
    this.copied.set(true);
  }
}
