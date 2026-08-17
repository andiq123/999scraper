import { computed, DestroyRef, inject, Injectable, signal } from '@angular/core';

export type CollapsiblePanel = 'smartRefinement' | 'filters' | 'wordCleanup' | 'categories';
export type Appearance = 'system' | 'light' | 'dark';

interface UiPreferences {
  panels: Record<CollapsiblePanel, boolean>;
  appearance: Appearance;
}

const storageKey = '999scraper.ui.v1';
const defaults: UiPreferences = {
  panels: { smartRefinement: false, filters: false, wordCleanup: false, categories: false },
  appearance: 'system',
};

@Injectable({ providedIn: 'root' })
export class UiPreferencesService {
  private readonly preferences = signal(readPreferences());
  private readonly deviceTheme = window.matchMedia('(prefers-color-scheme: dark)');
  private themeTimer: number | undefined;

  readonly appearance = computed(() => this.preferences().appearance);

  constructor() {
    this.applyAppearance(false);
    const followDevice = () => {
      if (this.appearance() === 'system') this.applyAppearance(true);
    };
    this.deviceTheme.addEventListener('change', followDevice);
    inject(DestroyRef).onDestroy(() => {
      this.deviceTheme.removeEventListener('change', followDevice);
      window.clearTimeout(this.themeTimer);
    });
  }

  isOpen(panel: CollapsiblePanel): boolean {
    return this.preferences().panels[panel];
  }

  setOpen(panel: CollapsiblePanel, open: boolean): void {
    if (this.isOpen(panel) === open) return;
    this.save({ ...this.preferences(), panels: { ...this.preferences().panels, [panel]: open } });
  }

  setAppearance(appearance: Appearance): void {
    if (this.appearance() === appearance) return;
    this.save({ ...this.preferences(), appearance });
    this.applyAppearance(true);
  }

  private save(preferences: UiPreferences): void {
    this.preferences.set(preferences);
    try {
      localStorage.setItem(storageKey, JSON.stringify(preferences));
    } catch {
      /* Keep the preference for this visit. */
    }
  }

  private applyAppearance(animate: boolean): void {
    const dark = this.appearance() === 'dark' || (this.appearance() === 'system' && this.deviceTheme.matches);
    const root = document.documentElement;
    if (animate && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      root.classList.add('theme-changing');
      window.clearTimeout(this.themeTimer);
      this.themeTimer = window.setTimeout(() => root.classList.remove('theme-changing'), 240);
    }
    root.dataset['colorMode'] = dark ? 'dark' : 'light';
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#24252b' : '#f5f5f7');
  }
}

function readPreferences(): UiPreferences {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(storageKey) ?? 'null');
    if (!stored || typeof stored !== 'object' || !('panels' in stored)) return defaults;
    const panels = (stored as { panels?: unknown }).panels;
    if (!panels || typeof panels !== 'object') return defaults;
    const restored = {
      panels: {
        smartRefinement: booleanValue(panels, 'smartRefinement'),
        filters: booleanValue(panels, 'filters'),
        wordCleanup: booleanValue(panels, 'wordCleanup'),
        categories: booleanValue(panels, 'categories'),
      },
      appearance: appearanceValue(stored),
    };
    // A persisted desktop accordion must never cover the mobile page on launch.
    if (typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches) {
      restored.panels.smartRefinement = false;
      restored.panels.filters = false;
    }
    return restored;
  } catch {
    return defaults;
  }
}

function appearanceValue(value: object): Appearance {
  const appearance = (value as { appearance?: unknown }).appearance;
  return appearance === 'light' || appearance === 'dark' ? appearance : 'system';
}

function booleanValue(value: object, key: CollapsiblePanel): boolean {
  const candidate = (value as Record<string, unknown>)[key];
  return typeof candidate === 'boolean' ? candidate : defaults.panels[key];
}
