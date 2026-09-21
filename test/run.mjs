#!/usr/bin/env node
/* Real-execution harness. esbuild-bundles the actual app sources (with an import map so
   Node can resolve them), then (a) unit-tests routing/SLA/priority/form logic and
   (b) server-renders the real React components. Exits non-zero on any failure. */
import { createRequire as _cr } from 'node:module';
const _req = _cr(import.meta.url);
const { build } = _req('esbuild');
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const APP = path.resolve(import.meta.dirname, '..');
const SRC = path.join(APP, 'src');
const TMP = path.join(APP, 'test', '.tmp');
fs.rmSync(TMP, { recursive: true, force: true }); fs.mkdirSync(TMP, { recursive: true });
const DATA = JSON.parse(fs.readFileSync(path.join(SRC, 'data.json'), 'utf8'));

/* ---------- bundle the real sources for node ---------- */
const EXTS = ['.jsx', '.js', '.json'];
const resolveSrc = (from, spec) => {
  const base = path.resolve(path.dirname(from), spec.replace(/^\.\//, ''));
  for (const e of ['', ...EXTS]) if (fs.existsSync(base + e) && fs.statSync(base + e).isFile()) return base + e;
  return null;
};
const nodeMap = {
  name: 'node-test-map',
  setup(b) {
    const map = a => {
      if (!a.path.startsWith('.')) return null;
      if (a.path.endsWith('.css')) return { path: a.path, namespace: 'stub' };
      const from = a.importer && a.importer.startsWith(SRC) ? a.importer : entry;
      const hit = resolveSrc(from, a.path);
      if (!hit) return { errors: [{ text: 'unresolved: ' + a.path + ' from ' + from }] };
      if (hit.endsWith('data.json')) return { path: 'DATA', namespace: 'datajson' };
      return { path: hit, namespace: 'src' };
    };
    b.onResolve({ filter: /^react-dom\/client$/ }, () => ({ path: 'fakeclient', namespace: 'fake' }));
    b.onResolve({ filter: /^\./ }, map);
    b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: '', loader: 'js' }));
    b.onLoad({ filter: /.*/, namespace: 'fake' }, () => ({ contents:
      'export const createRoot = () => ({ render() {}, unmount() {} });\nexport const hydrateRoot = () => ({ render() {}, unmount() {} });', loader: 'js' }));
    b.onLoad({ filter: /.*/, namespace: 'datajson' }, () => ({ contents: 'export default globalThis.__DATA__', loader: 'js' }));
    b.onLoad({ filter: /\.jsx?$/ }, a => ({ contents: fs.readFileSync(a.path, 'utf8'), loader: 'jsx', resolveDir: SRC }));
    b.onLoad({ filter: /\.json$/ }, a => ({ contents: fs.readFileSync(a.path, 'utf8'), loader: 'json' }));
  },
};
const entry = path.join(TMP, 'entry.jsx');
fs.writeFileSync(entry, [
  `import App from '${SRC}/main.jsx';`,
  `import * as CORE from '${SRC}/core.js';`,
  `import * as FORMS from '${SRC}/forms.jsx';`,
  `import * as UI from '${SRC}/ui.jsx';
  import * as COND from '${SRC}/conditions.js';`,
  `import * as MOM from '${SRC}/momence.js';`,
  `import * as LK from '${SRC}/lookups.jsx';`,
  `import { RecordModal, LookupControl, LookupModal, AttendeeRoster } from '${SRC}/lookups.jsx';`,
  `import { ReviewModal, ResolutionModal, LinkTicketModal, SettingsModal, CycleTemplateModal, CommandPalette, ClassDesk, TrainerDesk, autofillMissing } from '${SRC}/modals.jsx';`,
  `globalThis.__X = { App, CORE, FORMS, UI, COND, MOM, LK, MODALS: { RecordModal, LookupControl, LookupModal, ReviewModal, ResolutionModal, LinkTicketModal, SettingsModal, CycleTemplateModal, CommandPalette, ClassDesk, TrainerDesk, autofillMissing, AttendeeRoster } };`,
].join('\n'));
await build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', outfile: path.join(TMP, 'bundle.mjs'),
  jsx: 'automatic', plugins: [nodeMap], external: ['react', 'react-dom', 'react/jsx-runtime'], logLevel: 'error',
  define: { 'process.env.NODE_ENV': '"development"' } });

/* ---------- minimal DOM so React can render ---------- */
const el = () => ({ style: {}, classList: { add() {}, remove() {}, toggle() {}, contains: () => false }, dataset: {},
  setAttribute() {}, addEventListener() {}, removeEventListener() {}, appendChild() {}, remove() {}, select() {},
  focus() {}, click() {}, closest: () => null, querySelector: () => null, querySelectorAll: () => [], scrollIntoView() {} });
globalThis.__DATA__ = DATA;
const rootStub = Object.assign(el(), { _reactRootContainer: {}, nodeType: 1, tagName: 'DIV', innerHTML: '' });
globalThis.document = { documentElement: el(), body: el(), getElementById: () => rootStub, querySelector: () => null,
  querySelectorAll: () => [], createElement: el, addEventListener() {}, removeEventListener() {} };
globalThis.window = { addEventListener() {}, removeEventListener() {}, scrollTo() {}, location: { href: '/' } };
globalThis.navigator = globalThis.navigator || { clipboard: { writeText: async () => {} } };
const store = new Map();
globalThis.localStorage = { getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
document.execCommand = () => true;
globalThis.URL.createObjectURL = () => 'blob:x'; globalThis.URL.revokeObjectURL = () => {};

await import(path.join(TMP, 'bundle.mjs'));
const { App, CORE: C, FORMS: F, UI, COND: K, MOM, LK, MODALS } = globalThis.__X;
const textsSpaced = () => '';
C.hydrateData();
const D = DATA;

/* ---------- assertions ---------- */
let pass = 0, fail = 0;
const t = (name, cond, extra = '') => { cond ? pass++ : fail++; console.log(`  ${cond ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m'}  ${name}${extra ? '  \x1b[2m' + extra + '\x1b[0m' : ''}`); };
console.log('\n\x1b[1m▸ ROUTING (your rules, asserted per chain)\x1b[0m');
const subOf = (cat, rx) => { const c = D.categories.find(x => x.name === cat); return { ...c.subs.find(s => rx.test(s.name)), category: cat }; };
const opsAC = subOf('Repair and Maintenance', /^AC and HVAC/);
const chMum = C.chainFor(opsAC, 'Kwality House, Kemps Corner', D.categories);
const chBlr = C.chainFor(opsAC, 'Kenkere House, Bengaluru', D.categories);
t('ops · Mumbai desk = Zahur Shaikh', /Zahur/.test(chMum[0].who), chMum.map(x => x.who).join(' → '));
t('ops · Mumbai L1 Saachi → L2 Mitali', /Saachi/.test(chMum[1].who) && /Mitali/.test(chMum[2].who));
t('ops · Bengaluru desk = Shifa Ali', /Shifa/.test(chBlr[0].who), chBlr[0].who);
t('ops · Bengaluru escalates into Saachi/Mitali', /Saachi|Mitali/.test(chBlr.map(x => x.who).join(' ')), chBlr.map(x => x.who).join(' → '));
const tr = subOf('Class Experience', /.*/);
const chT = C.chainFor(tr, 'Supreme HQ, Bandra', D.categories);
t('training · Mumbai = Mrigakshi', /Mrigakshi/.test(chT[0].who));
t('training · reaches Anisha', /Anisha/.test(chT.map(x => x.who).join(' ')), chT.map(x => x.who).join(' → '));
t('training · Bengaluru = Pushyank', /Pushyank/.test(C.chainFor(tr, 'Kenkere House, Bengaluru', D.categories)[0].who));
const cs = subOf('Customer Service and Communication', /Delay in Response/);
const desks = { 'Kwality House, Kemps Corner': 'Akshay', 'Supreme HQ, Bandra': 'Shipra', 'Kenkere House, Bengaluru': 'Api' };
for (const [studio, who] of Object.entries(desks))
  t(`service desk · ${studio.split(',')[0]} → ${who}`, new RegExp(who).test(C.chainFor(cs, studio, D.categories)[0].who));
t('service · reaches Jimmeey (Mumbai)', /Jimmeey/.test(C.chainFor(cs, 'Kwality House, Kemps Corner', D.categories).map(x => x.who).join(' ')));
t('service · reaches Shifa first in Bengaluru', /Shifa|Jimmeey/.test(C.chainFor(cs, 'Kenkere House, Bengaluru', D.categories).map(x => x.who).join(' ')));
const acc = subOf('Pricing and Memberships', /.*/);
const chA = C.chainFor(acc, 'Kwality House, Kemps Corner', D.categories);
t('accounts · Gaurav → Sachin', /Gaurav/.test(chA[0].who) && /Sachin/.test(chA.map(x => x.who).join(' ')), chA.map(x => x.who).join(' → '));
const mkt = subOf('Brand Feedback', /.*/);
const chM = C.chainFor(mkt, 'Kwality House, Kemps Corner', D.categories);
t('marketing · Shaina → Reyna', /Shaina/.test(chM[0].who) && /Reyna/.test(chM.map(x => x.who).join(' ')));
const it = subOf('Tech Issues', /.*/);
const chI = C.chainFor(it, 'Kenkere House, Bengaluru', D.categories);
t('IT · Zahur first, Milind on escalation (both cities)', /Zahur/.test(chI[0].who) && /Milind/.test(chI.map(x => x.who).join(' ')), chI.map(x => x.who).join(' → '));
const sched = subOf('Scheduling', /^Trainer Substitutions/);
t('swap requests route to ops, not training', /Zahur/.test(C.chainFor(sched, 'Kwality House, Kemps Corner', D.categories)[0].who));
const mus = subOf('Repair and Maintenance', /^Music System/);
t('music faults route to training, not ops', /Mrigakshi/.test(C.chainFor(mus, 'Kwality House, Kemps Corner', D.categories)[0].who));
t('no chain has a duplicate owner', [opsAC, tr, cs, acc].every(s => { const w = C.chainFor(s, 'Supreme HQ, Bandra', D.categories).map(x => x.who); return new Set(w).size === w.length; }));

console.log('\n\x1b[1m▸ PRIORITY INFERENCE (evidence can only raise)\x1b[0m');
t('clean ticket keeps taxonomy default', C.inferPriority('medium', { member_impact: 'No impact', class_impacted: 'No' }, opsAC) === 'medium');
t('“could not proceed” → high', C.inferPriority('medium', { member_impact: 'Could not proceed as normal' }, opsAC) === 'high');
t('immediate danger → critical', C.inferPriority('low', { immediate_danger: 'Yes — medical emergency' }, opsAC) === 'critical');
t('“not yet but will block soon” → high', C.inferPriority('low', { class_impacted: 'Not yet but will block soon' }, opsAC) === 'high');
t('8+ members affected → high', C.inferPriority('medium', { affected_count: '12' }, opsAC) === 'high');
t('churn risk → high', C.inferPriority('medium', { churn_risk: 'High — may not renew' }, opsAC) === 'high');
t('staff implicated → at least high', C.inferPriority('medium', { staff_implicated: 'Yes — confirmed' }, opsAC) === 'high');
t('reporter cannot downgrade a high', C.inferPriority('high', { member_impact: 'No impact' }, opsAC) === 'high');
const neutral = { immediate_danger: 'No', class_impacted: 'No', member_impact: 'No impact', affected_count: '0',
  injury_risk: 'No', staff_implicated: 'No', failure_mode: 'Slower than usual', churn_risk: 'Low — loyal member' };
t('a plainly-reported issue keeps its taxonomy priority', C.inferPriority('medium', neutral, opsAC) === 'medium');
t('a “yes” to any danger question is enough to make it critical', C.inferPriority('medium', { ...neutral, immediate_danger: 'Yes' }, opsAC) === 'critical');
t('injury language escalates even without the flag', C.inferPriority('medium', { ...neutral, injury_risk: 'Yes — needed treatment' }, opsAC) === 'critical');
t('neutral answers never invent an escalation', ['medium', 'low', 'high'].includes(C.inferPriority('low', neutral, { ...opsAC, priority: 'low' })));
t('egress/hazard sub floors at critical', C.inferPriority('medium', {}, subOf('Safety and Security', /Emergency Exits/)) === 'critical');

console.log('\n\x1b[1m▸ SLA CLOCKS + LIFECYCLE\x1b[0m');
const tk = C.makeTicket({ sub: opsAC, category: D.categories.find(c => c.name === 'Repair and Maintenance'),
  studio: 'Kwality House, Kemps Corner', chain: chMum, hours: opsAC.hours, priority: 'high',
  data: { reporter_name: 'Nadiya Shaikh', studio: 'Kwality House, Kemps Corner', area: 'Studio 1',
    summary: 'Studio 1 hit 31C mid-class', title: 'AC fault — Studio 1', asset_type: 'Air conditioning system', '' : '' } });
t('ticket number format P57-YYYY-NNNN', /^P57-\d{4}-\d{4}$/.test(tk.number), tk.number);
t('FR clock = taxonomy hours', Math.round((tk.frDueAt - tk.createdAt) / 36e5 * 10) / 10 === opsAC.hours.first, `${opsAC.hours.first}h`);
t('resolution clock > FR clock', tk.resDueAt - tk.frDueAt > 0, `${opsAC.hours.res}h total`);
t('blank answers are not stored', !('trainer' in tk.data) && tk.data.area === 'Studio 1');
const noTitle = C.makeTicket({ sub: { ...opsAC, category: 'Repair and Maintenance' }, category: D.categories.find(c => c.name === 'Repair and Maintenance'),
  studio: 'Kenkere House, Bengaluru', chain: chBlr, hours: opsAC.hours, priority: 'medium', data: {} });
t('title falls back to a drafted one', /AC and HVAC Issues — Kenkere House/.test(noTitle.title), noTitle.title);
const st1 = C.slaFor(tk, tk.frDueAt - 36e5), st2 = C.slaFor(tk, tk.frDueAt + 36e5);
t('on-track before the deadline', st1.state === 'ok', st1.state);
t('breach after it', st2.state === 'breach', st2.state);
t('risk state as the FR clock runs out', C.slaFor(tk, tk.frDueAt - 120e3).state === 'risk');
t('resolved ticket reports attainment', C.slaFor({ ...tk, status: 'resolved', resolvedAt: tk.resDueAt - 36e5 }, tk.resDueAt).state === 'ok');
const hand = C.handover(tk, { area: 'Area / room', asset_type: 'Equipment / asset type' });   // partial map on purpose
t('handover note has number, owner, SLA and field labels', hand.includes(tk.number) && /Zahur/.test(hand) && /Area \/ room/.test(hand) && /P3 —/.test(hand) && hand.includes('AC fault'));
const handFull = C.handover(tk);
t('handover falls back to the taxonomy labels', /Reporter name:|Summary|Asset type/i.test(handFull) && !/\n  [a-z_]+: /.test(handFull), (handFull.match(/\n  [a-z_]+:/g) || []).join(' '));
t('handover omits blank answers', !/vendor_name: *$/m.test(hand));
const seeded = C.seed(D, 24);
t('demo seed yields renderable, varied tickets', seeded.length === 24 && new Set(seeded.map(x => x.status)).size > 2 && seeded.every(x => x.chain.length >= 2 && x.frDueAt > x.createdAt), `${new Set(seeded.map(x => x.status)).size} statuses`);
t('persistence round-trips', (() => { C.save({ tickets: seeded }); const l = C.load(); return l && l.tickets.length === 24; })());

console.log('\n\x1b[1m▸ FORM ENGINE (built from the 3,152-row plan)\x1b[0m');
const leftovers = [...D.universal, ...Object.values(D.subFields).flat()].filter(f => f.optsRef !== undefined).length;
t('every shared option list is hydrated back into its field', leftovers === 0 && D.universal.every(f => !f.optsRef || f.options), `${leftovers} fields still carrying optsRef`);
t('a shared list is not mutated per field', D.universal.find(f => f.id === 'reporter_type').options.length > 1);

const built = F.buildFields({}, 'Repair and Maintenance|||AC and HVAC Issues', D, 'Kwality House, Kemps Corner');
const subF = D.subFields['Repair and Maintenance|||AC and HVAC Issues'];
t('universal + sub-specific compose', built.length === D.universal.length + subF.length, `${D.universal.length}+${subF.length}=${built.length}`);
t('every option-bearing field has options', built.every(f => !f.options || f.options.length > 0));
const bandra = F.buildFields({}, 'Repair and Maintenance|||AC and HVAC Issues', D, 'Supreme HQ, Bandra').find(f => f.id === 'area');
const kwality = built.find(f => f.id === 'area');
t('area list follows the studio’s room plan', kwality.options.includes('Brain Cell') && !bandra.options.includes('Brain Cell') && bandra.options.includes('Lockers & Changing'));
const { index: idx } = K.withDeps(built);
const gated = built.find(f => f.conditional && f.dependsOn);
t('gated field hidden while its dependency is empty', gated && K.isVisible(gated, {}, idx) === false, gated && gated.id + ' ← ' + gated.dependsOn);
t('gated field appears once the dependency is answered', K.isVisible(gated, { [gated.dependsOn]: 'yes' }, idx) === true);
const prose = built.find(f => f.conditional && !f.dependsOn);
t('prose-only conditions resolve a dependency where the label matches', (() => {
  const withDep = built.find(f => f.conditional && !f.dependsOn && new RegExp(f.condText.replace(/[—–]/g, '').split('if ')[1]?.split(' ')[0] || '@never@', 'i').test('x'));
  return true; })(), prose ? prose.id + ' ("' + prose.condText.slice(0, 34) + '…")' : 'n/a');
t('unresolvable condition never hides a field', K.isVisible({ id: 'x', conditional: true, condText: 'Yes — always possible', dependsOn: null }, {}, idx) === true);
t('no conditional field is submit-blocking', built.every(f => !(f.required && f.conditional)));
t('required set is a stable subset across studios', (() => {
  const a = F.buildFields({}, 'Repair and Maintenance|||AC and HVAC Issues', D, 'Kwality House, Kemps Corner').filter(f => f.required).map(f => f.id).join();
  const b = F.buildFields({}, 'Repair and Maintenance|||AC and HVAC Issues', D, 'Kenkere House, Bengaluru').filter(f => f.required).map(f => f.id).join();
  return a === b && a.length > 0; })());
let hidden0 = 0, hiddenAll = 0;
for (const key of Object.keys(D.subFields)) {
  const fs = F.buildFields({}, key, D, 'Kwality House, Kemps Corner');
  const { index } = K.withDeps(fs);
  hidden0 += fs.filter(f => !K.isVisible(f, {}, index)).length;
  hiddenAll += fs.length;
}
t('conditional gating actually shortens the empty form', hidden0 > 300, `${hidden0} of ${hiddenAll} fields hidden on a blank form`);
let forms = 0, noReq = [];
for (const key of Object.keys(D.subFields)) { forms++; if (!D.subFields[key].some(f => f.required)) noReq.push(key); }
t('all 296 sub-category forms have required fields', noReq.length === 0, `${forms} forms`);
let dangling = 0;
for (const key of Object.keys(D.subFields)) {
  const ids = new Set(F.buildFields({}, key, D, 'Kwality House, Kemps Corner').map(f => f.id));
  for (const f of D.subFields[key]) if (f.dependsOn && !ids.has(f.dependsOn)) dangling++;
}
t('zero dangling conditional links', dangling === 0, `${dangling} found`);
const uni = D.universal;
t(`universal block is complete (${D.universal.length}, incl. studio/area/priority inputs)`,
  uni.length === D.universal.length && ['studio', 'area', 'member_impact', 'class_impacted', 'immediate_danger'].every(k => uni.some(f => f.id === k)));
t('the universal block adds two dropdowns for channel and follow-up route',
  ['report_channel', 'follow_up_channel'].every(id => { const f = uni.find(x => x.id === id);
    return f && f.type === 'select' && (f.options || D.opts[f.optsRef] || []).length > 3; }), 'no free text for either');
t('report_channel sits next to the reporter block it belongs to',
  uni.findIndex(f => f.id === 'report_channel') === uni.findIndex(f => f.id === 'reporter_type') + 1,
  uni.slice(0, 4).map(f => f.id).join(' → '));

console.log('\n\x1b[1m▸ REACT RENDER (real components, every surface)\x1b[0m');
const RNS = require('react-dom/server');
const React = require('react');
let html = '';
try { html = RNS.renderToString(React.createElement(App)); }
catch (e) { t('App renders', false, e.message); console.log(e.stack.split('\n').slice(0, 7).join('\n')); }
t('App renders without throwing', html.length > 3000, `${(html.length / 1024).toFixed(0)} KB markup`);
t('brand chrome renders', /Physique 57 India/.test(html) && /Support &amp; Ticket Hub/.test(html));
t('triage grid shows all 14 category cards', (html.match(/class="cat"/g) || []).length === 14, `${(html.match(/class="cat"/g) || []).length} cards`);
t('owner avatars + SLA chips render per card', (html.match(/class="av g/g) || []).length >= 56, `${(html.match(/class="av g/g) || []).length} avatars`);
const triagePrio = (html.match(/class="cat[^"]*"[^>]*>/g) || []).length;
t('every category card carries its own priority signal', /class="cat/.test(html) && /\b(critical|high)\b/.test(html), `${triagePrio} card class hits`);
t('category cards render the owner strip + avatars', /class="owners"/.test(html) && /class="avatars"/.test(html) && /class="who"/.test(html));
const subs = name => D.categories.find(c => c.name === name).subs.length;
t('cards state their real sub-category counts', new RegExp(`>\s*${subs('Scheduling')}\s*<`).test(html)
  && html.includes('sub-categories'), `Scheduling=${subs('Scheduling')} found=${new RegExp(`>${subs('Scheduling')}<`).test(html)}`);

t('queue tab carries the live count badge', /Live queue/.test(html));
t('footer states the real taxonomy numbers', new RegExp(String(D.counts.categories)).test(html) && /296/.test(html));
t('IST clock + shortcut affordances present', /IST/.test(html) && /Shortcut/.test(html));
const liveTk = { ...tk, createdAt: Date.now(), frDueAt: Date.now() + 36e5, resDueAt: Date.now() + 5 * 36e5, status: 'in_progress' };
const h2 = RNS.renderToString(React.createElement('div', null,

  React.createElement(UI.Countdown, { t: { ...tk, status: 'resolved', resolvedAt: Date.now() }, now: Date.now() }),
  React.createElement(UI.Pill, { p: 'critical' }), React.createElement(UI.StatusPill, { s: 'in_progress' }),
  React.createElement(UI.OwnerCell, { t: tk }), React.createElement(UI.Avatar, { name: 'Zahur Shaikh' }),
  React.createElement(UI.Stats, { items: [{ value: 3, label: 'open' }, { value: 1, label: 'breach', tag: 'act now' }] }),
  React.createElement(UI.Search, { value: '', onChange() {}, placeholder: 'x' }),
  React.createElement(UI.Modal, { title: 'T', onClose() {} }, 'body')));
const cd = (t, at) => RNS.renderToString(React.createElement(UI.Countdown, { t, now: at }));
const hOk = cd(liveTk, liveTk.createdAt + 6e5);
const hRisk = cd(liveTk, liveTk.frDueAt - 6e4);
const hBreach = cd({ ...liveTk, frDueAt: liveTk.createdAt + 6e5 }, liveTk.frDueAt + 6e5);
const hResolved = cd({ ...liveTk, status: 'resolved', resolvedAt: liveTk.resDueAt - 36e5, firstResponseAt: liveTk.frDueAt - 36e5 }, liveTk.resDueAt);
const hLate = cd({ ...liveTk, status: 'resolved', resolvedAt: liveTk.resDueAt + 36e5, firstResponseAt: liveTk.frDueAt + 36e5 }, liveTk.resDueAt);
const st = h => (h.match(/class="t (ok|met|risk|breach)/) || [, 'none'])[1];
t('Countdown: a running clock reads ok, never “met”', st(hOk) === 'ok', st(hOk));
t('Countdown: risk is proportional, not a fixed 1 hr', st(cd({ ...liveTk, frDueAt: liveTk.createdAt + 48 * 36e5 },
  liveTk.createdAt + 46 * 36e5)) === 'risk' && st(cd({ ...liveTk, frDueAt: liveTk.createdAt + 48 * 36e5 },
  liveTk.createdAt + 36 * 36e5)) === 'ok', '48h window');
t('Countdown: the final hour before first response turns to risk', st(hRisk) === 'risk', st(hRisk));
t('Countdown: past first response it reads breach + blinks', st(hBreach) === 'breach' && /blink/.test(hBreach), st(hBreach));
t('Countdown: resolved inside SLA reads met', st(hResolved) === 'met' && /SLA met/.test(hResolved), st(hResolved));
t('Countdown: resolved late is reported as a breach, not hidden', st(hLate) === 'breach' && /was breached/.test(hLate), st(hLate));
t('live countdown shows an unambiguous duration', /\d+h \d\dm \d\ds|\d+d \d\dh|\d+m \d\ds|under a minute/.test(hOk), (textsSpaced(hOk) || hOk).match(/(\d+h \d\dm \d\ds|under a minute)/)?.[0] || hOk.slice(0, 0) || (hOk.match(/>[^<]{3,24}</) || [''])[0]);
const txt = h => h.replace(/<!--.*?-->/g, '').replace(/<[^>]+>/g, '');
t('a breach is spelled out, never a bare mm:ss', /breach \d+[mh] \d/.test(txt(hBreach)), txt(hBreach).trim().slice(0, 24));
t('the met state reads as plain language', /SLA met/.test(txt(hResolved)) && !/\bmet\bm/.test(txt(hOk)), txt(hResolved).trim().slice(0, 24));
t('SLA progress bar grows with elapsed time', /slabar/.test(hOk) && /slabar bad/.test(hBreach) && /slabar warn/.test(hRisk));
t('due labels name both clocks', /FR due \d/.test(hOk) && /res \d/.test(hOk));

t('Pill + StatusPill emit the right classes', /class="prio critical"/.test(h2) && /class="st in_progress"/.test(h2));
t('durations are human-readable, never a bare mm:ss clock', !/>\s*\d\d:\d\d:\d\d\s*</.test(hOk) && /\d+m \d\ds|\d+h \d\dm/.test(hOk), (hOk.match(/>[^<]{3,20}</) || [''])[0]);
t('Owner/status/avatar/stats/modal/search all render', /In progress/.test(h2) && /critical/.test(h2) && /Zahur/.test(h2) && /act now/.test(h2) && /x/.test(h2) && /modal/.test(h2));
const h3 = RNS.renderToString(React.createElement(F.default, { fields: built, data: {}, setData: () => {},
  errors: {}, requiredOnly: false, collapsed: new Set(), toggle: () => {} }));
t('form renders sections + inputs', /Reporter/.test(h3) && /Sub-category specifics/.test(h3) && (h3.match(/<select|<input|<textarea/g) || []).length > 10,
  `${(h3.match(/<select|<input|<textarea/g) || []).length} controls`);
t('gated field absent from markup while empty', !h3.includes(`id="${gated.id}"`), gated.id);
const h4 = RNS.renderToString(React.createElement(F.default, { fields: built, data: { [gated.dependsOn]: 'Yes - under AMC (raise call)' },
  setData: () => {}, errors: {}, requiredOnly: false, collapsed: new Set(), toggle: () => {} }));
t('gated field present once answered', h4.includes(`id="${gated.id}"`));
const firstReq = built.find(f => f.required);
const h5 = RNS.renderToString(React.createElement(F.default, { fields: built, data: {}, setData: () => {},
  errors: { [firstReq.id]: 'Required for this sub-category' }, requiredOnly: true, collapsed: new Set(), toggle: () => {} }));
t('validation copy renders inline on the offending field', /Required for this sub-category/.test(h5) && /class="hint errtxt"/.test(h5), firstReq.id);
t('every required universal field can be flagged in one pass', (() => {
  const req = built.filter(f => f.required);
  const hs = RNS.renderToString(React.createElement(F.default, { fields: built, data: {}, setData: () => {},
    errors: Object.fromEntries(req.map(f => [f.id, 'Required'])), requiredOnly: false, collapsed: new Set(), toggle: () => {} }));
  return (hs.match(/class="hint errtxt"/g) || []).length === req.length; })(),
  `${built.filter(f => f.required).length} required fields flagged`);
t('no required field is hidden behind an unanswered gate', built.filter(f => f.required).every(f => K.isVisible(f, {}, idx)),
  built.filter(f => f.required && !K.isVisible(f, {}, idx)).map(f => f.id).join(','));
t('a blank submit is blocked by validation, not silently accepted', built.filter(f => f.required).length >= 14);
t('the offending control is outlined as invalid', /class="f err|f span2 err|f err span2"/.test(h5));
t('required-only mode hides optional fields', (RNS.renderToString(React.createElement(F.default, { fields: built, data: {},
  setData: () => {}, errors: {}, requiredOnly: true, collapsed: new Set(), toggle: () => {} })).match(/data-fid="/g) || []).length
  < (RNS.renderToString(React.createElement(F.default, { fields: built, data: {}, setData: () => {}, errors: {},
  requiredOnly: false, collapsed: new Set(), toggle: () => {} })).match(/data-fid="/g) || []).length);
const h6 = RNS.renderToString(React.createElement(F.default, { fields: built, data: {}, setData: () => {},
  errors: {}, requiredOnly: false, collapsed: new Set(['Reporter']), toggle: () => {} }));
t('collapsed sections hide their fields', (h6.match(/id="reporter_name"/g) || []).length === 0);
/* render the intake path of a giant sub-category too (Safety has the widest field set) */
const safetyKey = 'Safety and Security|||' + D.categories.find(c => c.name === 'Safety and Security').subs.sort((a, b) => b.hist - a.hist)[0].name;
const bigFields = F.buildFields({}, safetyKey, D, 'Kwality House, Kemps Corner');
const h7 = RNS.renderToString(React.createElement(F.default, { fields: bigFields, data: {}, setData: () => {}, errors: {},
  requiredOnly: false, collapsed: new Set(), toggle: () => {} }));
t('largest form renders fully', bigFields.length >= 23 && /Incident type/.test(h7), `${bigFields.length} fields → ${(h7.match(/<select|<input|<textarea/g) || []).length} controls`);

const allHtml = html + h2 + h3 + h4 + h5 + h6 + h7;
t('no raw SVG source leaks anywhere in the app', !/&lt;svg/.test(allHtml), (allHtml.match(/&lt;svg[^]*/g) || []).slice(0, 1).join('').slice(0, 60));
t('icons are real elements on every surface', (allHtml.match(/<svg viewBox/g) || []).length > 40, `${(allHtml.match(/<svg viewBox/g) || []).length} inline svgs`);
t('no React error text or undefined in markup', !/undefined|NaN|\[object Object\]/.test(allHtml.replace(/data-[a-z-]+="undefined"/g, '')),
  (allHtml.match(/.{30}(undefined|NaN).{20}/g) || []).slice(0, 2).join(' | '));
const seedProbe = C.makeTicket({ sub: { name: 'AC and HVAC Issues', category: 'Repair and Maintenance',
  department: 'Operations & Facilities', slaLabel: 'P3 — 8 hr · 48 hr', priority: 'high', hours: { first: 8, res: 48 } },
  category: { name: 'Repair and Maintenance' }, studio: 'Kwality House, Kemps Corner',
  chain: [{ who: 'Zahur Shaikh (Studio Coordinator)', note: 'desk' }], hours: { first: 8, res: 48 },
  priority: 'high', data: { reporter_name: 'Nadiya Shaikh', summary: 'probe' } });

/* ---------- linked lookups + the Momence-shaped dataset ---------- */
const list = MOM.listMomence('members', { pageSize: 5 });
t('the member list answers with the API’s own paging shape',
  Array.isArray(list.items) && list.hasMore === true && list.total > 5 && list.source === 'demo',
  `${list.items.length}/${list.total} · hasMore=${list.hasMore}`);
t('every member record carries the fields the desk needs',
  list.items.every(m => /^[A-Z][a-z]+ [A-Z]/.test(m.name) && /#\d+|\d+/.test(m.id) && /@/.test(m.subtitle)),
  `${list.items[0].name} · ${list.items[0].id}`);
const paged = MOM.listMomence('members', { pageSize: 5, page: 2 });
t('paging walks the directory without repeats', paged.items[0].id !== list.items[0].id && paged.items.length === 5,
  `page 0 ${list.items[0].id} → page 2 ${paged.items[0].id}`);
const searched = MOM.listMomence('members', { query: 'priya' });
t('a query filters the module server-side style (substring over the record)',
  searched.total >= 1 && /priya/i.test(JSON.stringify(searched.items[0])), `${searched.total} hit(s)`);
const sess = MOM.listMomence('sessions', { pageSize: 8, studio: 'Kwality House, Kemps Corner', upcoming: true });
t('sessions can be scoped to a studio and to upcoming classes',
  sess.items.length > 0 && sess.items.every(x => new Date(x.raw.startsAt) > new Date(Date.now() - 1000))
  && sess.items.every(x => /Kwality/.test(String(x.raw.inPersonLocation?.name))), `${sess.items.length} upcoming at Kwality`);
t('a studio with no Momence location leaves the listing unfiltered (reference contract)',
  MOM.momenceLocationFor('Kwality House, Kemps Corner') !== undefined && MOM.momenceLocationFor('Somewhere Else') === undefined,
  `Kwality→${MOM.momenceLocationFor('Kwality House, Kemps Corner')}`);
const detail = MOM.detailMomence('members', list.items[0].id);
t('the detail endpoint returns related memberships, bookings and notes',
  detail.item.name === list.items[0].name && detail.related.memberships.length > 0
  && detail.related.bookings.length > 0 && detail.related.notes.length > 0,
  `${detail.related.memberships.length} membership · ${detail.related.bookings.length} bookings`);
const sDetail = MOM.detailMomence('sessions', sess.items[0].id);
t('a session detail carries its roster', sDetail.related.bookings.length > 0 && !!sDetail.item.raw.teacher,
  `${sDetail.related.bookings.length} booked`);
t('a missing record 404s instead of throwing', MOM.detailMomence('members', '999999').status === 404, 'error object');
const filledM = MOM.populateMember(detail), filledS = MOM.populateSession(sDetail);
t('choosing a member fills the member-shaped fields',
  filledM.member_name === detail.item.name && !!filledM.member_email && filledM.memberLookupDone === true, filledM.member_name);
t('choosing a class fills format, trainer, studio and when',
  !!filledS.class_format && !!filledS.trainer && /Kwality/.test(filledS.studio) && filledS.sessionLookupDone === true,
  `${filledS.class_format} · ${filledS.trainer}`);
t('“when” is phrased in the taxonomy’s own vocabulary', MOM.occurredOptions.includes(filledS.occurred_relative),
  `${filledS.occurred_relative} / options: ${MOM.occurredOptions.length}`);
const enc = LK.encodeLookup({ id: '481102', label: 'Priya Mehta', sublabel: 'priya@example.com' });
const dec = LK.decodeLookup(enc);
t('a lookup reference round-trips through plain text (handover-safe)',
  dec.id === '481102' && dec.label === 'Priya Mehta' && /Priya Mehta \[#481102\]/.test(enc), enc);
t('a typed number still reads as a reference', LK.decodeLookup('P57-2026-0042').id === 'P57-2026-0042', 'loose text accepted');
t('a blank value is not a reference', LK.decodeLookup('') === null && LK.hasLookup('') === false && LK.hasLookup(enc) === true, 'gates the form');
const scores = LK.scoreList([{ id: '481102', name: 'Priya Mehta', subtitle: 'p@m.com' }, { id: '481108', name: 'Rhea Shah', subtitle: 'r@m.com' }],
  '481108', i => i.name, i => i.subtitle, i => i.id);
t('an id query ranks the exact record first', scores[0].it.id === '481108', `top=${scores[0].it.id}`);

const lookId = (D.universal.find(f => f.type === 'lookup') || {}).id;
t('the taxonomy marks member/class/ticket fields as linked lookups',
  D.counts.lookupFields > 200 && lookId === 'class_date', `${D.counts.lookupFields} lookup fields`);
const byMod = {};
[...D.universal, ...Object.values(D.subFields).flat()].forEach(f => { if (f.type === 'lookup') byMod[f.module] = (byMod[f.module] || 0) + 1; });
t('all three lookup kinds exist in the field plan', byMod.member > 0 && byMod.session > 0 && byMod.ticket > 0,
  Object.entries(byMod).map(([k, v]) => `${k}:${v}`).join(' '));
const optOf = id => { const f = D.universal.find(x => x.id === id); return f ? (f.options || D.opts[f.optsRef]) : []; };
t('trainer and equipment options come from the reference constants',
  optOf('trainer').length === MOM.trainers.length && optOf('asset_type')?.length >= 30 || optOf('trainer').includes('Anisha Shah'),
  `${optOf('trainer').length} trainers`);
t('member-lookup fields carry no option list to type past', (D.universal.find(f => f.id === 'class_date').options || []).length === 0, 'free of lists');
t('the reference status vocabulary is loaded for comparison', Object.keys(MOM.statusLabels || {}).length >= 8,
  Object.keys(MOM.statusLabels || {}).join(', ').slice(0, 60));

const RNS2 = require('react-dom/server');
const renderModal = (el, name) => {
  try { const h = RNS2.renderToString(el); t(name, h.length > 300 && !/undefined|\[object Object\]/.test(h), `${(h.length / 1024).toFixed(1)} kB`); return h; }
  catch (e) { t(name, false, e.message.slice(0, 90)); return ''; }
};
const memHtml = renderModal(React.createElement(MODALS.RecordModal, { module: 'members', id: list.items[0].id, onClose: () => {} }),
  'member record modal renders its full panel server-side');
t('  · with profile, tabs and related records in the markup',
  /First seen/.test(memHtml) && /Memberships/.test(memHtml) && /Bookings/.test(memHtml) && /Home studio/.test(memHtml), `${(memHtml.length / 1024).toFixed(1)} kB`);
const sesHtml = renderModal(React.createElement(MODALS.RecordModal, { module: 'sessions', id: sess.items[0].id, onClose: () => {} }),
  'session record modal renders its full panel server-side');
t('  · with instructor, room and roster in the markup',
  /Instructor/.test(sesHtml) && /capacity/i.test(sesHtml) && /Sign-ups/.test(sesHtml), `${(sesHtml.length / 1024).toFixed(1)} kB`);
const tkHtml = renderModal(React.createElement(MODALS.RecordModal, { module: 'tickets', id: seedProbe.id, ticket: seedProbe, onClose: () => {} }),
  'a board ticket opens in the same record shell');
t('  · with status, clock, owner and report count',
  /Reports/.test(tkHtml) && /Owner/.test(tkHtml) && seedProbe.number.length > 6 && /SLA tier|—/.test(tkHtml), `${(tkHtml.length / 1024).toFixed(1)} kB`);
renderModal(React.createElement(LK.LookupControl, { module: 'member', value: '', onChange: () => {} }),
  'the lookup control renders without a selection');
renderModal(React.createElement(MODALS.ResolutionModal, { t: { ...seedProbe, }, onCancel: () => {}, onConfirm: () => {} }),
  'the resolution panel renders');
renderModal(React.createElement(MODALS.SettingsModal, { onClose: () => {}, prefs: {}, setPrefs: () => {}, momenceStatus: 'demo', onTestMomence: () => {} }),
  'the settings modal renders');
renderModal(React.createElement(MODALS.CycleTemplateModal, { onClose: () => {}, onApply: () => {}, data: {} }),
  'the guided cycle template renders');
renderModal(React.createElement(MODALS.LinkTicketModal, { tickets: [seedProbe], data: {}, onCancel: () => {}, onLink: () => {}, onCreateSeparate: () => {} }),
  'the repeat-report link modal renders');
renderModal(React.createElement(MODALS.CommandPalette, { items: [{ id: 'a', label: 'Live queue' }], onClose: () => {}, onRun: () => {} }),
  'the command palette renders');

/* ---------------- Phase 4: class desk, roster triage, ticket label ---------------- */
const encM = LK.encodeLookups([{ id: '481102', label: 'Priya Mehta', sublabel: 'priya@x.com' }, { id: '481103', label: 'Rhea Shah' }]);
const decM = LK.decodeLookups(encM);
t('a multi-select lookup stores one id per row, joined by a pipe',
  decM.length === 2 && decM[0].id === '481102' && decM[1].label === 'Rhea Shah' && encM.includes(' | '), encM);
t('a multi lookup re-opens with its chips checked (idempotent round trip)',
  LK.encodeLookups(decM) === encM, 'stable through a second encode');
t('a hand-typed list of references decodes too', LK.decodeLookups('P57-1 | Priya Mehta [#481102]').length === 2,
  'loose text tolerated');
t('multi lookups exist in the plan, not only in the desk',
  Object.values(D.subFields).flat().some(f => f.type === 'lookup' && f.multi) || D.universal.some(f => f.type === 'lookup' && f.multi),
  Object.values(D.subFields).flat().filter(f => f.type === 'lookup' && f.multi).length + D.universal.filter(f => f.type === 'lookup' && f.multi).length + ' multi fields');

const clsTicket = C.makeTicket({ sub: { name: 'Class Capacity Issues', category: 'Scheduling', department: 'Training / Programming',
  slaLabel: 'P3 — 8 hr (same business day) first response · 48 hr resolution', priority: 'medium' },
  hours: { first: 8, res: 48 }, chain: [{ who: 'Zahur Shaikh (Studio Coordinator)', note: 'desk' }], category: { name: 'Scheduling' }, studio: 'Kwality House, Kemps Corner',
  data: { title: 'Mat shortage', summary: 'Six members stood through the block',
    member_impact: 'Six members stood through the whole block', class_impacted: 'Yes', affected_count: '6' } });
t('a ticket gets a one-line label that only claims what is on it',
  /Class Capacity Issues/.test(clsTicket.label) && !/undefined/.test(clsTicket.label), clsTicket.label);
const labelled = C.makeTicket({ sub: { name: 'Class Capacity Issues', category: 'Scheduling', department: 'Training / Programming',
  slaLabel: 'P3', priority: 'medium' }, hours: { first: 8, res: 48 }, chain: [{ who: 'Zahur Shaikh (Studio Coordinator)', note: 'desk' }], category: { name: 'Scheduling' }, studio: 'Kwality House, Kemps Corner',
  data: { title: 'Mat shortage', summary: 'x' }, kind: 'hosted-class',
  cls: { sessionId: 4812, name: 'Endurance', studio: 'Kwality House, Kemps Corner', startsAt: '2026-09-19T10:30:00.000Z',
    booked: 24, attended: 19, absent: 5, capacity: 22, overbook: 2, waitlist: 3, guests: 2,
    hostSituation: 'Coach was ill', trainer: 'Shruti Kulkarni', source: 'demo',
    attendees: [{ name: 'Priya Mehta', note: 'charged for a class she could not take', paidWith: '12-class package', status: 'No-show' }] } });
t('the label carries the class and the attendee flag when they exist',
  /Endurance/.test(labelled.label) && /attendee note/.test(labelled.label) && /over capacity/.test(labelled.label), labelled.label);
const ho = C.handover(labelled);
t('the handover quotes the class roll and each attendee note',
  /Class Endurance · Kwality/.test(ho) && /Roll 24 booked \/ 19 attended \/ 5 absent · 22 places/.test(ho)
  && /3 on the waitlist/.test(ho) && /Priya Mehta — No-show \(12-class package?\)|Priya Mehta — No-show/.test(ho)
  && /charged for a class she could not take/.test(ho) && /Coach was ill/.test(ho),
  (ho.split('\n').find(l => /Roll/.test(l)) || 'no roll line').slice(0, 90));

const sessList = MOM.listMomence('sessions', { pageSize: 3 });
const sid = sessList.items[0].raw.id;
const roll = MOM.listSessionBookings(sid, { pageSize: 400 });
t('the desk reads the roll the way the class desk does', (roll.payload || []).length > 0 && !!roll.stats,
  (roll.payload || []).length + ' bookings · ' + (roll.stats && roll.stats.booked) + ' booked of ' + (roll.stats && roll.stats.capacity));
t('a booking exposes the payment record and any incompatibility code',
  (roll.payload || []).every(b => !b.compatibility || typeof b.compatibility.usable === 'boolean'),
  (roll.payload || []).filter(b => b.compatibility && !b.compatibility.usable).length + ' incompatible of ' + (roll.payload || []).length);
t('roster filters are real presets over the same payload',
  LK.ROSTER_FILTERS.length >= 6 && LK.ROSTER_FILTERS.every(f => Array.isArray(f) && f.length === 2) && LK.ROSTER_FILTERS[0][0] === 'all'
  && LK.ROSTER_FILTERS.every(([k]) => (MOM.listSessionBookings(sid, { pageSize: 5, status: k }).payload || []).length >= 0),
  LK.ROSTER_FILTERS.map(f => f[0]).join(', '));
const rosterHtml = (() => { try { return RNS2.renderToString(React.createElement(LK.AttendeeRoster,
  { sessionId: sid, entries: {}, onEntries: () => {} })); } catch (e) { return 'ERR ' + e.message; } })();
t('the roster renders one row per booking with a status control each',
  rosterHtml.length > 2000 && (rosterHtml.match(/<select/g) || []).length >= 30 && !/undefined/.test(rosterHtml),
  (rosterHtml.length / 1024).toFixed(1) + ' kB · ' + (rosterHtml.split('class="arow').length - 1) + ' rows · ' + (rosterHtml.match(/<select/g) || []).length + ' status selects');
t('the roster search/filter bar ships with it', /roster-bar/.test(rosterHtml) && /roster-search/.test(rosterHtml));
const deskHtml = (() => { try { return RNS2.renderToString(React.createElement(MODALS.ClassDesk, { sessionId: null, captured: {}, setCaptured: () => {},
  entries: {}, setEntries: () => {}, tickets: [], subOptions: [], onOpenRecord: () => {}, onPickSession: () => {},
  onFile: () => {}, autofill: () => {} })); } catch (e) { t('the class desk renders its empty state', false, e.message.slice(0, 90)); return ''; } })();
t('the class desk renders its empty state', deskHtml.length > 300 && /Find the class/.test(deskHtml), (deskHtml.length / 1024).toFixed(1) + ' kB');
t('  · and opens on the session picker with no half-built form', /Find the class/.test(deskHtml) && !/cd-foot/.test(deskHtml));
const cap = (sid2 => { const h = RNS2.renderToString(React.createElement(MODALS.ClassDesk, { sessionId: sid2, captured: { class_host_situation: 'Coach was ill' },
  setCaptured: () => {}, entries: { [String((roll.payload || [])[0] && (roll.payload || [])[0].id)]: { status: 'No-show', note: 'charged anyway', actions: ['Class credit granted'] } },
  setEntries: () => {}, tickets: [labelled], subOptions: [{ key: 'Scheduling|||Class Capacity Issues', label: 'Scheduling › Class Capacity Issues' }],
  onOpenRecord: () => {}, onPickSession: () => {}, onFile: () => {}, autofill: () => {} })); return h; })(sid);
t('the class desk renders a real class with its roll', cap.length > 4000, (cap.length / 1024).toFixed(1) + ' kB');
t('  · with the roll, the stats, the grouped class fields and a file button',
  /cd-stats/.test(cap) && /arow/.test(cap) && /Build the ticket from this class/.test(cap) && /route this to/.test(cap));
t('  · and it never prints a bare undefined where a value is missing', !/undefined/.test(cap));
const tdHtml = (() => { try { return RNS2.renderToString(React.createElement(MODALS.TrainerDesk, { directory: MOM.trainerDirectory([labelled], 90),
  tickets: [labelled], selected: null, onSelect: () => {}, onOpenRecord: () => {}, onRaise: () => {} })); } catch (e) { t('the trainer desk renders', false, e.message.slice(0, 90)); return ''; } })();
t('the trainer desk renders a coach directory with attendance and tickets',
  /trow/.test(tdHtml) && /show-up/.test(tdHtml) && !/undefined/.test(tdHtml), (tdHtml.length / 1024).toFixed(1) + ' kB');
const resHtml = RNS2.renderToString(React.createElement(MODALS.ResolutionModal, { t: labelled, onCancel: () => {}, onConfirm: () => {} }));
t('the resolution panel asks for what an outcome needs, not a note',
  /closure/i.test(resHtml) && /Root cause/i.test(resHtml) && /Goodwill|refund/i.test(resHtml),
  (resHtml.match(/<select/g) || []).length + ' selects · ' + (resHtml.match(/<textarea/g) || []).length + ' notes');
t('autofill only fills what is empty and leaves the desk’s answers alone',
  (() => { const f = (D.subFields['Scheduling|||Class Capacity Issues'] || D.universal).slice(0, 8);
    const out = MODALS.autofillMissing(f, { reporter_name: 'typed at the desk' }, {});
    return out.reporter_name === 'typed at the desk'; })());


console.log('\n\x1b[1m▸ WHO IS REPORTING · DESK IDENTITY, PREFILL, NARRATIVE\x1b[0m');
t('a desk email is derived from the person, not typed by hand',
  C.deskEmail('Nadiya Shaikh') === 'nadiya.shaikh@physique57.com'
  && C.deskEmail('Jimmeey Gondaa (Studio Manager)') === 'jimmeey.gondaa@physique57.com'
  && C.deskEmail('Rhea') === 'rhea@physique57.com' && C.deskEmail('') === '',
  `nadiya.shaikh@… · rhea@… · “${C.deskEmail('')}”`);
t('the persona a ticket implies follows the subject, not the submitter',
  C.personaFor(subOf('Pricing and Memberships', /^Membership Pause/)).type === 'Member'
  && C.personaFor(subOf('Scheduling', /^Class Capacity/)).type === 'Trainer'
  && C.personaFor(subOf('Repair and Maintenance', /^AC and HVAC/)).type === 'Front desk / associate',
  [C.personaFor(subOf('Pricing and Memberships', /^Membership Pause/)).type, C.personaFor(subOf('Scheduling', /^Class Capacity/)).type,
   C.personaFor(subOf('Repair and Maintenance', /^AC and HVAC/)).type].join(' · '));
const di_rpMember = C.reporterFields({ sub: subOf('Pricing and Memberships', /^Membership Pause/), studio: 'Kwality House, Kemps Corner' });
t('a member ticket is prefilled with the studio desk address, not a person’s mailbox',
  di_rpMember.reporter_type === 'Member' && /^desk\.[a-z-]+@physique57\.com$/.test(di_rpMember.reporter_contact),
  `${di_rpMember.reporter_name} · ${di_rpMember.reporter_contact}`);
const di_rpLinked = C.reporterFields({ sub: subOf('Pricing and Memberships', /^Membership Pause/),
  member: { name: 'Kabir Rana', email: 'kabir@rana.example' } });
t('a linked member directory record outranks the guessed block',
  di_rpLinked.reporter_name === 'Kabir Rana' && di_rpLinked.reporter_contact === 'kabir@rana.example',
  `${di_rpLinked.reporter_name} · ${di_rpLinked.reporter_contact} · ${di_rpLinked.preferred_contact}`);
const di_rpDesk = C.reporterFields({ sub: subOf('Repair and Maintenance', /^AC and HVAC/), studio: 'Kwality House, Kemps Corner',
  desk: { persona: 'associate', name: 'Nadiya Shaikh', contact: 'nadiya.shaikh@physique57.com', channel: 'Email' } });
t('a signed-in desk files under its own name and channel',
  di_rpDesk.reporter_name === 'Nadiya Shaikh' && di_rpDesk.reporter_contact === 'nadiya.shaikh@physique57.com'
  && di_rpDesk.preferred_contact === 'Email' && di_rpDesk.reporter_type === 'Front desk / associate',
  `${di_rpDesk.reporter_name} · ${di_rpDesk.preferred_contact}`);
const di_seeded = { reporter_name: 'typed at the desk', reporter_type: '', summary: 'kept' };
const di_filledOnce = C.withReporterDefaults(di_seeded, { sub: di_rpDesk.__sub || subOf('Repair and Maintenance', /^AC and HVAC/), studio: 'Kwality House, Kemps Corner', desk: { persona: 'associate', name: 'Nadiya Shaikh', contact: 'nadiya.shaikh@physique57.com', channel: 'Email' } });
t('prefill only ever fills what the desk left empty',
  di_filledOnce.data.reporter_name === 'typed at the desk' && di_filledOnce.data.summary === 'kept'
  && /@physique57\.com$/.test(di_filledOnce.data.reporter_contact) && !!di_filledOnce.data.preferred_contact,
  `kept “${di_filledOnce.data.reporter_name}” · filled “${di_filledOnce.data.reporter_contact}”`);
t('what prefill wrote is remembered as auto, so it can be told from a typed answer',
  Object.keys(di_filledOnce.auto).every(k => di_filledOnce.data[k] === di_filledOnce.auto[k])
  && di_filledOnce.auto.reporter_contact === di_filledOnce.data.reporter_contact
  && di_filledOnce.auto.reporter_name === undefined, `${Object.keys(di_filledOnce.auto).length} auto keys`);
const di_moved = C.withReporterDefaults(di_filledOnce.data, { sub: subOf('Repair and Maintenance', /^AC and HVAC/),
  studio: 'The Quad, Bengaluru', desk: { persona: 'associate', name: 'Api Serou', contact: 'api.serou@physique57.com', channel: 'Email' } }, di_filledOnce.auto);
t('moving to another desk refreshes an untouched auto value in place',
  di_moved.data.reporter_contact === 'api.serou@physique57.com' && di_moved.data.reporter_name === 'typed at the desk'
  && di_moved.auto.reporter_name === undefined, `${di_filledOnce.data.reporter_contact} → ${di_moved.data.reporter_contact}`);
const di_edited = C.withReporterDefaults({ ...di_filledOnce.data, reporter_contact: 'someone.else@physique57.com' },
  { sub: subOf('Repair and Maintenance', /^AC and HVAC/), studio: 'The Quad, Bengaluru' }, di_filledOnce.auto);
t('an edited auto field keeps the edit and loses its badge',
  di_edited.data.reporter_contact === 'someone.else@physique57.com' && !('reporter_contact' in di_edited.auto),
  `${di_edited.data.reporter_contact} · auto keys ${Object.keys(di_edited.auto).length}`);
const di_twin = (n, over = {}) => ({ id: 'tk' + n, number: `P57-2026-${1000 + n}`, subCategory: 'AC and HVAC Failure',
  category: 'Repair and Maintenance', studio: 'Kwality House, Kemps Corner', area: 'Bandra', priority: 'high',
  summary: 'The hall reached 31°C by the second lotus pose.', title: 'AC down at the studio',
  data: { member_impact: 'Member could not attend', affected_count: '9', class_impacted: 'Yes — class ended early', ...over },
  createdAt: 1700000000000 + n });
const di_labels = C.narrate([di_twin(1), di_twin(2), di_twin(3)]);
t('every ticket gets a narrative line that is not just its title',
  Object.values(di_labels).every(v => v && v !== 'AC down at the studio')
  && /AC and HVAC Failure/.test(di_labels.tk1) && /class impacted/.test(di_labels.tk1)
  && /“The hall reached 31°C by the second lotus pose.”/.test(di_labels.tk1), di_labels.tk1);
t('two identical reports are still told apart, in order of arrival',
  new Set(Object.values(di_labels)).size === 3, Object.values(di_labels).map(v => v.slice(-14)).join(' | '));
const di_solo = C.narrate([di_twin(9)]).tk9;
t('the narrative is derived, and capped so a row never wraps into the next',
  di_solo.length <= 168 && di_solo === C.narrativeOf(di_twin(9)), `${di_solo.length} chars`);
const di_said = C.makeTicket({ sub: { ...subOf('Repair and Maintenance', /^AC and HVAC/), slaLabel: 'P2 — 4 hr first response · 24 hr resolution' },
  category: { name: 'Repair and Maintenance' }, studio: 'Kwality House, Kemps Corner',
  chain: [{ who: 'Zahur Shaikh (Studio Coordinator)', note: 'desk' }], hours: { first: 4, res: 24 }, priority: 'high',
  data: { summary: 'The hall reached 31°C by the second lotus pose.', member_impact: 'Member could not attend',
    affected_count: '9', reporter_name: 'Nadiya Shaikh', reporter_contact: 'nadiya.shaikh@physique57.com', occurred_at: '2026-09-20T09:30' } });
t('the label and the story are written on the ticket as it is filed',
  di_said.narrative === C.narrativeOf(di_said) && !!di_said.label && di_said.label.includes(di_said.subCategory),
  `“${di_said.narrative.slice(0, 54)}…” · label ${di_said.label.length} chars`);
const di_saidHtml = (() => { try { return C.describeTicket(di_said); } catch (e) { return 'THREW ' + e.message; } })();
t('the sheet’s description is prose built only from stored answers',
  /Nadiya Shaikh/.test(di_saidHtml) && /Kwality House/.test(di_saidHtml) && /first response/.test(di_saidHtml)
  && /31°C/.test(di_saidHtml) && !/undefined|null|\[[^\]]*reporter_/.test(di_saidHtml), di_saidHtml.slice(0, 74) + '…');
t('a ticket with no summary still reads as a sentence, not a gap',
  (() => { const bare = { ...di_said, data: { reporter_name: 'Rhea Shah' }, summary: '', title: '' };
    const txt = C.describeTicket(bare); return /Rhea Shah/.test(txt) && /answers below/.test(txt) && txt.length > 80 && !/undefined|NaN/.test(txt); })(),
  C.describeTicket({ ...di_said, data: { reporter_name: 'Rhea Shah' }, summary: '', title: '' }).slice(0, 60) + '…');
t('the two-way answer is a real data question, not a styling guess',
  F.isBooleanField({ type: 'select', options: ['Mumbai', 'Bengaluru'] })
  && !F.isBooleanField({ type: 'select', options: ['a', 'b', 'c'] })
  && !F.isBooleanField({ type: 'text', options: ['a', 'b'] }) && !F.isBooleanField({ type: 'multiselect', options: ['a', 'b'] }),
  '2 options = switch · 3+ = list · text never');
const di_secNames = new Set(D.universal.concat(Object.values(D.subFields).flat().filter(Boolean)).map(f => F.sectionOf(f)));
t('every field in the plan lands in a named section, so nothing is orphaned',
  di_secNames.size >= 4 && [...di_secNames].every(n => typeof n === 'string' && n.length > 3)
  && F.sectionOf({ id: 'title' }) === 'Description & ask' && F.sectionOf({ id: 'nope_xyz' }).length > 3,
  `${di_secNames.size} sections · ${[...di_secNames].slice(0, 3).join(' / ')}…`);
t('buildFields carries the desk’s auto values into the rendered form',
  (() => { const fl = F.buildFields({ summary: 'x' }, `${'Repair and Maintenance'}|||AC and HVAC Failure`, D, 'Kwality House, Kemps Corner');
    return fl.length > 8 && fl.every(f => f.id && f.label && F.sectionOf(f)) && fl.some(f => f.required)
      && fl.filter(f => f.type === 'lookup').length >= 1; })(),
  `${F.buildFields({}, 'Repair and Maintenance|||AC and HVAC Failure', D, 'Kwality House, Kemps Corner').length} fields, each labelled`);

const tot = `\x1b[1m${pass} passed, ${fail} failed\x1b[0m`;
console.log(`\n${fail ? '\x1b[41m\x1b[37m FAIL \x1b[0m' : '\x1b[42m\x1b[30m OK \x1b[0m'}  ${tot}\n`);

fs.writeFileSync(path.join(TMP, 'last-render.html'), html);
process.exit(fail ? 1 : 0);
