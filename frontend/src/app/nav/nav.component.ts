import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../auth/auth.service';
import { PwaService } from '../pwa.service';
import { SearchStateService } from '../search/search-state.service';

@Component({
	selector: 'app-nav',
	changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './nav.component.html',
  styleUrl: './nav.component.scss',
})
export class NavComponent {
  readonly auth = inject(AuthService);
  readonly pwa = inject(PwaService);
  private readonly router = inject(Router);
  private readonly searchState = inject(SearchStateService);

  freshHome(event: MouseEvent): void {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    this.searchState.startFresh();
    void this.router.navigateByUrl('/');
  }
}
