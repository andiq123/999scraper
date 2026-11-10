import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationCancel, NavigationEnd, NavigationError, Router, RouterLink } from '@angular/router';
import { filter, map, tap } from 'rxjs';
import { IconComponent } from '../icon.component';

const accountPaths = ['/account', '/login', '/register', '/history', '/alerts'];

@Component({
  selector: 'app-nav',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, IconComponent],
  templateUrl: './nav.component.html',
  styleUrl: './nav.component.scss',
})
export class NavComponent {
  private readonly router = inject(Router);

  /** The tapped tab lights up at once, ahead of the page transition; the route
   *  takes over again whenever a navigation settles (also by back and forward). */
  private readonly chosen = signal<number | null>(null);
  private readonly currentUrl = toSignal(
    this.router.events.pipe(
      filter(
        (event) =>
          event instanceof NavigationEnd || event instanceof NavigationCancel || event instanceof NavigationError,
      ),
      tap(() => this.chosen.set(null)),
      map(() => this.router.url),
    ),
    { initialValue: this.router.url },
  );
  private readonly routeIndex = computed(() => {
    const path = this.currentUrl().split(/[?#]/)[0];
    if (path === '/saved') return 1;
    return accountPaths.includes(path) ? 2 : 0;
  });
  readonly index = computed(() => this.chosen() ?? this.routeIndex());

  choose(index: number, event: MouseEvent): void {
    // Modified clicks open another tab or window; this one stays where it is.
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    this.chosen.set(index);
  }
}
