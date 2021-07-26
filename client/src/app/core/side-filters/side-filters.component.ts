import {
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  ViewChild,
} from '@angular/core';
import { Observable, Subscription } from 'rxjs';
import { SearchService } from 'src/app/search/search.service';
import { Filters } from 'src/app/shared/models/filters';

@Component({
  selector: 'app-side-filters',
  templateUrl: './side-filters.component.html',
  styleUrls: ['./side-filters.component.scss'],
})
export class SideFiltersComponent implements OnInit, OnDestroy {
  subscriptions: Subscription[] = [];
  @ViewChild('input', { static: true }) inputElement!: ElementRef;

  filters = new Filters();

  order = ['priceAsc', 'priceDesc'];

  constructor(private searchService: SearchService) {}

  ngOnDestroy(): void {
    this.subscriptions.forEach((x) => x.unsubscribe());
  }

  ngOnInit(): void {
    this.subscriptions.push(
      this.searchService.filters$.subscribe(
        (filters) => (this.filters = filters)
      )
    );
  }

  onAddKey($event: any) {
    const value = $event.target.value;
    if (!value) return;
    if (!this.filters.keysToExclude.includes(value)) {
      this.filters.keysToExclude.push(value);
      this.inputElement.nativeElement.value = '';
    }
  }

  removeWordFromList(word: string) {
    this.filters.keysToExclude = this.filters.keysToExclude.filter(
      (x) => x !== word
    );
  }

  onClearKeys() {
    this.filters.keysToExclude = [];
  }
}
