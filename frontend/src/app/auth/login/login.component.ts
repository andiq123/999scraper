import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../auth.service';
import { returnPath } from '../return-path';

@Component({
  selector: 'app-login',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  templateUrl: './login.component.html',
  styleUrl: '../auth.scss',
})
export class LoginComponent {
  readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  readonly returnUrl = returnPath(inject(ActivatedRoute).snapshot.queryParamMap.get('returnUrl'));

  readonly code = signal('');
  readonly submitting = signal(false);
  readonly error = signal<string | null>(null);

  async reconnect(): Promise<void> {
    if (this.submitting()) return;
    this.submitting.set(true);
    try {
      if (await this.auth.restore()) await this.router.navigateByUrl(this.returnUrl);
    } finally {
      this.submitting.set(false);
    }
  }

  updateCode(event: Event): void {
    this.code.set((event.target as HTMLInputElement).value.replace(/\D/g, '').slice(0, 6));
    this.error.set(null);
  }

  async submit(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    const code = this.code();
    if (code.length !== 6 || this.submitting()) return;
    this.submitting.set(true);
    this.error.set(null);
    try {
      await this.auth.login(code);
      await this.router.navigateByUrl(this.returnUrl);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Couldn’t log in. Please try again.');
    } finally {
      this.submitting.set(false);
    }
  }
}
