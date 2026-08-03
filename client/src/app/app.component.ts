import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AuthService } from './auth/auth.service';
import { NavComponent } from './nav/nav.component';
import { ToastService } from './toast.service';

@Component({
	selector: 'app-root',
	changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NavComponent, RouterOutlet],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent {
  readonly toast = inject(ToastService).message;

  constructor() {
		void inject(AuthService).restore();
  }
}
