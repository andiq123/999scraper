import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AuthService } from './auth/auth.service';
import { NavComponent } from './nav/nav.component';
import { PwaService } from './pwa.service';
import { ToastService } from './toast.service';
import { VINResearchComponent } from './vin-research.component';
import { SearchAlertComponent } from './search-alert.component';
import { UiPreferencesService } from './ui-preferences.service';
import { IconComponent } from './icon.component';
import { backendReachable, probeBackend, probingBackend } from './connection';

@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NavComponent, RouterOutlet, VINResearchComponent, SearchAlertComponent, IconComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent {
  readonly toast = inject(ToastService).message;
  readonly pwa = inject(PwaService);
  readonly reachable = backendReachable;
  readonly probing = probingBackend;
  readonly retry = probeBackend;

  constructor() {
    inject(UiPreferencesService);
    void inject(AuthService).restore();
  }
}
