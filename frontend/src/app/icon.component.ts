import { ChangeDetectionStrategy, Component, input } from '@angular/core';

const paths = {
  search: 'M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z',
  heart: 'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.9-8.6a5.5 5.5 0 0 0-.1-7.8Z',
  user: 'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM4 21v-2a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v2',
  sliders: 'M4 7h5m6 0h5M9 7a3 3 0 1 0 6 0 3 3 0 0 0-6 0ZM4 17h9m6 0h1m-7 0a3 3 0 1 0 6 0 3 3 0 0 0-6 0Z',
  sparkles: 'm12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3ZM20 2v4m-2-2h4',
  car: 'm5 10 2-6h10l2 6M4 10h16v8H4zM6 18v2m12-2v2M7 14h1m8 0h1',
  phone: 'M8 2h8a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Zm2 3h4m-3 14h2',
  laptop: 'M6 4h12a2 2 0 0 1 2 2v10H4V6a2 2 0 0 1 2-2ZM4 16l-2 4h20l-2-4m-10 2h4',
  home: 'm3 10 9-7 9 7M5 9v12h14V9M9 21v-8h6v8',
  history: 'M3 3v6h6M3 9a9 9 0 1 1 0 6m9-9v6l4 2',
  bell: 'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4',
  code: 'm8 8-4 4 4 4m8-8 4 4-4 4m-3-12-2 16',
  chevronRight: 'm9 5 7 7-7 7',
  refresh: 'M20 4v6h-6m6 0a8 8 0 1 0-1 8',
  close: 'm6 6 12 12M18 6 6 18',
  check: 'm5 12 4 4L19 6',
  shield: 'm12 2 8 3v6c0 5-4 8-8 11-4-3-8-6-8-11V5l8-3Zm-4 9 3 3 5-6',
  image: 'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm-2 14 6-6 4 4 3-3 5 5M8 7h.01',
  warning:
    'M12 8v5m0 4h.01M10.3 4.2 2.7 17.4A1.7 1.7 0 0 0 4.2 20h15.6a1.7 1.7 0 0 0 1.5-2.6L13.7 4.2a2 2 0 0 0-3.4 0Z',
} as const;

@Component({
  selector: 'app-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path [attr.d]="paths[name()]" /></svg>',
  styles:
    ':host{display:inline-flex;flex:none;width:1.125rem;height:1.125rem}svg{width:100%;height:100%;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}',
})
export class IconComponent {
  readonly name = input.required<keyof typeof paths>();
  readonly paths = paths;
}
