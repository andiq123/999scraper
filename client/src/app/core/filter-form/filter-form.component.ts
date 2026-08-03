import { Component, DestroyRef, ElementRef, ViewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { SearchService } from '../../search/search.service';
import { Filters } from '../../shared/models/filters';

@Component({
  standalone: false,
  selector: 'app-filter-form',
  templateUrl: './filter-form.component.html',
  styleUrls: ['./filter-form.component.scss'],
})
export class FilterFormComponent {
  @ViewChild('input', { static: true }) inputElement!: ElementRef<HTMLInputElement>;
  filters = new Filters();
  readonly order = ['priceAsc', 'priceDesc'];

  constructor(searchService: SearchService, destroyRef: DestroyRef) {
    searchService.filters$
      .pipe(takeUntilDestroyed(destroyRef))
      .subscribe((filters) => (this.filters = filters));
  }

  addExcludedWord(event: Event): void {
    const value = (event.target as HTMLInputElement).value.trim();
    if (value && !this.filters.keysToExclude.includes(value)) {
      this.filters.keysToExclude.push(value);
      this.inputElement.nativeElement.value = '';
    }
  }

  removeExcludedWord(word: string): void {
    this.filters.keysToExclude = this.filters.keysToExclude.filter((item) => item !== word);
  }

  clearExcludedWords(): void {
    this.filters.keysToExclude = [];
  }
}
