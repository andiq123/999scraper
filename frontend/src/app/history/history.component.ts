import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { environment } from '../../environments/environment';
import { AuthService } from '../auth/auth.service';
import { SearchHistory } from '../models';

@Component({
  selector: 'app-history',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, RouterLink],
  templateUrl: './history.component.html',
  styleUrl: './history.component.scss',
})
export class HistoryComponent {
  private readonly auth = inject(AuthService);
  readonly items = signal<SearchHistory[]>([]);

  constructor() { void this.load(); }

  private async load(): Promise<void> {
    const response = await fetch(environment.apiUrl + 'history', this.auth.withSession());
    if (response.status === 401) return this.auth.expire();
    if (response.ok) this.items.set(await response.json());
  }
}
