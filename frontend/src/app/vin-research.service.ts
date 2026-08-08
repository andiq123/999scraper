import { Injectable, computed, signal } from '@angular/core';
import { environment } from '../environments/environment';

export interface VINEvidenceFact {
  label: string;
  value: string;
}

export interface VINEvidence {
  id: string;
  kind: 'auction';
  source: string;
  title: string;
  summary?: string;
  url: string;
  imageUrl?: string;
  facts?: VINEvidenceFact[];
}

export interface VINVehicle {
  make?: string;
  model?: string;
  modelYear?: string;
  manufacturer?: string;
  vehicleType?: string;
  bodyClass?: string;
  series?: string;
  trim?: string;
  driveType?: string;
  fuelTypePrimary?: string;
  electrificationLevel?: string;
  engineCylinders?: string;
  displacementL?: string;
  transmissionStyle?: string;
  plantCountry?: string;
  errorCode?: string;
  errorText?: string;
}

interface VINResearchEvent {
  type: 'start' | 'evidence' | 'vehicle' | 'warning' | 'done';
  vin?: string;
  message?: string;
  evidence?: VINEvidence;
  vehicle?: VINVehicle;
}

interface CachedResearch {
  evidence: VINEvidence[];
  vehicle: VINVehicle | null;
  warning: string;
  message: string;
}

@Injectable({ providedIn: 'root' })
export class VINResearchService {
  private readonly cache = new Map<string, CachedResearch>();
  private controller?: AbortController;

  readonly visible = signal(false);
  readonly input = signal('');
  readonly vin = signal('');
  readonly status = signal<'idle' | 'loading' | 'done' | 'error'>('idle');
  readonly message = signal('');
  readonly warning = signal('');
  readonly evidence = signal<VINEvidence[]>([]);
  readonly vehicle = signal<VINVehicle | null>(null);
  readonly loading = computed(() => this.status() === 'loading');
  readonly inputError = computed(() => {
    const value = this.input();
    if (!value) return '';
    return validVIN(value) ? '' : 'Use a complete 17-character VIN without I, O or Q.';
  });
  readonly canSearch = computed(() => validVIN(this.input()) && !this.loading());

  open(value = ''): void {
    this.visible.set(true);
    if (!value) return;
    const vin = cleanVIN(value);
    this.input.set(vin);
    if (validVIN(vin)) void this.search(false);
  }

  close(): void {
    this.controller?.abort();
    this.controller = undefined;
    this.visible.set(false);
  }

  setInput(value: string): void {
    const input = cleanVIN(value);
    this.input.set(input);
    if (input === this.vin()) return;
    this.vin.set('');
    this.status.set('idle');
    this.message.set('');
    this.warning.set('');
    this.evidence.set([]);
    this.vehicle.set(null);
  }

  async search(force = true): Promise<void> {
    const vin = cleanVIN(this.input());
    this.input.set(vin);
    if (!validVIN(vin)) {
      this.status.set('error');
      this.message.set('Enter a valid 17-character VIN.');
      return;
    }
    if (!force) {
      const cached = this.cache.get(vin);
      if (cached) {
        this.applyCached(vin, cached);
        return;
      }
    }

    this.controller?.abort();
    const controller = new AbortController();
    this.controller = controller;
    this.vin.set(vin);
    this.status.set('loading');
    this.message.set('Finding exact VIN records…');
    this.warning.set('');
    this.evidence.set([]);
    this.vehicle.set(null);

    try {
      const response = await fetch(`${environment.apiUrl}vin/${encodeURIComponent(vin)}/stream`, {
        headers: { Accept: 'text/event-stream' },
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(await responseError(response));
      if (!response.body || !response.headers.get('content-type')?.toLowerCase().startsWith('text/event-stream')) {
        throw new Error('VIN research streaming is unavailable.');
      }
      await this.readStream(response.body, controller.signal);
      if (controller.signal.aborted) return;
      this.status.set('done');
      if (!this.message()) this.message.set('VIN research complete');
      if (this.cache.size >= 50) this.cache.delete(this.cache.keys().next().value!);
      this.cache.set(vin, { evidence: this.evidence(), vehicle: this.vehicle(), warning: this.warning(), message: this.message() });
    } catch (error) {
      if (controller.signal.aborted) return;
      this.status.set('error');
      this.message.set(error instanceof Error ? error.message : 'VIN research failed.');
    } finally {
      if (this.controller === controller) this.controller = undefined;
    }
  }

  private async readStream(stream: ReadableStream<Uint8Array>, signal: AbortSignal): Promise<void> {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let pending = '';
    try {
      while (!signal.aborted) {
        const { value, done } = await reader.read();
        pending = (pending + decoder.decode(value, { stream: !done })).replace(/\r\n/g, '\n');
        const frames = pending.split('\n\n');
        pending = frames.pop() ?? '';
        for (const frame of frames) this.receive(frame);
        if (done) break;
      }
      if (pending.trim()) this.receive(pending);
    } finally {
      reader.releaseLock();
    }
  }

  private receive(frame: string): void {
    const data = frame.split('\n').filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trimStart()).join('\n');
    if (!data) return;
    const event = JSON.parse(data) as VINResearchEvent;
    if (event.type === 'start') this.message.set(event.message || 'Researching VIN…');
    if (event.type === 'evidence' && event.evidence) {
      this.evidence.update((items) => items.some((item) => item.id === event.evidence!.id) ? items : [...items, event.evidence!]);
    }
    if (event.type === 'vehicle' && event.vehicle) this.vehicle.set(event.vehicle);
    if (event.type === 'warning') this.warning.set(event.message || 'Some vehicle details are unavailable.');
    if (event.type === 'done') this.message.set(event.message || 'Research ready');
  }

  private applyCached(vin: string, cached: CachedResearch): void {
    this.vin.set(vin);
    this.evidence.set(cached.evidence);
    this.vehicle.set(cached.vehicle);
    this.warning.set(cached.warning);
    this.status.set('done');
    this.message.set(cached.message);
  }
}

function cleanVIN(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 17);
}

function validVIN(value: string): boolean {
  return /^[A-HJ-NPR-Z0-9]{17}$/.test(value);
}

async function responseError(response: Response): Promise<string> {
  try {
    return (await response.json()).error || `VIN research failed (${response.status}).`;
  } catch {
    return `VIN research failed (${response.status}).`;
  }
}
