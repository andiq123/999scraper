import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

export interface RangePreset {
  label: string;
  from: number | null;
  to: number | null;
}

@Component({
  selector: 'app-range-filter',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './range-filter.component.html',
  styleUrl: './range-filter.component.scss',
})
export class RangeFilterComponent {
  readonly label = input.required<string>();
  readonly unit = input('');
  readonly min = input.required<number>();
  readonly max = input.required<number>();
  readonly step = input(1);
  readonly from = input<number | null>(null);
  readonly to = input<number | null>(null);
  readonly presets = input<readonly RangePreset[]>([]);
  readonly fromChange = output<number | null>();
  readonly toChange = output<number | null>();

  readonly fromPercent = computed(() => percent(this.from() ?? this.min(), this.min(), this.max()));
  readonly toPercent = computed(() => percent(this.to() ?? this.max(), this.min(), this.max()));
  readonly summary = computed(() => formatRange(this.from(), this.to(), this.unit()));

  setSlider(bound: 'from' | 'to', event: Event): void {
    const value = (event.target as HTMLInputElement).valueAsNumber;
    if (bound === 'from') {
      const next = Math.min(value, this.to() ?? this.max());
      this.fromChange.emit(next <= this.min() ? null : next);
      return;
    }
    const next = Math.max(value, this.from() ?? this.min());
    this.toChange.emit(next >= this.max() ? null : next);
  }

  setInput(bound: 'from' | 'to', event: Event): void {
    const value = (event.target as HTMLInputElement).valueAsNumber;
    (bound === 'from' ? this.fromChange : this.toChange).emit(Number.isFinite(value) ? value : null);
  }

  apply(preset: RangePreset): void {
    this.fromChange.emit(preset.from);
    this.toChange.emit(preset.to);
  }

  selected(preset: RangePreset): boolean {
    return this.from() === preset.from && this.to() === preset.to;
  }
}

function percent(value: number, min: number, max: number): number {
  return max > min ? Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100)) : 0;
}

function formatRange(from: number | null, to: number | null, unit: string): string {
  const suffix = unit ? ` ${unit}` : '';
  if (from === null && to === null) return 'Any';
  if (from === null) return `Up to ${format(to!)}${suffix}`;
  if (to === null) return `${format(from)}${suffix}+`;
  return `${format(from)}–${format(to)}${suffix}`;
}

function format(value: number): string {
  return new Intl.NumberFormat('ro-MD', { maximumFractionDigits: 1 }).format(value);
}
