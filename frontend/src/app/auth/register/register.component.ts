import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AuthService } from '../auth.service';
import { returnPath } from '../return-path';

@Component({
  selector: 'app-register',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  templateUrl: './register.component.html',
  styleUrl: '../auth.scss',
})
export class RegisterComponent {
  private readonly auth = inject(AuthService);
  readonly returnUrl = returnPath(inject(ActivatedRoute).snapshot.queryParamMap.get('returnUrl'));

  readonly code = signal('');
  readonly creating = signal(false);
  readonly copied = signal(false);
  readonly error = signal<string | null>(null);

  async create(): Promise<void> {
    if (this.creating() || this.code()) return;
    this.creating.set(true);
    this.error.set(null);
    try {
      this.code.set((await this.auth.register()).code);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Couldn’t create a code. Please try again.');
    } finally {
      this.creating.set(false);
    }
  }

  async copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.code());
      this.copied.set(true);
      this.error.set(null);
    } catch {
      this.error.set('Touch and hold the code to select and copy it.');
    }
  }
}
