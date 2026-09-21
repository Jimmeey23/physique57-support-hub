/* Inline SVG icon strings — no external requests, renders in the sandboxed preview. */
import React from 'react';

/* Each icon is a raw SVG string, so JSX can’t print it directly — <I> mounts it as markup. */
export const I = ({ s: raw, className, style, size }) => (
  <span className={className} aria-hidden="true" style={{ display: 'inline-flex', alignItems: 'center',
    justifyContent: 'center', overflow: 'hidden', lineHeight: 0, color: 'inherit', ...style,
    ...(size ? { width: size, height: size } : {}) }} dangerouslySetInnerHTML={{ __html: raw || '' }} />
);

const w = (d, extra = '') =>
  `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.7"
   stroke-linecap="round" stroke-linejoin="round" ${extra}>${d}</svg>`;

export default {
  check: w('<path d="M20 6 9 17l-5-5"/>'),
  warn: w('<path d="M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>'),
  clock: w('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  bolt: w('<path d="M13 2 4.5 13.5H11l-1 8.5 8.5-11.5H12l1-8.5z"/>'),
  x: w('<path d="M18 6 6 18M6 6l12 12"/>'),
  search: w('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'),
  layers: w('<path d="m12 2 9 5-9 5-9-5 9-5zM3 12l9 5 9-5M3 17l9 5 9-5"/>'),
  plus: w('<path d="M12 5v14M5 12h14"/>'),
  minus: w('<path d="M5 12h14"/>'),
  chev: w('<path d="m6 9 6 6 6-6"/>'),
  copy: w('<rect x="9" y="9" width="12" height="12" rx="2.5"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>'),
  down: w('<path d="M12 3v12m0 0 4-4m-4 4-4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/>'),
  moon: w('<path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z"/>'),
  sun: w('<circle cx="12" cy="12" r="4.2"/><path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
  calendar: w('<rect x="3.5" y="5" width="17" height="15.5" rx="2.2"/><path d="M3.5 10h17M8 3.2v3.6M16 3.2v3.6"/><circle cx="8" cy="14.4" r="1.1" fill="currentColor" stroke="none"/>'),
  link: w('<path d="M10.5 13.5a4 4 0 0 0 5.7 0l2.3-2.4a4 4 0 0 0-5.7-5.6l-1.2 1.3"/><path d="M13.5 10.5a4 4 0 0 0-5.7 0l-2.3 2.4a4 4 0 0 0 5.7 5.6l1.2-1.3"/>'),
  card: w('<rect x="2.6" y="5.4" width="18.8" height="13.2" rx="2.4"/><path d="M2.6 10h18.8M6 14.6h4"/>'),
  expand: w('<path d="M9.5 14.5 3.8 20.2M4 9.5V4h5.5M14.5 9.5 20.2 3.8M20 14.5V20h-5.5"/>'),
  plug: w('<path d="M9 3v5M15 3v5M6.5 8h11v3a5.5 5.5 0 0 1-11 0V8zM12 16.5V21"/>'),
  sliders: w('<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>'),
  whistle: w('<path d="M13.5 8.5h6.2a1.3 1.3 0 0 1 1.3 1.3v1.4a6 6 0 1 1-8.6-5.4l2.3-2.3"/><circle cx="10" cy="14" r="2"/>'),
  flame: w('<path d="M12 22c4 0 6.5-2.7 6.5-6 0-4.5-4-6-4.5-11-2.5 2-4 4.5-4 7 0 1.5-1 2-1.7 1.2C7 12 6.5 11 6.5 9.7 5.3 11.2 5.5 13.5 5.5 16c0 3.3 2.5 6 6.5 6z"/>'),
  user: w('<circle cx="12" cy="8" r="3.6"/><path d="M4.5 20a7.5 7.5 0 0 1 15 0"/>'),
  inbox: w('<path d="M3 12h4l2 3h6l2-3h4"/><path d="M5.5 5h13l2.5 7v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5z"/>'),
  arrow: w('<path d="M5 12h14m0 0-5-5m5 5-5 5"/>'),
  back: w('<path d="M19 12H5m0 0 5 5m-5-5 5-5"/>'),
  pin: w('<path d="M12 21s7-6.3 7-11a7 7 0 1 0-14 0c0 4.7 7 11 7 11z"/><circle cx="12" cy="10" r="2.4"/>'),
  up: w('<path d="M12 19V5m0 0-5 5m5-5 5 5"/>'),
  chart: w('<path d="M4 20V9m5 11V4m5 16v-7m5 7V7"/>'),
  filter: w('<path d="M3 5h18l-7 8v6l-4 2v-8L3 5z"/>'),
  wand: w('<path d="M4 20 18 6m-2.5-1.5L17 2m2 4.5L21 8M6 12 4 14m2-8 2 2"/>'),
  clip: w('<path d="M8 4h8a2 2 0 0 1 2 2v11a5 5 0 0 1-10 0V7a3 3 0 0 1 6 0v9"/>'),
  ghost: w('<path d="M12 3a7 7 0 0 0-7 7v11l2.4-1.6L10 21l2-1.6L14 21l2.6-1.6L19 21V10a7 7 0 0 0-7-7zm-2.4 7.6a1 1 0 1 1 0-.1zm4.8.1a1 1 0 1 1 0-.1z"/>'),
  grid: w('<path d="M4 4h6.5v6.5H4zM13.5 4H20v6.5h-6.5zM4 13.5h6.5V20H4zM13.5 13.5H20V20h-6.5z"/>'),
};
