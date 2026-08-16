import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AuthService } from './auth/auth.service';
import { NavComponent } from './nav/nav.component';
import { PwaService } from './pwa.service';
import { ToastService } from './toast.service';
import { VINResearchComponent } from './vin-research.component';
import { SearchAlertComponent } from './search-alert.component';

@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NavComponent, RouterOutlet, VINResearchComponent, SearchAlertComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent {
  readonly toast = inject(ToastService).message;
  readonly pwa = inject(PwaService);

  constructor() {
    void inject(AuthService).restore();
  }
}
