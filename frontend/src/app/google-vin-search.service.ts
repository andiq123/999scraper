import { Injectable } from '@angular/core';
import { environment } from '../environments/environment';
import type { VINEvidence, VINEvidenceFact } from './vin-research.service';

interface SearchResult {
  contentNoFormatting?: string;
  thumbnailImage?: { url?: string };
  titleNoFormatting?: string;
  url?: string;
}

interface SearchElement {
  execute(query: string): void;
}

interface SearchElementAPI {
  getElement(name: string): SearchElement | null;
  render(config: { div: string; tag: string; gname: string; attributes: Record<string, boolean> }): void;
}

interface SearchWindow extends Window {
  __gcse?: {
    parsetags: 'explicit';
    initializationCallback: () => void;
    searchCallbacks: {
      web: { rendered: (name: string, query: string, promotions: Element[], results: Element[]) => void };
    };
  };
  google?: { search?: { cse?: { element?: SearchElementAPI } } };
}

interface PendingSearch {
  vin: string;
  resolve: (items: VINEvidence[]) => void;
  reject: (error: Error) => void;
  timer: number;
  emptyTimer?: number;
  abort: () => void;
  signal: AbortSignal;
}

const elementName = 'vin-evidence-search';
const hostID = 'vin-evidence-search-host';

interface TrustedSource {
  name: string;
  matches(host: string, pathname: string, vin: string): boolean;
}

const trustedSources: readonly TrustedSource[] = [
  source('Bid.Cars', 'bid.cars', (path, vin) => path.includes('/lot/') && hasExactVIN(path, vin)),
  source('Copart', 'copart.com', (path) => path.includes('/lot/')),
  source('IAA', 'iaai.com', (path) => path.includes('/vehicledetail/')),
  source('Stat.vin', 'stat.vin', hasExactVIN),
  source('OpenDataCar', 'opendatacar.com', hasExactVIN),
  source('BidHistory', 'bidhistory.org', hasExactVIN),
  source('BidMotors', 'bidmotors.bg', hasExactVIN),
  source('BidFax', 'bidfax.info', hasExactVIN),
  source('Motors.md', 'motors.md', (path) => path.includes('/auto/')),
];

@Injectable({ providedIn: 'root' })
export class GoogleVINSearchService {
  private loadPromise?: Promise<void>;
  private pending?: PendingSearch;

  async search(vin: string, signal: AbortSignal): Promise<VINEvidence[]> {
    if (!environment.vinSearchEngineId) throw new Error('VIN search engine is not configured.');
    await this.load();
    if (signal.aborted) throw abortError();

    const element = searchWindow().google?.search?.cse?.element?.getElement(elementName);
    if (!element) throw new Error('VIN search is temporarily unavailable.');

    this.cancelPending(abortError());
    return new Promise<VINEvidence[]>((resolve, reject) => {
      const timer = window.setTimeout(() => this.cancelPending(new Error('VIN evidence search timed out.')), 12_000);
      const abort = () => this.cancelPending(abortError());
      this.pending = { vin, resolve, reject, timer, abort, signal };
      signal.addEventListener('abort', abort, { once: true });
      element.execute(vin);
    });
  }

  private load(): Promise<void> {
    if (this.loadPromise) return this.loadPromise;
    this.loadPromise = new Promise<void>((resolve, reject) => {
      const target = searchWindow();
      target.__gcse = {
        parsetags: 'explicit',
        initializationCallback: () => {
          const api = target.google?.search?.cse?.element;
          if (!api) {
            reject(new Error('VIN search failed to initialize.'));
            return;
          }
          let host = document.getElementById(hostID);
          if (!host) {
            host = document.createElement('div');
            host.id = hostID;
            host.setAttribute('aria-hidden', 'true');
            host.setAttribute('inert', '');
            Object.assign(host.style, {
              position: 'fixed',
              width: '1px',
              height: '1px',
              overflow: 'hidden',
              clipPath: 'inset(50%)',
            });
            document.body.append(host);
          }
          api.render({
            div: hostID,
            tag: 'searchresults-only',
            gname: elementName,
            attributes: { autoSearchOnLoad: false },
          });
          resolve();
        },
        searchCallbacks: {
          web: {
            rendered: (_name, query, _promotions, results) => {
              const pending = this.pending;
              if (!pending || !query.toUpperCase().includes(pending.vin)) return;
              if (!results.length) {
                if (pending.emptyTimer) window.clearTimeout(pending.emptyTimer);
                pending.emptyTimer = window.setTimeout(() => this.finishPending(pending, []), 600);
                return;
              }
              this.finishPending(pending, exactEvidence(pending.vin, results.map(renderedResult)));
            },
          },
        },
      };

      const script = document.createElement('script');
      script.async = true;
      script.src = `https://cse.google.com/cse.js?cx=${encodeURIComponent(environment.vinSearchEngineId)}`;
      script.onerror = () => reject(new Error('VIN search could not be loaded.'));
      document.head.append(script);
    });
    return this.loadPromise;
  }

  private cancelPending(error: Error): void {
    const pending = this.pending;
    if (!pending) return;
    this.pending = undefined;
    window.clearTimeout(pending.timer);
    if (pending.emptyTimer) window.clearTimeout(pending.emptyTimer);
    pending.signal.removeEventListener('abort', pending.abort);
    pending.reject(error);
  }

  private finishPending(pending: PendingSearch, items: VINEvidence[]): void {
    if (this.pending !== pending) return;
    this.pending = undefined;
    window.clearTimeout(pending.timer);
    if (pending.emptyTimer) window.clearTimeout(pending.emptyTimer);
    pending.signal.removeEventListener('abort', pending.abort);
    pending.resolve(items);
  }
}

function renderedResult(element: Element): SearchResult {
  const anchor =
    element.querySelector<HTMLAnchorElement>('a.gs-title') ?? element.querySelector<HTMLAnchorElement>('a[href]');
  const image = element.querySelector<HTMLImageElement>('img[src]');
  return {
    titleNoFormatting: anchor?.textContent?.trim(),
    contentNoFormatting: element.querySelector<HTMLElement>('.gs-snippet')?.textContent?.trim(),
    url: anchor?.href,
    thumbnailImage: image?.src ? { url: image.src } : undefined,
  };
}

function exactEvidence(vin: string, results: SearchResult[]): VINEvidence[] {
  const seen = new Set<string>();
  const items: VINEvidence[] = [];
  for (const result of results) {
    const item = toEvidence(vin, result);
    if (!item || seen.has(item.url)) continue;
    seen.add(item.url);
    items.push(item);
  }
  return items;
}

function toEvidence(vin: string, result: SearchResult): VINEvidence | null {
  if (!result.url) return null;
  let url: URL;
  try {
    url = new URL(result.url);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.username || url.password) return null;

  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  const pathname = url.pathname.toLowerCase();
  const source = trustedSources.find((candidate) => candidate.matches(host, pathname, vin))?.name;
  if (!source) return null;

  const title = cleanText(result.titleNoFormatting || `${source} VIN record`, 180);
  const summary = cleanText(result.contentNoFormatting || '', 360);
  if (!`${title} ${summary} ${url.pathname}`.toUpperCase().includes(vin)) return null;
  url.hash = '';

  const facts: VINEvidenceFact[] = [];
  if (source === 'Bid.Cars') {
    const parts = url.pathname.split('/').filter(Boolean);
    const lotIndex = parts.indexOf('lot');
    if (lotIndex >= 0 && parts[lotIndex + 1]) facts.push({ label: 'Lot', value: parts[lotIndex + 1] });
  }
  const imageUrl = safeImage(result.thumbnailImage?.url);
  const cleanURL = url.toString();
  return {
    id: stableID(cleanURL),
    source,
    title,
    summary: summary || undefined,
    url: cleanURL,
    imageUrl,
    facts: facts.length ? facts : undefined,
  };
}

function source(name: string, domain: string, pathMatches: (pathname: string, vin: string) => boolean): TrustedSource {
  return {
    name,
    matches: (host, pathname, vin) =>
      (host === domain || host.endsWith(`.${domain}`)) && pathMatches(pathname, vin.toLowerCase()),
  };
}

function hasExactVIN(pathname: string, vin: string): boolean {
  return pathname.includes(vin);
}

function safeImage(value?: string): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function cleanText(value: string, limit: number): string {
  const cleaned = value.replace(/\s+/g, ' ').trim();
  return cleaned.length > limit ? `${cleaned.slice(0, limit - 1).trim()}…` : cleaned;
}

function stableID(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `vin-${(hash >>> 0).toString(16)}`;
}

function searchWindow(): SearchWindow {
  return window as SearchWindow;
}

function abortError(): Error {
  return new DOMException('VIN search was canceled.', 'AbortError');
}
