import { Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { Subscription } from 'rxjs';
import { SearchService } from 'src/app/search/search.service';
import { Filters } from 'src/app/shared/models/filters';

@Component({
  selector: 'app-full-screen',
  templateUrl: './full-screen.component.html',
  styleUrls: ['./full-screen.component.scss'],
})
export class FullScreenComponent implements OnInit {
  subscriptions: Subscription[] = [];
  @ViewChild('input', { static: true }) inputElement!: ElementRef;
  show: boolean = false;
  filters = new Filters();
  order = ['priceAsc', 'priceDesc'];

  constructor(private searchService: SearchService) {}

  ngOnInit(): void {
    this.subscriptions.push(
      this.searchService.filters$.subscribe(
        (filters) => (this.filters = filters)
      )
    );
  }

  toggleShow() {
    this.show = !this.show;
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

  ngOnDestroy(): void {
    this.subscriptions.forEach((x) => x.unsubscribe());
  }
}
