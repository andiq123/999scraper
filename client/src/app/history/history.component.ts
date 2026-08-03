import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { HistoryService } from './history.service';

@Component({
  standalone: false,
  selector: 'app-history',
  templateUrl: './history.component.html',
  styleUrls: ['./history.component.scss'],
})
export class HistoryComponent {
  readonly items = toSignal(inject(HistoryService).get(), { initialValue: [] });
}
