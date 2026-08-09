import { Injectable, signal } from '@angular/core';

export type CollapsiblePanel = 'smartRefinement' | 'filters' | 'wordCleanup' | 'categories';

interface UiPreferences {
  panels: Record<CollapsiblePanel, boolean>;
}

const storageKey = '999scraper.ui.v1';
const defaults: UiPreferences = {
  panels: { smartRefinement: false, filters: false, wordCleanup: false, categories: false },
};

@Injectable({ providedIn: 'root' })
export class UiPreferencesService {
  private readonly preferences = signal(readPreferences());

  isOpen(panel: CollapsiblePanel): boolean {
    return this.preferences().panels[panel];
  }

  setOpen(panel: CollapsiblePanel, open: boolean): void {
    if (this.isOpen(panel) === open) return;
    const next = { panels: { ...this.preferences().panels, [panel]: open } };
    this.preferences.set(next);
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      /* Keep the preference for this visit. */
    }
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
    };
    // A persisted desktop accordion must never cover the mobile page on launch.
    if (typeof window !== 'undefined' && window.matchMedia('(max-width: 699px)').matches) {
      restored.panels.smartRefinement = false;
      restored.panels.filters = false;
    }
    return restored;
  } catch {
    return defaults;
  }
}

function booleanValue(value: object, key: CollapsiblePanel): boolean {
  const candidate = (value as Record<string, unknown>)[key];
  return typeof candidate === 'boolean' ? candidate : defaults.panels[key];
}
