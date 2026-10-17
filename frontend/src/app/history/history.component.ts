import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
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
  readonly loading = signal(true);
  readonly failed = signal(false);

  constructor() {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.failed.set(false);
    try {
      this.items.set(await this.auth.requestPrivate<SearchHistory[]>('history'));
    } catch {
      this.failed.set(true);
    } finally {
      this.loading.set(false);
    }
  }
}
