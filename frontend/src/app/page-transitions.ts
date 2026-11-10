import { ViewTransitionsFeatureOptions } from '@angular/router';

/** How long a change of page may wait for its transition to start, in milliseconds. */
const MAX_WAIT = 400;

/** The router waits for a view transition to begin before it shows the next page.
 *  A transition begins on the next painted frame, and a page that is not being
 *  painted never gets one, so the change is applied anyway once it is overdue. */
export function boundViewTransitions(): void {
  const start = document.startViewTransition?.bind(document);
  if (!start) return;
  document.startViewTransition = ((update?: ViewTransitionUpdateCallback | StartViewTransitionOptions) => {
    if (typeof update !== 'function') return start(update);
    let result: Promise<void> | void;
    let applied = false;
    const apply = (): Promise<void> | void => {
      if (!applied) {
        applied = true;
        result = update();
      }
      return result;
    };
    const transition = start(() => {
      clearTimeout(overdue);
      return apply();
    });
    const overdue = setTimeout(() => {
      apply();
      transition.skipTransition();
    }, MAX_WAIT);
    return transition;
  }) as Document['startViewTransition'];
}

let latest: ViewTransition | undefined;

/** Changing page: the old one sinks away and the new one rises in (see styles.scss).
 *  Staying on a page while its query changes, as a search does, names nothing to
 *  animate, so that transition ends at once. */
export const pageTransitions: ViewTransitionsFeatureOptions = {
  skipInitialTransition: true,
  onViewTransitionCreated: ({ transition, from, to }) => {
    if (from.firstChild?.routeConfig === to.firstChild?.routeConfig) return;
    const root = document.documentElement;
    root.dataset['transition'] = 'page';
    latest = transition;
    // A newer transition may have taken over; only the last one clears the marker.
    const clear = (): void => {
      if (latest === transition) delete root.dataset['transition'];
    };
    transition.finished.then(clear, clear);
  },
};
