import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

@Component({
  selector: 'app-scrape-progress',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './scrape-progress.component.html',
  styleUrl: './scrape-progress.component.scss',
})
export class ScrapeProgressComponent {
  readonly loadedPages = input.required<number>();
  readonly totalPages = input.required<number>();
  readonly matches = input.required<number>();
  readonly progress = input.required<number>();
  readonly stop = output<void>();
}
