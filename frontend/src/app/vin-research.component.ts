import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { ToastService } from './toast.service';
import { VINResearchService } from './vin-research.service';

@Component({
  selector: 'app-vin-research',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './vin-research.component.html',
  styleUrl: './vin-research.component.scss',
})
export class VINResearchComponent {
  readonly research = inject(VINResearchService);
  private readonly toast = inject(ToastService);
  private readonly dialog = viewChild<ElementRef<HTMLDialogElement>>('dialog');
  private readonly vinInput = viewChild<ElementRef<HTMLInputElement>>('vinInput');
  readonly copied = signal(false);
  readonly vehicleTitle = computed(() => {
    const vehicle = this.research.vehicle();
    if (!vehicle) return '';
    return [vehicle.modelYear, vehicle.make, vehicle.model, vehicle.trim].filter(Boolean).join(' ');
  });
  readonly vehicleFacts = computed(() => {
    const vehicle = this.research.vehicle();
    if (!vehicle) return [];
    const engine = [
      vehicle.displacementL && `${vehicle.displacementL} L`,
      vehicle.engineCylinders && `${vehicle.engineCylinders} cyl.`,
    ]
      .filter(Boolean)
      .join(' · ');
    return [
      { label: 'Body', value: vehicle.bodyClass || vehicle.vehicleType },
      { label: 'Drive', value: vehicle.driveType },
      { label: 'Powertrain', value: vehicle.electrificationLevel || vehicle.fuelTypePrimary },
      { label: 'Engine', value: engine },
      { label: 'Transmission', value: vehicle.transmissionStyle },
      { label: 'Built in', value: vehicle.plantCountry },
    ].filter((item): item is { label: string; value: string } => Boolean(item.value));
  });
  readonly decodeWarning = computed(() => {
    const vehicle = this.research.vehicle();
    return vehicle?.errorCode && vehicle.errorCode !== '0'
      ? vehicle.errorText || 'NHTSA returned a partial decode.'
      : '';
  });

  constructor() {
    effect(() => {
      const dialog = this.dialog()?.nativeElement;
      if (!dialog) return;
      if (this.research.visible() && !dialog.open) {
        dialog.showModal();
        queueMicrotask(() => this.vinInput()?.nativeElement.focus());
      } else if (!this.research.visible() && dialog.open) {
        dialog.close();
      }
    });
  }

  submit(event: Event): void {
    event.preventDefault();
    void this.research.search(true);
  }

  close(): void {
    this.research.close();
  }

  cancel(event: Event): void {
    event.preventDefault();
    this.close();
  }

  closed(): void {
    if (this.research.visible()) this.research.close();
  }

  async copyVIN(): Promise<void> {
    const vin = this.research.vin() || this.research.input();
    if (!vin || this.copied()) return;
    try {
      await navigator.clipboard.writeText(vin);
      this.copied.set(true);
      this.toast.success('VIN copied to clipboard.');
      window.setTimeout(() => this.copied.set(false), 1_800);
    } catch {
      this.toast.error('Could not copy VIN.');
    }
  }
}
