/* ───────────────────────────────────────────────────────────────────────────────
   One visual identity per ticket type.

   14 categories, 296 sub-categories: a board where every card is the same blue tells the
   desk nothing at a glance. Each category owns a hue family and each sub-category rotates
   inside that family, so siblings read as related but distinguishable, and every ticket type
   gets an emblem drawn from the words in its own name. The mapping is a pure function of the
   taxonomy, so the same sub-category always looks the same — in the grid, the queue, the
   sheet, the analytics bars and the export — with no theme table to maintain and no image
   files to ship.
   ─────────────────────────────────────────────────────────────────────────────── */

/* Hue families chosen for what the desk is actually dealing with, not cycled evenly: facilities
   run warm, systems run cool, money runs amber, risk runs red, people run pink/violet. */
export const FAMILIES = {
  'Safety and Security': { h: 356, s: 70 },
  'Repair and Maintenance': { h: 24, s: 76 },
  'Theft and Lost Items': { h: 44, s: 66 },
  'Pricing and Memberships': { h: 66, s: 72 },
  'Miscellaneous': { h: 96, s: 42 },
  'Internal Operations & Admin': { h: 120, s: 44 },
  'Trainer Feedback': { h: 156, s: 52 },
  'Studio Amenities and Facilities': { h: 186, s: 58 },
  'Scheduling': { h: 214, s: 62 },
  'Customer Service and Communication': { h: 232, s: 58 },
  'Operating Systems': { h: 250, s: 58 },
  'Tech Issues': { h: 268, s: 62 },
  'Class Experience': { h: 292, s: 68 },
  'Brand Feedback': { h: 320, s: 52 },
};
/* 14 hues ~20-36° apart, so the ±6° per-sub tilt below can never push two families onto each
   other. The tilt keeps siblings distinguishable without breaking the family read. */
export const FALLBACK_FAMILY = { h: 206, s: 55 };

const hash = s => { let x = 2166136261; for (let i = 0; i < String(s).length; i++) { x ^= String(s).charCodeAt(i); x = Math.imul(x, 16777619); } return Math.abs(x >>> 0); };
const wrap = h => ((Math.round(h) % 360) + 360) % 360;

/** Stroke-drawn 24×24 marks. Deliberately flat, one path each, so they inherit colour and
    sit next to the app's other icons without fighting them. */
export const GLYPHS = {
  snow: 'M12 3v18M4.2 7.5l15.6 9M19.8 7.5l-15.6 9M12 7l2.4-2.1M12 7 9.6 4.9M12 17l2.4 2.1M12 17l-2.4 2.1',
  thermo: 'M14 14.8V5.5a2 2 0 1 0-4 0v9.3a4 4 0 1 0 4 0ZM12 9.5v6.2',
  wrench: 'M15.6 4.4a4.6 4.6 0 0 0-5.9 5.6L4 15.7 8.3 20l5.7-5.7a4.6 4.6 0 0 0 5.6-5.9l-2.9 2.9-2.6-.7-.7-2.6Z',
  drop: 'M12 3.6c3.4 4 5.6 6.5 5.6 9.4A5.6 5.6 0 0 1 6.4 13c0-2.9 2.2-5.4 5.6-9.4Z',
  bolt: 'M13.4 3 5.8 13.4h4.6L9.6 21l8.4-11h-5.2Z',
  wifi: 'M4.6 9.4a11 11 0 0 1 14.8 0M7.4 12.6a7 7 0 0 1 9.2 0M10.2 15.8a3 3 0 0 1 3.6 0M12 19h.01',
  monitor: 'M3.6 5.4h16.8v10.2H3.6ZM9 20h6M12 15.6V20',
  phone: 'M7.8 2.8h8.4a1.4 1.4 0 0 1 1.4 1.4v15.6a1.4 1.4 0 0 1-1.4 1.4H7.8a1.4 1.4 0 0 1-1.4-1.4V4.2a1.4 1.4 0 0 1 1.4-1.4ZM10.6 18.6h2.8',
  card: 'M3.4 6.6h17.2a1.4 1.4 0 0 1 1.4 1.4v8a1.4 1.4 0 0 1-1.4 1.4H3.4A1.4 1.4 0 0 1 2 16v-8a1.4 1.4 0 0 1 1.4-1.4ZM2 10.4h20',
  receipt: 'M6 2.8h12v18.4l-2-1.4-2 1.4-2-1.4-2 1.4-2-1.4-2 1.4ZM9 8h6M9 12h6',
  calendar: 'M4.4 6.4h15.2v13.2H4.4ZM4.4 10.4h15.2M8.6 3.6v4M15.4 3.6v4M8.6 14h2.2M13.6 14h1.8',
  clock: 'M12 3.6a8.4 8.4 0 1 0 0 16.8 8.4 8.4 0 0 0 0-16.8ZM12 7.4V12l3.2 2',
  users: 'M9 11.6a3.4 3.4 0 1 0 0-6.8 3.4 3.4 0 0 0 0 6.8ZM2.8 19.6a6.4 6.4 0 0 1 12.4 0M16 5.2a3.2 3.2 0 0 1 0 6.2M17.6 13.6a6.2 6.2 0 0 1 3.6 5.6',
  person: 'M12 11.8a3.9 3.9 0 1 0 0-7.8 3.9 3.9 0 0 0 0 7.8ZM5.2 20.6a6.8 6.8 0 0 1 13.6 0',
  whistle: 'M14.4 4.6 21 8.4l-1.8 3.2-6.6-3.8ZM10.6 8.6a5.4 5.4 0 1 0 0 10.8 5.4 5.4 0 0 0 0-10.8ZM10.6 12.4v1.6h1.8',
  dumbbell: 'M4 9v6M7 7.4v9.2M17 7.4v9.2M20 9v6M7 12h10',
  bike: 'M6.2 17.6a3.4 3.4 0 1 0 0-6.8 3.4 3.4 0 0 0 0 6.8ZM17.8 17.6a3.4 3.4 0 1 0 0-6.8 3.4 3.4 0 0 0 0 6.8ZM9.6 10.8 12.6 5h3.4M12.6 5l5.2 5.8-8-.2',
  chain: 'M12 18.6a6.6 6.6 0 1 0 0-13.2 6.6 6.6 0 0 0 0 13.2ZM12 14.4a2.4 2.4 0 1 0 0-4.8 2.4 2.4 0 0 0 0 4.8ZM12 5.4V2.4M12 21.6v-3M18.6 12h3M2.4 12h3',
  locker: 'M5.4 3.6h13.2v16.8H5.4ZM12 3.6v16.8M9 11.4h1.4M14.4 11.4h1.4',
  shield: 'M12 3 5.4 5.4v5.4c0 4.4 2.8 7.6 6.6 9.6 3.8-2 6.6-5.2 6.6-9.6V5.4ZM9.2 12l2 2 3.6-3.8',
  alert: 'M12 4.2 2.6 20h18.8ZM12 9.6v4.6M12 16.8h.01',
  eye: 'M2.6 12S6 6.4 12 6.4 21.4 12 21.4 12 18 17.6 12 17.6 2.6 12 2.6 12ZM12 14.8a2.8 2.8 0 1 0 0-5.6 2.8 2.8 0 0 0 0 5.6Z',
  tag: 'M3.6 11.4V4.4a.8.8 0 0 1 .8-.8h7l9 9-7.8 7.8ZM7.6 7.6h.01',
  chat: 'M4.4 5h15.2v11.2H9.6L5.6 19.6v-3.4H4.4ZM8 9.6h8M8 12.6h5',
  spark: 'M12 3.4l1.8 5 5 1.8-5 1.8-1.8 5-1.8-5-5-1.8 5-1.8ZM18.6 15.6l.9 2.3 2.3.9-2.3.9-.9 2.3-.9-2.3-2.3-.9 2.3-.9Z',
  broom: 'M14.6 4.4l4.8 4.8M12 7l5 5-6.6 6.6a2.4 2.4 0 0 1-3.4 0l-1.6-1.6a2.4 2.4 0 0 1 0-3.4ZM6.4 14.6l2.4 2.4M4.6 17.4l2.4 2.4',
  box: 'M3.6 8.4 12 4l8.4 4.4v7.2L12 20l-8.4-4.4ZM3.6 8.4 12 12.6l8.4-4.2M12 12.6V20',
  doc: 'M6 3h8l4 4v14H6ZM13.6 3v4.4H18M9 12h6M9 15.4h6',
  key: 'M14.6 4.4a5 5 0 1 0-4.2 8.9L9.4 14.4H7v2.4H4.6v2.8h3.2l8.4-8.4a5 5 0 0 0-1.6-6.8ZM16 8h.01',
  bell: 'M12 4a5.2 5.2 0 0 0-5.2 5.2c0 4.8-2 6-2 6h14.4s-2-1.2-2-6A5.2 5.2 0 0 0 12 4ZM10.2 19a2 2 0 0 0 3.6 0',
  leaf: 'M20 4C10 4 4.6 8.4 4.6 15.4A4.6 4.6 0 0 0 9.2 20C16.2 20 20 14 20 4ZM6.8 19.4C9 14.6 12.6 11 17 9',
  fan: 'M12 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM12 12a3 3 0 1 1 6 0 3 3 0 0 1-6 0ZM12 12a3 3 0 1 0-6 0 3 3 0 0 0 6 0ZM12 12a3 3 0 1 1 0 6 3 3 0 0 1 0-6Z',
};

/** Emblem picked from the words of the sub-category (then the category) — the desk should be able
    to recognise a ticket type by its mark alone. */
const RULES = [
  [/\bair\b|air ?condition|ac\b|\bhvac\b|cool|ventilat|\bheat(ing)?\b|temperature|chill|thermostat/i, 'snow'],
  [/leak|water|plumb|pipe|drain|tap|shower|washroom/i, 'drop'],
  [/power|electric|outage|breaker|lighting|generator/i, 'bolt'],
  [/wifi|network|router|internet|connection|signal/i, 'wifi'],
  [/ipad|tablet|device|screen|kiosk|monitor|display/i, 'monitor'],
  [/app|website|mobile|checkout flow|portal|login|otp/i, 'phone'],
  [/payment|card|terminal|pos|upi|gateway|charge|transaction|refund fail/i, 'card'],
  [/invoice|receipt|statement|bill|tax|gst|credit note/i, 'receipt'],
  [/schedul|book|slot|cancell|resched|recurring|class pack|batch/i, 'calendar'],
  [/late|delay|wait|time|overrun|start/i, 'clock'],
  [/attendee|roster|capacity|overbook|waitlist|no-show|turnout|member list/i, 'users'],
  [/member|profile|profile update|freeze|membership|pause|downgrade|upgrade/i, 'person'],
  [/trainer|coach|method|cue|substitution|instruct|feedback/i, 'whistle'],
  [/repair|maintain|broken|repairing|equipment|machine|bench|rack|treadmill|mirror|props/i, 'wrench'],
  [/equipment|dumbbell|machine install|load|machine calibration/i, 'dumbbell'],
  [/cycle|spin|bike|chain|torque|pedal|saddle|powercycle/i, 'chain'],
  [/locker|storage|bag|changing|wardrobe/i, 'locker'],
  [/safety|security|injury|unsafe|emergency|first aid|compliance/i, 'shield'],
  [/alert|warning|risk|breach|escalat|urgent/i, 'alert'],
  [/camera|cctv|surveillance|footage/i, 'eye'],
  [/price|pricing|rate|discount|offer|coupon|transparen/i, 'tag'],
  [/communicat|call|email|message|whatapp|response|ignoring|support/i, 'chat'],
  [/brand|social|marketing|campaign|review|google|poster/i, 'spark'],
  [/clean|hygien|sanit|dust|mop|towel/i, 'broom'],
  [/lost|found|theft|missing|stolen|inventor|stock/i, 'box'],
  [/document|policy|procedure|admin|report|audit|timesheet|payroll/i, 'doc'],
  [/access|key|entry|gate|badge|authoris|authoriz|permission/i, 'key'],
  [/notif|reminder|alarm|bell|ping/i, 'bell'],
  [/sustain|green|plant|water sav|energy/i, 'leaf'],
  [/fan|blower|exhaust|airflow/i, 'fan'],
];
export const RULE_COUNT = RULES.length;

export function emblemFor(cat, sub) {
  /* The sub-category wording wins; the category is only consulted when the name alone says
     nothing, otherwise every card under “Repair and Maintenance” inherits “air” from “Repair”. */
  const mine = String(sub || '');
  for (const [re, g] of RULES) if (re.test(mine)) return g;
  const ours = String(cat || '');
  for (const [re, g] of RULES) if (re.test(ours)) return g;
  const byFamily = FALLBACK_GLYPH[cat];
  return byFamily && GLYPHS[byFamily] ? byFamily : 'tag';
}
const FALLBACK_GLYPH = {
  'Scheduling': 'calendar', 'Class Experience': 'users', 'Trainer Feedback': 'whistle',
  'Repair and Maintenance': 'wrench', 'Studio Amenities and Facilities': 'drop',
  'Operating Systems': 'doc', 'Tech Issues': 'monitor', 'Pricing and Memberships': 'tag',
  'Customer Service and Communication': 'chat', 'Brand Feedback': 'spark',
  'Safety and Security': 'shield', 'Theft and Lost Items': 'box', 'Miscellaneous': 'tag',
  'Internal Operations & Admin': 'doc',
};

/** The whole theme for one ticket type: family hue, deterministic rotation inside the family,
    the emblem, and the colour triplets every surface then reads from. */
export function themeFor(cat, sub, idx) {
  const fam = FAMILIES[cat] || FALLBACK_FAMILY;
  const k = hash(`${cat}|||${sub || ''}`);
  /* Siblings inside one family are spread by their position, on a stride that never repeats twice
     in a row, so twenty cards in a category read as twenty distinct tickets — while the family
     itself stays recognisable, because the swing is capped at ±24°. With no index to go on the
     name’s own hash supplies a small ±6° tilt instead. */
  const rot = Number.isFinite(idx)
    ? ((Math.round(idx) * 13) % 49) - 24
    : ((k % 3) - 1) * 6;
  const h = wrap(fam.h + rot);
  const h2 = wrap(h + (Number.isFinite(idx) ? 18 + (Math.round(idx) % 6) * 9 : 22 + (k % 5) * 7));
  const sat = Math.max(34, Math.min(82, fam.s + (Number.isFinite(idx) ? ((Math.round(idx) * 7) % 5) * 6 - 12 : ((k >> 2) % 11) - 5)));
  /* Lightness steps by position too: two siblings a degree apart in hue still read apart. */
  const light = 42 + (Number.isFinite(idx) ? (Math.round(idx) % 4) * 5 : (k % 3) * 5);
  const emblem = emblemFor(cat, sub);
  return { cat, sub, h, h2, s: sat, l: light, emblem, family: cat in FAMILIES ? cat : 'Miscellaneous',
    accent: `hsl(${h} ${sat}% 46%)`, on: '#fff',
    glow: `hsl(${h} ${sat}% 52% / .35)`, key: `${cat}|||${sub || ''}` };
}

/** Inline custom properties for a themed container; the stylesheet does the rest so light and
    dark skins stay in charge of lightness and surface mixing. */
export const themeVars = t => ({ '--h': t.h, '--h2': t.h2, '--hs': t.s + '%', '--hl': (t.l ?? 46) + '%', '--h-em': 1 });

/* A glyph is a 24×24 stroke path; the card draws it as an inline SVG so the emblem inherits
   the card’s colour, needs no request, and never prints path data as copy. */
export const glyphSvg = (name, size = 20, width = 1.8) =>
  `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="${width}"`
  + ` stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="${GLYPHS[name] || GLYPHS.spark}"/></svg>`;

export const cache = (() => { const m = new Map();
  return (cat, sub, idx) => { const i = Number.isFinite(idx) ? Math.round(idx) : -1;
    const k = `${cat}|||${sub || ''}|||${i}`; let v = m.get(k);
    if (!v) { v = themeFor(cat, sub, i < 0 ? undefined : i); m.set(k, v); } return v; }; })();
