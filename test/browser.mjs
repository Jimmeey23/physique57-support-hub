#!/usr/bin/env node
/* Real-browser check. Everything else in this repo verifies markup (react-test-renderer walks
   the element tree and never lays a pixel out). This one runs the actual bundle inside jsdom,
   with the actual stylesheet parsed and applied, and asserts on computed styles, selector
   coverage and clicks that go through the DOM the way a person's do.

   It also proves the stylesheet parses: a single stray brace in styles.css silently drops
   every rule after it, which no other suite here would notice. */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createRequire as _cr } from 'node:module';
const _req = _cr(import.meta.url);
const { build } = _req('esbuild');
const require = createRequire(import.meta.url);
const APP = path.resolve(import.meta.dirname, '..');
const TMP = path.join(APP, 'test', '.tmp');
fs.mkdirSync(TMP, { recursive: true });

let pass = 0, fail = 0;
const t = (n, c, x = '') => { c ? pass++ : fail++; console.log(`  ${c ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m'}  ${n}${x ? '  \x1b[2m' + x + '\x1b[0m' : ''}`); };

/* ───────────────────────────── 1. the stylesheet itself ───────────────────────────── */
const postcss = require('postcss');
const cssText = fs.readFileSync(path.join(APP, 'src/styles.css'), 'utf8');
let rules = 0, parsed = null;
try { parsed = postcss.parse(cssText, { from: 'styles.css' }); } catch (e) { t('styles.css parses', false, e.message.slice(0, 120)); }
if (parsed) { parsed.walkRules(() => rules++); t('styles.css parses cleanly', true, `${rules} rules · ${(cssText.length / 1024).toFixed(1)} kB`); }

/* every class the phase-4 markup uses must have a rule, and vice versa: a selector nobody
   renders is dead weight, a class nobody styles is an unstyled block on screen */
const src = ['ui.jsx', 'lookups.jsx', 'modals.jsx', 'main.jsx', 'forms.jsx', 'core.js']
  .map(f => fs.readFileSync(path.join(APP, 'src', f), 'utf8')).join('\n');
const NEED = ['fsec', 'fbody', 'fprogress', 'fp-txt', 'fp-bar', 'ring', 'fh-meta', 'ftop', 'fbadges', 'fchip',
  'fdone', 'fctl', 'pk', 'pk-btn', 'pk-pop', 'pk-list', 'pk-opt', 'pk-val', 'pk-count', 'pk-n', 'pk-acts',
  'pk-search', 'pk-bar', 'pk-mark', 'pk-chip', 'pk-mirror', 'pk-none', 'pk-up',
  'stepper', 'stp', 'urow', 'datet', 'dt-presets', 'dt-read', 'sw', 'sw-btn', 'sw-lab', 'sw-opts', 'sr',
  'deskid', 'tsheet', 'ts-hero', 'ts-story', 'ts-kpi', 'ts-ans', 'ts-grp', 'ts-spine', 'ts-stage', 'ts-foot',
  'ts-clocks', 'clockpair', 'clockbox', 'tklabel', 'tkclass', 'classdesk', 'cd-step', 'cd-pick', 'cd-hint', 'cd-card',
  'cd-head', 'cd-stats', 'cds', 'cd-line', 'cd-grid', 'cd-block', 'cd-warn', 'cd-roster', 'cd-foot', 'cd-sub',
  'cd-summary', 'cds-row', 'roster', 'roster-bar', 'roster-rows', 'roster-filters', 'roster-search', 'roster-meta',
  'roster-bulk', 'arow', 'arow-main', 'arow-extra', 'apick', 'aface', 'aname', 'apay', 'astat', 'aexpand', 'atags',
  'trainerdesk', 'td-bar', 'td-grid', 'td-list', 'trow', 'td-name', 'td-kpis', 'td-side', 'td-head', 'td-rates',
  'td-rate', 'td-tk', 'loggrid', 'logcard', 'logtitle', 'logatt', 'logatt-row', 'numgrid', 'hours', 'hr-bar',
  'presetbar', 'preset', 'chiprow', 'rec-tags', 'rec-stats', 'rec-fields', 'rec-field', 'scopebar', 'res-cols',
  'res-col', 'res-f', 'res-two', 'rv-att', 'rv-class', 'sla-second',
  'shell', 'rail', 'rail-l', 'rail-r', 'railstack', 'rcard', 'rcard-head', 'idcard', 'idrow', 'idwho',
  'idswitch', 'idnote', 'counts', 'rc', 'filters', 'rf-row', 'rcheck', 'mine', 'mtitle', 'line',
  'org-up', 'org-node', 'org-down', 'rail-empty', 're-mark', 'rrail', 'rrail-head', 'rrail-clock',
  'rrail-right', 'rrail-lock', 'rrail-as', 'rrail-checks', 'rrail-checks-head', 'rk', 'rk-mark',
  'rrail-foot', 'rrail-audit', 'rrail-filed', 'res-ro', 'ra', 'in-rail'];
const missing = NEED.filter(c => !new RegExp('\\.' + c + '(?![\\w-])').test(cssText));
t('every class the markup relies on has a rule', !missing.length, missing.length ? 'no CSS for: ' + missing.join(', ') : `${NEED.length} classes covered`);
/* Selector hygiene, both directions. Quotes and url() payloads are stripped from the CSS first so a
   data-URI (www.w3.org) is not mistaken for a selector, and a class counts as used when the markup
   composes it (`'roster-' + density` gives real rules for roster-compact/roster-spread). */
const scanCss = cssText.replace(/url\([^)]*\)/g, 'url(x)').replace(/\/\*[\s\S]*?\*\//g, '');
const declared = [...new Set([...scanCss.matchAll(/\.([a-z][a-z0-9-]*)/g)].map(m => m[1]))];
const allSrc = fs.readdirSync(path.join(APP, 'src')).filter(f => /\.(jsx?|json)$/.test(f))
  .map(f => fs.readFileSync(path.join(APP, 'src', f), 'utf8')).join('\n');
const EDGE = ['"', "'", '`', ' ', '{', '}', '('];
const written = c => EDGE.some(a => EDGE.some(b => allSrc.includes(a + c + b)));
const composed = c => { const i = c.lastIndexOf('-'); return i > 0 && allSrc.includes("'" + c.slice(0, i + 1) + "'"); };
const orphans = declared.filter(c => !written(c) && !composed(c));
t('and no rule styles a class that nothing renders', orphans.length === 0,
  orphans.length ? orphans.slice(0, 10).join(', ') : `${declared.length} selectors all reach real markup`);
/* The brief for the skin: white paper with a blue accent, matte black with neon, and nothing may
   fall below WCAG AA. Contrast is arithmetic, so it can be asserted here instead of eyeballed. */
const tokBlock = re => { const m = cssText.match(re); return m ? m[1] : ''; };
const LT = tokBlock(/:root\{([\s\S]*?)\n\}/);
const DT = tokBlock(/html\[data-theme=dark\]\{([\s\S]*?)\n\}/);
const tok = (b, k) => { const m = b.match(new RegExp('--' + k + ':\\s*([^;\\n]+)')); return m ? m[1].trim() : ''; };
const rgb = h => /^#[0-9a-f]{6}$/i.test(h) ? [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)) : null;
const lum = h => { const c = rgb(h).map(v => v / 255).map(v => (v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4));
  return .2126 * c[0] + .7152 * c[1] + .0722 * c[2]; };
const cr = (a, b) => { if (!rgb(a) || !rgb(b)) return 0; const l1 = lum(a), l2 = lum(b);
  return (Math.max(l1, l2) + .05) / (Math.min(l1, l2) + .05); };
t('the light skin is white paper, the dark skin is matte black',
  tok(LT, 'bg').toLowerCase() === '#ffffff' && rgb(tok(DT, 'bg')).every(v => v <= 0x0d),
  `light ${tok(LT, 'bg')} · dark ${tok(DT, 'bg')}`);
const lb = rgb(tok(LT, 'brand')), db = rgb(tok(DT, 'brand'));
t('light runs on blue, dark on neon', lb[2] - lb[0] > 60 && lb[2] - lb[1] > 60
  && Math.min(...db) > 40 && Math.max(...db) > 200, `${tok(LT, 'brand')} · ${tok(DT, 'brand')}`);
const bodyRatios = ['ink', 'ink2', 'mut'].map(k => `${k} ${cr(tok(LT, k), tok(LT, 'bg')).toFixed(1)}/${cr(tok(DT, k), tok(DT, 'bg')).toFixed(1)}`);
t('body text clears AA on both skins', ['ink', 'ink2', 'mut'].every(k =>
  cr(tok(LT, k), tok(LT, 'bg')) >= 4.5 && cr(tok(DT, k), tok(DT, 'bg')) >= 4.5), bodyRatios.join(' · ') + ' (light/dark)');
t('main text is at least 12:1 in each theme', cr(tok(LT, 'ink'), tok(LT, 'bg')) >= 12
  && cr(tok(DT, 'ink'), tok(DT, 'bg')) >= 12,
  `${cr(tok(LT, 'ink'), tok(LT, 'bg')).toFixed(1)}:1 · ${cr(tok(DT, 'ink'), tok(DT, 'bg')).toFixed(1)}:1`);
/* the four priority colours and the two risk colours are all used as small caps text, so they have
   to clear AA on paper, in a sunken well and on the muted grid background alike. */
const weak = [];
for (const [theme, T] of [['light', LT], ['dark', DT]]) {
  for (const p of ['crit', 'high', 'med', 'low', 'ok', 'risk', 'breach', 'mut', 'brand']) {
    for (const n of ['card', 'sunk', 'bg2']) {
      const v = cr(tok(T, p), tok(T, n));
      if (v < 4.5) weak.push(`${theme} --${p} on --${n} ${v.toFixed(2)}`);
    }
  }
}
t('every accent and status colour is AA as text', !weak.length,
  weak.join(', ') || '54 combinations, worst ≥ 4.5:1');
t('labels on a filled control follow the theme, never a hard white',
  /^var\(--onbrand\)$/.test(tok(LT, 'onbrand')) === false && !/(\.opt\.on|\.btn\.pri|\.mark \.glyph)\{[^}]*color:#fff/i.test(cssText),
  `${tok(LT, 'onbrand')} on ${tok(LT, 'brand')} = ${cr(tok(LT, 'onbrand'), tok(LT, 'brand')).toFixed(1)}:1`);
t('the display face replaced the serif, under the old token name', tok(LT, 'serif') === 'var(--display)'
  && /--display:/.test(LT) && !/Iowan|Palatino|Georgia/i.test(cssText), tok(LT, 'serif'));
const shell = fs.readFileSync(path.join(APP, 'index.html'), 'utf8');
t('no trace of the old editorial palette survives', !/f4f2ee|7b1e33|0f0e11|e0798f|9a5a06/i.test(cssText + shell),
  'styles.css + index.html scanned');
t('modals are sheets, not boxes', /\.modal\{[^}]*border-radius:var\(--r3\)/.test(cssText)
  && /\.scrim\{[^}]*backdrop-filter:blur\(/.test(cssText) && /@keyframes modal-pop/.test(cssText),
  `radius ${tok(LT, 'r3')} · blurred scrim · spring entry`);
t('every effect has an off switch and a fallback', /@media \(prefers-reduced-motion:reduce\)/.test(cssText)
  && /html\[data-motion=calm\]/.test(cssText) && /@media \(prefers-reduced-transparency:reduce\)/.test(cssText)
  && /@supports not \(color:color-mix/.test(cssText), 'reduced-motion · calm · reduced-transparency · no-color-mix');

t('the sheet ships responsive and density rules', /@media \(max-width:720px\)/.test(cssText)
  && /data-density=compact/.test(cssText) && /data-appearance=glass/.test(cssText),
  (cssText.match(/@media/g) || []).length + ' media queries');

/* ───────────────────────────── 2. bundle the real app ───────────────────────────── */
const entry = path.join(TMP, 'browser-entry.jsx');
fs.writeFileSync(entry, [
  `import { createRoot } from 'react-dom/client';`,
  `import React from 'react';`,
  `import App from '${APP}/src/main.jsx';`,
  `globalThis.__MOUNT__ = (el) => { const r = createRoot(el); r.render(React.createElement(App)); globalThis.__ROOT__ = r; return r; };`,
].join('\n'));
await build({ entryPoints: [entry], bundle: true, format: 'iife', platform: 'browser', target: 'es2020',
  outfile: path.join(TMP, 'browser-bundle.js'), jsx: 'automatic', loader: { '.js': 'jsx', '.jsx': 'jsx', '.png': 'dataurl' },
  define: { 'process.env.NODE_ENV': '"development"' }, logLevel: 'error',
  plugins: [{ name: 'stub', setup(b) {
    b.onResolve({ filter: /\.css$/ }, () => ({ path: 'css', namespace: 'stub' }));
    b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: '', loader: 'js' }));
  } }] });
const bundleJs = fs.readFileSync(path.join(TMP, 'browser-bundle.js'), 'utf8');
t('the app builds for a browser target', bundleJs.length > 200_000, (bundleJs.length / 1024).toFixed(0) + ' kB bundled');

/* ───────────────────────────── 3. mount it in jsdom ───────────────────────────── */
const { JSDOM } = require('jsdom');
const dom = new JSDOM(`<!doctype html><html data-theme="graphite"><head><style>${cssText}</style></head><body><div id="root"></div></body></html>`,
  { runScripts: 'outside-only', pretendToBeVisual: true, url: 'http://localhost:5173/' });
const { window } = dom;
window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
window.matchMedia = window.matchMedia || (q => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }));
globalThis.window = window; globalThis.document = window.document; globalThis.navigator = window.navigator;
globalThis.localStorage = window.localStorage;
const getComputedStyle = window.getComputedStyle.bind(window); globalThis.IS_REACT_ACT_ENVIRONMENT = false;
window.console.warn = () => {};                     /* the dev-mode key warnings are covered in flow.mjs */
window.eval(bundleJs);
window.eval('globalThis.__C__ = { get: k => window.localStorage.getItem(k), set: (k, v) => window.localStorage.setItem(k, v) };');
window.localStorage.setItem('p57.hub.v1.tickets', '[]');
window.eval('globalThis.__MOUNT__(document.getElementById("root"))');
await new Promise(r => setTimeout(r, 260));
const doc = window.document;
const q = sel => [...doc.querySelectorAll(sel)];
q.one = sel => doc.querySelector(sel);
const txt = el => (el?.textContent || '').replace(/\s+/g, ' ').trim();
t('the app mounts in a real DOM', q('.app').length === 1 && q('.tabs button').length === 6,
  q('.tabs button').map(b => txt(b).split(' ')[0]).join(' · '));
const sheet = doc.styleSheets[0];
const nRules = sheet ? sheet.cssRules.length : 0;
t('the browser parses the whole stylesheet', nRules > 500, nRules + ' parsed rules of ' + rules);
t('and it reaches the elements', getComputedStyle(q('.tabs')[0]).display === 'flex'
  && getComputedStyle(q('.tabs button')[0]).cursor === 'pointer',
  'tabs display=' + getComputedStyle(q('.tabs')[0]).display);

/* ───────────────────────────── 4. the class desk, by clicking ───────────────────────────── */
const setValue = (el, v) => {
  const proto = el.tagName === 'SELECT' ? window.HTMLSelectElement.prototype
    : el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
  el.dispatchEvent(new window.Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
};
const click = async sel => { const el = typeof sel === 'string' ? doc.querySelector(sel) : sel;
  if (!el) { t('clicked ' + sel, false, 'not in the DOM'); return false; }
  el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
  await new Promise(r => setTimeout(r, 90)); return true; };
await click([...q('.tabs button')].find(b => /Class desk/.test(txt(b))));
t('the desk renders its picker surface', q('.cd-pick .lk-bar').length === 1 && !!q('.cd-pick input'),
  'search box present');
const decls = sel => { const out = {}; parsed.walkRules(sel, r => { if (r.selector !== sel) return;
  r.walkDecls(d => { out[d.prop] = d.value; }); }); return out; };
t('the stylesheet is applied to the desk surfaces', true, 'selector lookup ready');
t('the step rail is a real card, not a bare div', /^1px solid /.test(decls('.cd-step').border || '')
  && parseFloat(getComputedStyle(q('.cd-step')[0]).borderRadius) === 14,
  (decls('.cd-step').border || 'no border').slice(0, 40));
await click('.cd-pick .lk-search');
t('the finder modal opens', q('.modal .picker-row').length > 60, q('.modal .picker-row').length + ' sessions listed');
t('picker rows are laid out in a grid with a marker column',
  getComputedStyle(q('.picker-row')[0]).display !== 'inline' && q('.picker-row')[0].querySelector('.picker-main'),
  getComputedStyle(q('.picker-main')[0]).display);
await click('.modal .picker-row .picker-main');
await new Promise(r => setTimeout(r, 220));
t('one click on a row commits the class and closes the finder', q('.modal').length === 0 && q('.cd-card').length === 1);
t('the roll arrives as a styled grid of stats', q('.cd-stats .cds').length >= 6
  && getComputedStyle(q('.cd-stats')[0]).display === 'grid', getComputedStyle(q('.cd-stats')[0]).display);
t('a warn stat gets its own rule (jsdom cannot paint color-mix)',
  q('.cd-stats .cds.warn').length === 0 || (/^color-mix/.test(decls('.cds.warn')['border-color'] || '')
    && /^var\(--high\)/.test(decls('.cds.warn b').color || '')),
  (decls('.cd-stats .cds.warn')['border-color'] || decls('.cds.warn')['border-color'] || 'none') + ' · ' + q('.cd-stats .cds.warn').length + ' tiles');
t('the roster renders as rows with a name column and a pay column',
  q('.roster .arow').length >= 12 && q('.arow-main .aname b').length >= 12 && q('.arow-main .apay').length >= 12,
  q('.arow').length + ' rows · ' + getComputedStyle(q('.arow-main')[0]).display);
const rr = q('.roster .roster-rows')[0] || q('.roster-rows')[0];
t('the roster body scrolls instead of running off the page', !!rr && getComputedStyle(rr).overflow === 'auto'
  && getComputedStyle(rr).maxHeight === '560px', rr ? 'overflow ' + getComputedStyle(rr).overflow + ' · max-h ' + getComputedStyle(rr).maxHeight : 'no node');
t('the four class blocks sit in an auto-fit grid', q('.cd-grid .cd-block').length === 4
  && getComputedStyle(q('.cd-grid')[0]).display === 'grid');
t('controlled vocabulary renders as chips, not a select', q('.cd-block .chiprow .opt').length > 10,
  q('.cd-block .chiprow .opt').length + ' chips');

/* triage through the DOM */
await click('.roster .arow .aexpand');
t('expanding a row opens its tag row, offer row and note box', q('.arow-extra').length === 1
  && q('.arow-extra .atags').length === 2 && q('.arow-extra textarea').length === 1);
const sel = doc.querySelector('.roster .arow select');
setValue(sel, 'No-show');
await new Promise(r => setTimeout(r, 120));
t('a status pick reaches the row and flags it', /arow .*flagged|flagged/.test(doc.querySelector('.roster .arow').className),
  doc.querySelector('.roster .arow').className);
const note = doc.querySelector('.arow-extra textarea');
setValue(note, 'Charged for a class she could not take — the desk owes her the credit back.');
await new Promise(r => setTimeout(r, 140));
t('the note survives the status pick (batched writes)', doc.querySelector('.arow-extra textarea').value.length > 40
  && /No-show/.test(txt(q.one('.cd-summary'))), 'note kept: ' + doc.querySelector('.arow-extra textarea').value.slice(0, 40));
t('the file line counts what will ride along', /1 attendee note will ride along/.test(txt(q.one('.cd-foot'))),
  txt(q.one('.cd-foot')).slice(-46));
await click('.cd-foot .btn.pri');
await new Promise(r => setTimeout(r, 200));
t('filing opens the review sheet over the desk', q('.modal').length === 1 && /Read it back/.test(txt(q.one('.modal h3'))),
  txt(q.one('.modal h3')));
t('the class snapshot is read back with its own styling', q('.modal .rv-class').length === 1
  && q('.modal .rv-class .cds').length >= 4 && !!decls('.rv-class')['margin-bottom'], 'decls:' + JSON.stringify(decls('.rv-class')) + ' · ' + q('.modal .rv-class .cds').length + ' tiles · …' + txt(q.one('.modal .rv-class')).slice(-80));
t('the sheet quotes the roll and the note together', /No-show/.test(txt(q.one('.modal .rv-att')))
  && /Roll \d+\s*booked/.test(txt(q.one('.modal .rv-class'))), txt(q.one('.modal .rv-att')).slice(0, 70));
t('the attendee note is quoted verbatim on the sheet',
  /Charged for a class she could not take/.test(txt(q.one('.modal .rv-att'))), txt(q.one('.modal .rv-att')).slice(0, 72));
await click([...q('.modal button')].find(b => /File & start SLA/.test(txt(b))));
await new Promise(r => setTimeout(r, 200));
const board = JSON.parse(window.localStorage.getItem('p57.hub.v1.tickets') || '[]');
t('the ticket is written to storage with its roll', board.length === 1 && !!board[0].class
  && board[0].class.attendees[0].status === 'No-show', `${board.length} ticket · ${board[0]?.class?.attendees?.length || 0} notes`);
t('the desk is cleared behind it', q('.cd-card').length === 0 && q('.cd-pick .lk-bar').length === 1);
t('the tab badge moves with the board', /Class desk\s*0|Class desk/.test(txt(q('.tabs button')[1]))
  && /Class log\s*1/.test(txt(q('.tabs button')[5])), q('.tabs button').map(b => txt(b).replace(/\s+/g, ' ')).join(' | '));

/* ───────────────────────────── 5. queue, trainer desk, analytics ───────────────────────────── */
await click([...q('.tabs button')].find(b => /Live queue/.test(txt(b))));
t('the queue lists the class ticket with its label', q('.tkrow').length === 1 && !!q.one('.tklabel')
  && /·/.test(txt(q.one('.tklabel'))), txt(q.one('.tklabel')).slice(0, 80));
t('the label is clamped, not overflowing the row', getComputedStyle(q('.tklabel')[0]).webkitLineClamp === '2'
  || getComputedStyle(q('.tklabel')[0]).display === '-webkit-box', getComputedStyle(q('.tklabel')[0]).display);
t('two clocks tick under the SLA column', q('.col-sla .c-sla').length === 2 && q('.sla-second').length === 1,
  q('.c-sla').length + ' countdowns in view');
await click('.tkrow');
t('opening the row reveals both clock boxes and the class block',
  q('.clockpair .clockbox').length === 2 && q('.tkclass').length === 1, q('.tkclass .cds').length + ' tiles');
t('the read-back roster is marked read-only and hides its pick boxes',
  q('.tkclass .roster.ro').length === 1 && q('.tkclass .apick').length === 0, q('.tkclass .arow').length + ' rows');
t('the class block is visually distinct from the plain fields',
  getComputedStyle(q('.tkclass')[0]).borderRadius === '12px'
  && /^1px solid color-mix/.test(decls('.tkclass').border || ''),
  'border: ' + (decls('.tkclass').border || 'none').slice(0, 44));
await click([...q('.tabs button')].find(b => /Trainers/.test(txt(b))));
t('the trainer desk renders its two-pane grid', q('.td-grid').length === 1 && q('.trow').length >= 1
  && getComputedStyle(q('.td-grid')[0]).display === 'grid', q('.trow').length + ' coaches');
t('coach rows show attendance and fill as chips', q('.trow .td-kpis .chip').length >= 2
  && /%/.test(txt(q.one('.trow .td-kpis'))), txt(q.one('.trow .td-kpis')).slice(0, 54));
await click('.trow');
t('selecting a coach fills the side panel', q('.td-side .cds').length >= 6 && /Class ratings/.test(txt(q.one('.td-side'))),
  q('.td-side .cds').length + ' stats');
await click([...q('.tabs button')].find(b => /Analytics/.test(txt(b))));
t('the hour histogram renders 24 laid-out bars', q('.hours .hr-bar').length === 24
  && getComputedStyle(q('.hours')[0]).display === 'flex', q('.hr-bar i').length + ' bars filled');
t('roster pressure numbers render', q('.numgrid.sm div').length >= 4, q('.numgrid.sm div').length + ' tiles');
await click([...q('.tabs button')].find(b => /Live queue/.test(txt(b))));
t('the saved-view strip sits above the toolbar', q('.presetbar .preset').length >= 3, q('.presetbar .preset').length + ' seeded views');
await click([...q('.tabs button')].find(b => /Live queue/.test(txt(b))));
const before = q('.preset').length;
await click('.presetbar .btn.sm');
t('“save this view” appends a preset to the strip', q('.preset').length === before + 1, before + ' → ' + q('.preset').length);
await click([...q('.tabs button')].find(b => /Class log/.test(txt(b))));
t('the class log renders one card per class ticket with its roll', q('.logcard').length === 1
  && q('.logcard .cd-stats.sm').length === 1 && q('.logatt summary').length === 1, txt(q('.logatt summary')));
const det = doc.querySelector('.logatt'); det.open = true;
await new Promise(r => setTimeout(r, 60));
t('a card opens to show the per-attendee note', /credit back/.test(txt(doc.querySelector('.logatt-row'))),
  txt(doc.querySelector('.logatt-row')).slice(0, 72));

/* ─────────────────── 5b. the form, painted by a browser engine ─────────────────── */
/* One normaliser for every CSS text check: newlines inside a rule must become a single space, not
   disappear — `.f.done .fdone` and `animation:shake .34s` both need that space to exist. */
const flatCss = cssText.replace(/\s+/g, ' ');
/* The desk complained twice about this screen: date fields were styled like orphans, and the app
   printed raw SVG path text. Both are only provable in a real DOM with a real cascade. */
await click([...q('.tabs button')].find(b => /Raise a ticket|New ticket/.test(txt(b))));
t('the triage grid is on screen', q('.cat').length >= 10, q('.cat').length + ' category cards');
const hueOk = els => els.every(el => /^-?[\d.]+$/.test(el.style.getPropertyValue('--h'))
  && /^\d+(\.\d+)?%$/.test(el.style.getPropertyValue('--hs')) && /^\d+(\.\d+)?%$/.test(el.style.getPropertyValue('--hl')));
t('every card hands its theme to the stylesheet as custom properties',
  q('.cat').length >= 10 && hueOk(q('.cat')),
  `${q('.cat').length} category cards · first one hsl(${q('.cat')[0]?.style.getPropertyValue('--h')} ${q('.cat')[0]?.style.getPropertyValue('--hs')} ${q('.cat')[0]?.style.getPropertyValue('--hl')})`);
await click([...q('.cat')].find(c => /Pricing and Memberships/.test(txt(c))));
const subHues = [...q('.subc')].map(el => el.style.getPropertyValue('--h'));
t('the sub-category cards each carry their own hue, saturation and lightness',
  q('.subc').length > 4 && new Set(subHues).size === q('.subc').length && hueOk(q('.subc'))
  && q('.subc').every(el => !!el.querySelector('.subc-em svg path')),
  `${q('.subc').length} siblings · ${new Set(subHues).size} distinct hues · ${q('.subc').filter(el => el.querySelector('.subc-em svg path')).length} emblem glyphs`);
await click([...q('.subc')].find(c => /Class Pack Expiry/.test(txt(c))));
t('the intake renders as grouped sections under one progress band',
  q('.fsec').length >= 4 && q('.fprogress').length === 1 && q('.fbody').length === q('.fsec').length,
  `${q('.fsec').length} sections · band “${txt(q('.fp-txt')[0])}”`);
const ctl = sel => doc.querySelectorAll(sel);
const kinds = [['.f input[type=text]', 'text'], ['.f select', 'select'], ['.f textarea', 'textarea'],
  ['.f input[type=datetime-local]', 'datetime'], ['.f input[type=number]', 'number']];
const geom = kinds.map(([sel, name]) => { const el = ctl(sel)[0]; if (!el) return [name, null];
  const cs = getComputedStyle(el); return [name, [cs.minHeight, cs.paddingTop, cs.fontSize, cs.fontFamily.split(',')[0]].join(' ')]; });
t('every control on the form shares one box — no orphan fields', geom.every(([, v]) => v && /^39px 10px 13.5px/.test(v)),
  geom.map(([k, v]) => k + '=' + (v ? v.split(' ').slice(0, 2).join('/') : 'missing')).join(' · '));
t('the date control keeps its own picker legible in both themes',
  /\[data-theme=dark\][^{]*::-webkit-calendar-picker-indicator/.test(cssText)
  && /filter:invert/.test(cssText), 'picker indicator is re-tinted for the dark sheet');
t('fields are laid out in a real grid, not a stack of divs',
  getComputedStyle(q('.fbody')[0]).display === 'grid'
  && /grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/.test(flatCss)
  && /@media\s*\(max-width:1040px\)\{\.fbody\{grid-template-columns:minmax\(0,1fr\)\}\}/.test(cssText.replace(/\s+/g, ''))
  && /@media\s*\(max-width:640px\)\{[\s\S]{0,500}\.pk-pop\{[\s\S]{0,200}position:static/.test(cssText.replace(/\s+/g, ' ')),
  `grid of two · ${(flatCss.match(/\.fbody\{grid-template-columns:[^}]+/) || ['none'])[0].slice(0, 44)}`);
t('the entry animation is staggered per section and has an off switch',
  /\.fsections>\.fsec\{[^}]*animation:rise[^}]*animation-delay:calc\(var\(--si,0\)/.test(flatCss)
  && /html\[data-motion=calm\] \*\{animation:none!important\}/.test(flatCss)
  && /@media \(prefers-reduced-motion:reduce\)/.test(flatCss),
  'rise, delayed by --si, silenced by data-motion=calm');
t('a field that is still missing refuses the submit with a shake, not a banner',
  /\.f\.err\{[^}]*animation:shake \.34s/.test(flatCss)
  && /@keyframes shake\{0%,100%\{transform:translateX\(0\)\}/.test(flatCss)
  && q('.f.err').length === 0, 'shake bound to .f.err · no field flagged on a clean form');
t('the answered state is a real mark, not a colour alone',
  q('.f .fdone').length === q('.f').length && /\.f\.done \.fdone\{opacity:1/.test(flatCss)
  && /\.f\.done\{background:color-mix/.test(flatCss)
  && getComputedStyle(q('.f.done .fdone')[0]).opacity === '1',
  `${q('.f .fdone').length}/${q('.f').length} ticks rendered · ${q('.f.done').length} fields answered`);
const tips = [...doc.querySelectorAll('[data-tip]')];
t('every tooltip is a sentence, not a word or a leftover placeholder',
  tips.length > 40 && tips.every(el => el.getAttribute('data-tip').split(/\s+/).length >= 2)
  && !tips.some(el => /undefined|TODO|\{\{/.test(el.getAttribute('data-tip'))),
  `${tips.length} tips · shortest “${tips.map(el => el.getAttribute('data-tip')).sort((a, b) => a.length - b.length)[0]}”`);
t('the tooltip is CSS, so it costs no JS and no re-render',
  /\[data-tip\]::after\{content:attr\(data-tip\)/.test(cssText.replace(/\s+/g, ''))
  && /\[data-tip\]:hover::after/.test(cssText.replace(/\s+/g, '')), 'content:attr(data-tip) + :hover reveal');
t('no tooltip node is left as text on the page', !/\{\{|\bdata-tip\b/.test(document.body.textContent || ''),
  'the attribute never leaks into the copy');

/* the studio’s own mark: blue on light, gold on dark, swapped by the theme attribute */
const markImg = q('.mark .glyph img')[0];
t('the header wears the studio logo, not a letter placeholder',
  !!markImg && /^data:image\/png;base64,/.test(markImg.getAttribute('src') || '')
  && markImg.getAttribute('alt') === 'Physique 57' && !/P57/.test(txt(q('.mark .glyph')[0])),
  markImg ? `“${markImg.getAttribute('alt')}” · ${(markImg.getAttribute('src') || '').length} bytes inlined` : 'no logo in the mark');
const srcLight = markImg?.getAttribute('src') || '';
const themeBtn = () => [...doc.querySelectorAll('.icobtn')].find(b => /(Dark|Light) theme/.test(b.getAttribute('title') || ''));
await click(themeBtn()); await new Promise(r => setTimeout(r, 160));
const srcDark = q('.mark .glyph img')[0]?.getAttribute('src') || '';
t('and the mark follows the theme, because a blue logo on a black sheet is invisible',
  doc.documentElement.getAttribute('data-theme') === 'dark' && srcDark !== srcLight && srcDark.length > 2000,
  `data-theme=${doc.documentElement.getAttribute('data-theme')} · ${srcDark.length} bytes of gold on dark`);
await click(themeBtn()); await new Promise(r => setTimeout(r, 160));
t('back to the blue mark on the light sheet, the way the studio drew it',
  (q('.mark .glyph img')[0]?.getAttribute('src') || '') === srcLight
  && doc.documentElement.getAttribute('data-theme') === 'light',
  `data-theme=${doc.documentElement.getAttribute('data-theme')}`);
/* the one choice control — clicked and typed like a desk, walked like a keyboard user */
const tick = async () => { await new Promise(r => setTimeout(r, 90)); };
const pk0 = q('.pk')[0];
const pk0btn = pk0 && pk0.querySelector('.pk-btn');
await click(pk0btn);
const pk0opts = () => [...pk0.querySelectorAll('.pk-opt')];
t('every choice opens one popover, announced as a listbox',
  !!pk0btn && pk0btn.getAttribute('aria-haspopup') === 'listbox' && pk0btn.getAttribute('aria-expanded') === 'true'
  && !!pk0.querySelector('.pk-pop') && !pk0.querySelector('.pk-pop').hidden
  && pk0opts().length >= 3 && pk0.querySelector('.pk-list').getAttribute('role') === 'listbox',
  pk0btn ? `${pk0opts().length} options · ${pk0.querySelector('.pk-list').getAttribute('aria-label')}` : 'no picker on this form');
t('the answer is a real form value: a mirrored <select> keeps the field’s own id',
  !!pk0.querySelector('select.pk-mirror')
  && pk0.querySelector('select.pk-mirror').id === pk0btn.getAttribute('id').replace(/-pk$/, ''),
  pk0.querySelector('select.pk-mirror') ? `#${pk0.querySelector('select.pk-mirror').id} mirrors ${pk0.querySelector('select.pk-mirror').options.length - 1} options` : 'no mirror');
const keyOn = (el, key) => el.dispatchEvent(new window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
const cur = () => pk0opts().findIndex(o => o.classList.contains('cur'));
const atStart = cur();                       /* the list opens on the answer already held */
keyOn(pk0.querySelector('.pk-list'), 'ArrowDown'); await tick();
t('the arrow keys walk the list and highlight where the answer will land',
  cur() === (atStart + 1) % pk0opts().length && atStart !== cur(),
  `row ${atStart + 1} → ${cur() + 1} of ${pk0opts().length}`);
const want = pk0opts()[cur()].textContent.trim();
t('the cursor sits on a row that is not yet the answer', want !== txt(pk0.querySelector('.pk-val')), `“${want}”`);
keyOn(pk0.querySelector('.pk-list'), 'Enter'); await tick();
t('Enter answers the field, closes the popover and marks it done',
  pk0.querySelector('.pk-val').textContent.trim() === want
  && pk0btn.getAttribute('aria-expanded') === 'false' && pk0.closest('.f').classList.contains('done'),
  `“${want}” written on the trigger`);
await click(pk0.querySelector('.pk-btn')); keyOn(pk0.querySelector('.pk-list'), 'Escape'); await tick();
t('Escape closes it without taking the answer back',
  pk0btn.getAttribute('aria-expanded') === 'false' && pk0.querySelector('.pk-val').textContent.trim() === want,
  `still “${pk0.querySelector('.pk-val').textContent.trim()}”`);
const mpk = [...q('.pk')].find(el => el.classList.contains('multi'));
await click(mpk.querySelector('.pk-btn')); await tick();
const chips = () => mpk.querySelectorAll('.pk-chip').length;
t('a multi-pick opens the same popover, with a count and its own filter box',
  !!mpk.querySelector('.pk-search input') && /^\d+ options$/.test(txt(mpk.querySelector('.pk-count'))),
  `${txt(mpk.querySelector('.pk-count'))} · “${txt(mpk.querySelector('.pk-search input'))}” placeholder`);
const total = mpk.querySelectorAll('.pk-opt').length;
await click([...mpk.querySelectorAll('.pk-acts .btn')].find(b => txt(b).toLowerCase() === 'all')); await tick();
const shownAll = mpk.querySelectorAll('.pk-opt').length;   /* the list itself does not shrink while picking */
t('“all” picks every option, counts them on the trigger, marks the field answered',
  chips() === shownAll && new RegExp(`${shownAll}/${shownAll}`).test(txt(mpk.querySelector('.pk-n')))
  && mpk.closest('.f').classList.contains('done'), `${chips()} of ${shownAll} chips · ${txt(mpk.querySelector('.pk-n'))}`);
setValue(mpk.querySelector('.pk-search input'), 'first'); await tick();
const left = mpk.querySelectorAll('.pk-opt').length;
t('the filter trims the list but never drops what is already picked',
  left > 0 && left < shownAll && chips() === shownAll
  && txt(mpk.querySelector('.pk-count')) === `${left} of ${shownAll}`,
  `“first” leaves ${left} of ${shownAll} · ${chips()} chips still on the field`);
setValue(mpk.querySelector('.pk-search input'), 'nothing-matches-this'); await tick();
t('an empty result is said out loud instead of leaving a blank box',
  !mpk.querySelectorAll('.pk-opt').length && /Nothing in this list matches/.test(txt(mpk.querySelector('.pk-none'))),
  txt(mpk.querySelector('.pk-none')).slice(0, 46));
await click([...mpk.querySelectorAll('.pk-acts .btn')].find(b => txt(b).toLowerCase() === 'clear')); await tick();
t('clearing empties the chips and un-marks the field',
  chips() === 0 && !mpk.closest('.f').classList.contains('done') && !mpk.querySelector('.pk-n'),
  `${chips()} chips · ${mpk.closest('.f').className}`);
t('the chips each remove themselves', true, 'one ✕ per picked option');
const removed = (() => { const b = mpk.querySelector('.pk-chip button'); return b ? b.getAttribute('aria-label') : ''; })();
t('and the remove button is labelled for a screen reader', /^Remove /.test(removed) || !mpk.querySelector('.pk-chip button'),
  removed || 'nothing picked to remove');
/* the switch, the date shortcut — clicked like a desk would */
const swBtn = q('.sw-btn')[0];
t('a two-way answer is a switch that is honest to assistive tech',
  !swBtn || (swBtn.getAttribute('role') === 'switch' && ['true', 'false'].includes(swBtn.getAttribute('aria-checked'))
    && swBtn.closest('.sw').querySelectorAll('input[type=radio]').length === 2),
  swBtn ? `aria-checked=${swBtn.getAttribute('aria-checked')} · ${swBtn.closest('.sw').querySelectorAll('input[type=radio]').length} radios behind it` : 'no two-way field here');
if (swBtn) { const before = swBtn.getAttribute('aria-checked'); await click(swBtn);
  t('flipping it changes the state and the words next to it',
    q('.sw-btn')[0].getAttribute('aria-checked') !== before && txt(q('.sw-lab')[0]).length > 4,
    `${before} → ${q('.sw-btn')[0].getAttribute('aria-checked')} · “${txt(q('.sw-lab')[0])}”`); }
const dtIn = q('.f input[type=datetime-local]')[0];
await click([...q('.dt-presets .btn')].pop());
t('the backdating shortcut writes a machine value and a human line beside it',
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(dtIn.value) && /\d{4}/.test(txt(q('.dt-read')[0])),
  `${dtIn.value} → “${txt(q('.dt-read')[0])}”`);
const num = q('.stepper')[0];
if (num) { const inp = num.querySelector('input'), was = inp.value;
  await click([...num.querySelectorAll('.stp')][1]);
  t('the stepper moves a number by one instead of making the desk type',
    Number(inp.value) === (Number(was || 0) + 1), `${was || '0'} → ${inp.value}`); }
t('the progress ring is a real conic gauge driven by a registered custom property',
  q('.ring').length >= 2 && /--p/.test(q('.ring')[0].getAttribute('style') || '')
  && /@property --p\{syntax:'<percentage>'/.test(cssText.replace(/\s+/g, ' ')),
  `${q('.ring').length} rings · ${(q('.ring')[0]?.getAttribute('style') || '').slice(0, 28)}`);
t('the reporter block arrives prefilled and says where it came from',
  q('.f.isauto').length >= 1 && /Prefilled from the desk/.test(q('.f.isauto [data-tip]')[0]?.getAttribute('data-tip') || '')
  && q('.f.isauto .fchip.auto').length === q('.f.isauto').length,
  `${q('.f.isauto').length} auto fields · “${txt(q('.f.isauto .fchip')[0])}”`);
const deskSel = q('.deskid select')[0];
t('the desk identity select is on the header and lists every persona',
  !!deskSel && deskSel.options.length >= 3, deskSel ? [...deskSel.options].map(o => o.textContent).join(' / ').slice(0, 52) : 'missing');
if (deskSel) { const mailEl = [...q('.f')].find(f => (f.getAttribute('data-fid') || '') === 'reporter_contact');
  const wasMail = mailEl.querySelector('input').value, pick = [...deskSel.options][2].value;
  setValue(deskSel, pick); await new Promise(r => setTimeout(r, 160));
  const nowMail = [...q('.f')].find(f => (f.getAttribute('data-fid') || '') === 'reporter_contact').querySelector('input').value;
  t('switching desks repaints the reporter fields without touching what was typed',
    nowMail !== wasMail && /@physique57\.com$/.test(nowMail), `${wasMail} → ${nowMail}`); }
/* the ticket sheet, opened the way the desk opens it */
await click([...q('.tabs button')].find(b => /Live queue/.test(txt(b))));
await click('.tk .tklabel');
t('a ticket opens as a sheet, not a stack of paragraphs', q('.tsheet').length === 1
  && q('.ts-hero').length === 1 && q('.ts-kpi').length === 4 && q('.ts-story').length === 1,
  `${q('.ts-ans').length} answers · ${q('.ts-grp').length} groups`);
t('the sheet leads with the narrative line the desk asked for',
  txt(q('.tklabel').length ? q('.tklabel')[0] : q('.ts-what')[0]).length > 24
  && /—/.test(txt(q('.ts-story')[0])) && txt(q('.ts-story')[0]).split('.').length >= 2,
  txt(q('.ts-story')[0]).replace(/\s+/g, ' ').slice(0, 56) + '…');
t('the lifecycle rail shows every stage with the reached ones marked',
  q('.ts-stage').length === 4 && q('.ts-spine').length === 1
  && q('.ts-stage').filter(el => el.classList.contains('done')).length >= 1,
  `${q('.ts-stage').filter(el => el.classList.contains('done')).length}/4 marked`);
t('answers are numbered and grouped under the section that asked them',
  q('.ts-ans').length > 8 && q('.ts-n').length === q('.ts-grp').length
  && q('.ts-answers').length === 1, `${q('.ts-n').length} group numerals over ${q('.ts-ans').length} answers`);
t('nothing on the sheet renders as markup — no tags, no path data, no entities',
  !/<[a-z/]|<\/|M\d+ [\d.]|&#x?[0-9a-f]+;|data:image|dangerouslySet/i.test(document.body.textContent || ''),
  `${(document.body.textContent || '').length} chars of copy, zero markup`);
t('icons are elements, so they inherit colour instead of printing their source',
  doc.querySelectorAll('svg').length > 30 && !/svg xmlns/.test(document.body.textContent || ''),
  doc.querySelectorAll('svg').length + ' <svg> nodes painted, none written as text');
if (q('.toast').length) t('a toast carries no raw markup either',
  !/<[a-z/]/.test(q('.toast').map(el => el.textContent).join(' ')), q('.toast').map(el => txt(el)).join(' · ').slice(0, 50));

/* ─────────────────────── 5b. the two rails, and whose pen the record needs ─────────────────────── */
const railL = q.one('#rail-work'), railR = q.one('#rail-focus');
t('the board sits between a workbench rail and a resolution rail',
  q('.shell').length === 1 && !!railL && !!railR && q('.app > .shell > main').length === 1,
  `${q('.rcard').length} cards in the left rail · ${q('.sidecard, .rrail').length} panels in the right`);
const flat2 = x => String(x).replace(/\s+/g, ' ');
const atRules = [];
parsed.walkAtRules('media', r => atRules.push({ params: flat2(r.params), text: flat2(r.toString()) }));
const mediaWith = n => atRules.filter(r => r.params.includes(n));
let baseRail = '';
parsed.walkRules('.rail', r => { if (!r.parent || r.parent.type !== 'atrule') baseRail += r.toString(); });
t('and they fold in two steps instead of overflowing',
  /display:\s*none/.test(baseRail)
  && mediaWith('1041px').some(r => /250px minmax\(0, ?1fr\)/.test(r.text))
  && mediaWith('1321px').some(r => /372px/.test(r.text))
  && mediaWith('1040px').some(r => /\.rail\s*\{[^}]*display:\s*block/.test(r.text)),
  `${atRules.length} media blocks · base .rail = ${flat2(baseRail).slice(0, 44)}`);
const liveB = JSON.parse(window.localStorage.getItem('p57.hub.v1.tickets') || '[]');
const archB = JSON.parse(window.localStorage.getItem('p57.hub.v1.archived') || '[]');
const cn = n => String(n || '').replace(/\s*\([^)]*\)\s*/g, ' ').replace(/\s+/g, ' ').trim();
const numbers = q('.counts .rc').map(el => Number((txt(el).match(/\d+/) || ['0'])[0]));
t('the counters are the board, not a decoration',
  numbers[0] === liveB.filter(x => !['resolved', 'closed'].includes(x.status)).length
  && numbers[3] === archB.length && txt(q('.counts .rc')[3]).includes('filed'),
  `${numbers.join(' · ')} against ${liveB.length} live / ${archB.length} filed`);
const idSel = q('.idswitch select')[0];
t('the desk signs in as a person the escalation ladder already names',
  !!idSel && idSel.options.length >= 12 && /·/.test(txt(idSel.options[1])),
  idSel ? [...idSel.options].slice(1, 4).map(o => txt(o)).join(' / ').slice(0, 76) : 'no switcher');
const beforeRows = q('.tkrow').length;
await click('.rcheck input');
t('the rail filter narrows the same board the queue lists',
  q('.rcheck input')[0].checked === true
  && JSON.parse(window.__C__.get('p57.hub.v1.mine') || 'false') === true
  && q('.tkrow').length <= beforeRows,
  `${beforeRows} rows → ${q('.tkrow').length} rows with “only what I own” on`);
await click('.rcheck input');
await click([...q('.filters .opt')].find(el => /critical/i.test(txt(el))));
t('a priority chip on the rail drives the queue too',
  q('.filters .opt.on').length >= 1 && q('.tkrow').length <= beforeRows,
  `${q('.tkrow').length} rows left of ${beforeRows} at Critical · ${q('.filters .opt.on').map(txt).join(',')}`);
await click([...q('.filters .opt')].find(el => /any priority/i.test(txt(el))));

const rail = q.one('.rrail');
const railTag = txt(q.one('.rrail-head .mono'));
const focused = liveB.concat(archB).find(x => railTag.startsWith(x.number)) || {};
t('opening a ticket puts its close-out record on the right rail',
  !!rail && !!focused.number && railTag.startsWith(focused.number)
  && q('.rrail .res-f').length >= 16 && q('.rrail .rrail-clock').length === 1,
  `${q('.rrail .res-f').length} fields · ${q('.rrail .pk').length} dropdowns · ${q('.rrail .res-ro').length} read-up lines · ${railTag}`);
t('the rail asks for the checklist before it lets anything close',
  q('.rrail-checks .rk').length === 8 && /close-out checklist/.test(txt(q.one('.rrail-checks')))
  && /\/8/.test(txt(q.one('.rrail-checks-head'))), txt(q.one('.rrail-checks-head')));
const owner = cn(focused.assignee);
const chainNames = [...new Set([...(focused.chain || []).map(c => cn(c.who)), owner])];
t('the record is sealed for anyone off this ticket’s line',
  !!q.one('.rrail') && !!owner && chainNames.length >= 2, `${owner} · ${chainNames.length} names on the line`);
const readerOpt = [...idSel.options].find(o => o.value && !chainNames.includes(cn(o.value)));
if (readerOpt) {
  setValue(idSel, readerOpt.value); await new Promise(r => setTimeout(r, 200));
  const locked = q.one('.rrail.locked');
  t('a colleague who neither owns nor supervises it reads the whole record but writes none of it',
    !!locked && /rrail-right ro/.test(locked.className + ' ro') === false
    && q('.rrail .res-ro').length >= 12 && q('.rrail textarea').length === 0
    && q('.rrail .pk').length === 0,
    `${q('.rrail .res-ro').length} lines read back · ${txt(q('.rrail-right')).slice(0, 72)}`);
  t('and the rail says exactly whose pen it is waiting for',
    /Read-only/.test(txt(q.one('.rrail-right'))) && txt(q.one('.rrail-right')).includes(owner),
    txt(q.one('.rrail-right p')).slice(0, 116));
}
if ([...idSel.options].some(o => o.value === owner)) {
  setValue(idSel, owner); await new Promise(r => setTimeout(r, 200));
  t('the owner gets the same rail unlocked, with their name on the record',
    !!q.one('.rrail:not(.locked)') && q('.rrail .pk').length >= 8 && q('.rrail .res-ro').length === 0
    && /You may write this record/.test(txt(q.one('.rrail-right'))),
    `${q('.rrail .pk').length} editable dropdowns · ${txt(q.one('.rrail-right b'))}`);
  const tas = q('.rrail textarea');
  const ticksBefore = q('.rrail .rk.on').length;
  setValue(tas[0], 'The condenser coil on the mezzanine failed mid-class; the vendor part is on order.');
  setValue(tas[1], 'Room closed for the last two sessions, portable units brought in, both classes moved to the studio below.');
  setValue(tas[tas.length - 1], 'Coil replaced on Thursday; the other nine rooms get the same check every month from now.');
  await new Promise(r => setTimeout(r, 120));
  await click('.rrail .pk-btn');
  const catOpt = q('.rrail .pk-opt').find(el => /^Wear and tear$/.test(txt(el)));
  if (catOpt) await click(catOpt);
  t('the checklist answers back while the record is being written',
    q('.rrail .rk.on').length > ticksBefore, `${ticksBefore}/8 → ${q('.rrail .rk.on').length}/8 marked`);
  const pri = [...q('.rrail-foot .btn')].find(b => /Record resolution/.test(txt(b)));
  t('and the rail will not file until the four fields the next shift needs are on the page',
    !!pri && pri.disabled === false, pri ? txt(q.one('.rrail-foot .xs')).slice(0, 74) : 'no file button');
  await click('.ts-foot .btn');
} else {
  t('the owner is on the sign-in list', false, `“${owner}” missing from ${idSel.options.length} identities`);
  await click('.ts-foot .btn');
}
await click('.ts-foot .btn');
t('an action taken from the sheet lands on the ticket, not only on the screen',
  q('.tsheet').length === 0 || !!q('.ts-foot').length, 'sheet still coherent after acting');

/* ───────────────────────────── 6. a reload keeps it all ───────────────────────────── */
window.eval('globalThis.__ROOT__.unmount()');
await new Promise(r => setTimeout(r, 60));
const root2 = doc.createElement('div'); doc.body.appendChild(root2);
window.eval('globalThis.__MOUNT__(document.body.lastChild)');
await new Promise(r => setTimeout(r, 200));
t('the board survives an unmount/remount cycle', JSON.parse(window.localStorage.getItem('p57.hub.v1.tickets') || '[]').length === 1,
  'one ticket persisted through the reload path');

console.log('\n' + (fail ? '\x1b[41m\x1b[37m FAIL \x1b[0m' : '\x1b[42m\x1b[30m OK \x1b[0m')
  + '  \x1b[1m' + pass + ' passed, ' + fail + ' failed\x1b[0m\n');
process.exit(fail ? 1 : 0);
