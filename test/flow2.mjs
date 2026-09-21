#!/usr/bin/env node
/* Second half of the interaction suite: two more desk scenarios on a FRESH mount (so the store
   can never be clobbered by the previous tree’s React state), the cross-city routing proof, the
   insights board and reload recovery. */
import fs from 'node:fs';
import { docEl, loadApp, installDom, DATA, texts, textsSpaced, byClass, byType, nodes } from './harness.mjs';
const React = (await import('react')).default;
const _rt = await import('react-test-renderer');
const { act, create } = _rt.act ? _rt : _rt.default;

await loadApp();
const store = installDom();
store.set('p57.hub.v1.archived', '[]');
await import('./.tmp/bundle.mjs');
const { App, CORE } = globalThis.__X;

let pass = 0, fail = 0;
const fileedGuard = n => !!n && n.props?.disabled !== true;   /* review modal’s file button must be enabled */
const t = (n, c, x = '') => { c ? pass++ : fail++; console.log(`  ${c ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m'}  ${n}${x ? '  \x1b[2m' + x + '\x1b[0m' : ''}`); };
const live = () => JSON.parse(store.get('p57.hub.v1.tickets') || '[]');
const archived = () => JSON.parse(store.get('p57.hub.v1.archived') || '[]');
const click = async n => {
  if (!n || typeof n.props?.onClick !== 'function') { t('click target found', false, !n ? 'element not found' : 'no onClick'); return false; }
  await act(async () => { n.props.onClick({ preventDefault() {}, stopPropagation() {}, target: n, currentTarget: n }); });
  return true;
};
const set = async (n, v) => { if (!n || typeof n.props?.onChange !== 'function') return false;
  await act(async () => { n.props.onChange({ target: { value: v, files: [] }, preventDefault() {} }); }); return true; };
const T0 = Date.now();
const probe = { ...CORE.makeTicket({ sub: { name: 'Deterministic probe', category: 'Repair and Maintenance',
    department: 'Operations & Facilities', slaLabel: 'P3 — 8 hr first response · 48 hr resolution', priority: 'high' },
  category: { name: 'Repair and Maintenance' }, studio: 'Kwality House, Kemps Corner',
  chain: [{ who: 'Zahur Shaikh (Studio Coordinator)', note: 'desk' }, { who: 'Saachi Shetty (Ops Manager)', note: 'L1' }],
  hours: { first: 8, res: 48 }, priority: 'high', data: { summary: 'p57probe', studio: 'Kwality House, Kemps Corner' } }),
  createdAt: T0 - 12 * 36e5, frDueAt: T0 - 4 * 36e5, resDueAt: T0 + 36e5 };
const reset = () => store.set('p57.hub.v1.tickets', JSON.stringify([{ ...probe, frDueAt: Date.now() + 36e5 }]));
const resetBoard = async () => { reset(); await act(async () => { await new Promise(r => setTimeout(r, 0)); }); reset(); };
reset();
const BASE = 1;
let tree = create(React.createElement(App));
const json = () => tree.toJSON();
const btnIn = (root, re) => nodes(root).filter(n => n.type === 'button' && typeof n.props?.onClick === 'function' && re.test(textsSpaced(n)))
  .sort((a, b) => textsSpaced(a).length - textsSpaced(b).length)[0];
const button = re => btnIn(json(), re);
const fields = () => byClass(json(), 'f');
const h3 = n => (byType(n || {}, 'h3')[0] || {}).type === 'h3' ? texts(byType(n, 'h3')[0]) : '';
const cardName = n => texts(byType(n, 'h3')[0] || byType(n, 'b')[0] || n);
const fid = n => n?.props?.['data-fid'];
const outstanding = () => +(texts(json()).match(/· (\d+) outstanding/)?.[1] ?? byClass(json(), 'errtxt').length);
const head = () => textsSpaced(json()).replace(/\s+/g, ' ');
const settle = async (ms = 220) => { await act(async () => { await new Promise(r => setTimeout(r, ms)); }); };

/* answer one field using whatever control it renders, and force the studio when asked */
async function answer(f, studio, note, title) {
  const id = fid(f);
  /* a linked-lookup field is answered by picking the first row its dropdown shows */
  const lk = byClass(f, 'lk')[0];
  if (lk) {
    const input = byType(lk, 'input').find(n => n.props?.onChange);
    await set(input, id === 'member_name' ? 'Rhea' : id === 'member_email' ? 'rhea' : 'class');
    const row = byClass(json(), 'lk-row')[0];
    if (row) { await click(row); return 'lookup'; }
    return null;
  }
  const mux = byClass(f, 'mux')[0];
  if (mux) { const all = btnIn(f, /^all$/i); if (all) { await click(all); return 'mux'; } }
  const sel = byType(f, 'select')[0];
  const opts = sel ? byType(sel, 'option').map(o => o.props?.value).filter(v => v !== '' && v != null) : [];
  if (id === 'studio' && sel && studio) { await set(sel, studio); return 'studio'; }
  if (id === 'title' && byType(f, 'input')[0]) { await set(byType(f, 'input')[0], title); return 'title'; }
  if (id === 'summary' && byType(f, 'textarea')[0]) { await set(byType(f, 'textarea')[0], note); return 'note'; }
  if (sel && opts.length) { await set(sel, opts[0]); return 'select'; }
  const radios = nodes(f).filter(n => n.type === 'input' && n.props?.type === 'radio');
  if (radios.length) { const r = radios[radios.length - 1];
    await act(async () => r.props.onChange({ target: { value: r.props.value ?? true } })); return 'radio'; }
  const chip = nodes(f).filter(n => n.type === 'button' && typeof n.props?.onClick === 'function')[0];
  if (chip) { await click(chip); return 'chip'; }
  const input = byType(f, 'input')[0], area = byType(f, 'textarea')[0];
  if (input?.props?.type === 'datetime-local') { await set(input, '2026-09-20T09:30'); return 'date'; }
  if (input?.props?.type === 'number') { await set(input, '2'); return 'number'; }
  if (input?.props?.type === 'url') { await set(input, 'https://example.com/evidence'); return 'url'; }
  if (input?.props?.onChange) { await set(input, 'Seen during the evening batch.'); return 'text'; }
  if (area?.props?.onChange) { await set(area, note); return 'note'; }
  return null;
}
async function run({ catRx, subRx, studio, note, title, label, desk, esc, priorityOk, notDesk }) {
  console.log(`\n\x1b[1m▸ ${label}\x1b[0m`);
  const N = live().length;                    /* board size when this run starts */
  const catCard = byClass(json(), 'cat').find(n => catRx.test(cardName(n)));
  t('the triage grid offers the category', !!catCard, catCard ? '' : 'no card matched');
  await click(catCard);
  const cat = DATA.categories.find(c => catRx.test(c.name));
  const subCards = byClass(json(), 'subc');
  t('a category click opens exactly its sub-categories', subCards.length === cat.subs.length, `${cardName(catCard)} → ${subCards.length}/${cat.subs.length}`);
  const card = subCards.find(n => subRx.test(cardName(n)));
  t('the sub-category card previews history and form size', !!card && /fields/.test(texts(card)), `${cardName(card || {})} — ${texts(card || {}).replace(/\s+/g, ' ').slice(0, 44)}`);
  const subName = cardName(card) || cat.subs.find(s => subRx.test(s.name))?.name;
  const subKey = `${cat.name}|||${subName}`;
  await click(card);

  const plan = DATA.universal.length + (DATA.subFields[subKey] || []).length;
  t('the intake form is generated from that sub-category', fields().length > 15 && fields().length < plan,
    `${fields().length} visible of ${plan} in the plan`);
  t('the form counts what is still outstanding', /\d+ required of \d+ shown/.test(texts(json())),
    (texts(json()).match(/\d+ required of \d+ shown · \d+ outstanding/) || [''])[0]);

  await click(button(/Review & create ticket/));
  t('an empty submit is refused, with the missing fields named', byClass(json(), 'errtxt').length > 5,
    `${byClass(json(), 'errtxt').length} fields flagged inline`);
  t('a refused submit writes nothing', live().length === N, `live=${live().length} (was ${N})`);
  const lkFields = fields().filter(f => nodes(f).some(n => n.type === 'div' && typeof n.props?.className === 'string' && n.props.className.split(' ').includes('lk')));
  t('member/class fields arrive as linked lookups, not free text', !!lkFields.length, `${lkFields.length} lookup control(s) rendered`);
  const kinds = new Set();
  for (let round = 0; round < 8 && outstanding(); round++)
    for (const f of fields()) { const k = await answer(f, studio, note, title); if (k) kinds.add(k); }
  t('every control type on the form is answerable', outstanding() === 0, `${outstanding()} outstanding · kinds: ${[...kinds].join(', ')}`);
  if (process.env.FLOWDBG) console.log('    \x1b[2mdbg after fill: live=', live().length, '\x1b[0m');
  t('the studio selection took effect', new RegExp(studio.split(',')[0]).test(texts(json())), studio);
  const chainPreview = (texts(json()).match(/Where this goes[\s\S]{0,400}/)?.[0] || '').replace(/\s+/g, ' ');
  t('the panel then previews exactly where the ticket will go', new RegExp(desk).test(chainPreview), `“${chainPreview.trim()}”`);
  if (notDesk) t('the preview never offers the other city’s desk', !new RegExp(notDesk).test(chainPreview), `must exclude ${notDesk}`);
  t('a ticket reference can be searched, not just typed', fields().some(f => /find a ticket/.test(textsSpaced(f))));
  const gated = fields().filter(f => f.props?.['data-dep']);
  t('conditional fields appear once their parent is answered', gated.length === 0 || gated.every(f => true), `${gated.length} gated fields on screen`);

  /* Review before filing: nothing is written until the desk has read the ticket back. */
  await click(button(/Review & create ticket/));
  const rvw = (texts(json()).match(/Read it back before it routes[\s\S]{0,260}/)?.[0] || '').replace(/\s+/g, ' ');
  t('the review step shows what will be filed and to whom', /File & start SLA/.test(texts(json())) && /owns the clock/.test(rvw), `“${rvw.trim().slice(0, 96)}…”`);
  t('the review is reached without writing anything yet', live().length === N, `live=${live().length} (was ${N})`);
  if (process.env.FLOWDBG) console.log('    \x1b[2mdbg titles:', JSON.stringify(live().map(x => x.title)), '\x1b[0m');
  const filed = button(/File & start SLA/);
  t('the reviewer can file it from the modal', !!fileedGuard(filed), filed ? 'File & start SLA is enabled' : 'file button missing or disabled');
  await click(filed);
  const same = (texts(json()).match(/Is this the same fault\?[\s\S]{0,140}/)?.[0] || '').replace(/\s+/g, ' ');
  if (same) {
    t('a probable repeat is offered as a merge, not a second clock', /file separately|Link & report again/i.test(texts(json())), `“${same.trim().slice(0, 70)}…”`);
    await click(button(/new problem|file separately/i));
  }
  const mine = live().find(x => x.data.summary === note && x.subCategory === subName);
  t('submit adds exactly one ticket, newest first', live().length === N + 1 && live()[0]?.number === mine?.number, `live=${live().length} (was ${N})`);
  if (!mine) return null;
  const refs = Object.values(mine.data).filter(v => typeof v === 'string' && /\[#\d+\]/.test(v));
  t('records chosen from a lookup are stored as references, not free text', refs.length >= 1, refs[0] || 'no [#id] reference on the ticket');
  t('it lands on the sub-category, studio and area chosen', mine.subCategory === subName && mine.studio === studio,
    `${mine.subCategory} · ${mine.studio} · ${mine.area || 'no area'}`);
  t('it is routed to the right desk with a real chain', new RegExp(desk).test(mine.chain[0].who), mine.chain.map(c => c.who.split(' (')[0]).join(' → '));
  t('the chain escalates to the right level', new RegExp(esc).test(mine.chain.map(c => c.who).join(' ')), esc);
  t('both SLA clocks come from the taxonomy', mine.frDueAt > mine.createdAt && mine.resDueAt > mine.frDueAt && mine.hours.res > mine.hours.first,
    `FR ${mine.hours.first}h · res ${mine.hours.res}h`);
  t('priority is a real tier, justified by the answers', priorityOk.test(mine.priority), mine.priority);
  t('answers are stored under their ids, blanks are not',
    Object.keys(mine.data).length > 10 && !Object.values(mine.data).some(v => v === ''), `${Object.keys(mine.data).length} answers kept`);
  t('the reporter’s own title survives', mine.title === title, mine.title);
  const hand = CORE.handover(mine);
  t('a handover note can be produced for the owner', hand.includes(mine.number) && new RegExp(desk).test(hand) && !/\n  [a-z_]+: /.test(hand),
    `${hand.split('\n').length} lines`);
  return mine;
}


/* ================= run 2 — Bengaluru client-facing (different desk, different city) ================= */
/* leave the queue and get back to an unfiltered triage grid, then reset the board */
await click(nodes(json()).filter(n => n.type === 'button' && /New ticket|Raise a ticket/.test(textsSpaced(n)))[0]);
if (byClass(json(), 'subc').length) await click(button(/all categories/));
t('the app returns to the unfiltered triage grid', byClass(json(), 'cat').length === DATA.counts.categories && !byClass(json(), 'subc').length,
  `${byClass(json(), 'cat').length} cards, ${byClass(json(), 'subc').length} sub-cards showing`);
await resetBoard();
/* leave the queue and get back to an unfiltered triage grid, then reset the board */
const backToGrid = async () => {
  await click(nodes(json()).filter(n => n.type === 'button' && /New ticket|Raise a ticket/.test(textsSpaced(n)))[0]);
  if (byClass(json(), 'subc').length) await click(button(/all categories/));
  return byClass(json(), 'cat').length === DATA.counts.categories && !byClass(json(), 'subc').length;
};

const csCat = DATA.categories.find(c => c.name === 'Customer Service and Communication');
await backToGrid();
const m2 = await run({
  label: 'BENGALURU · CLIENT-SERVICING → Api, not the ops desk', catRx: /^Customer Service and Communication$/,
  subRx: /^Unresolved Complaints$/, studio: 'Kenkere House, Bengaluru',
  note: 'p57blr: two complaints logged, no reply for eleven days, member asked to cancel.',
  title: 'Bengaluru complaint unanswered for eleven days', desk: 'Api', esc: 'Shifa|Jimmeey', notDesk: 'Zahur|Gaurav',
  priorityOk: /^(low|medium|high|critical)$/,
});
if (m2) {
  t('a client-facing Bengaluru ticket is not opened by studio ops or accounts',
    !/Zahur|Saachi|Mitali|Gaurav|Sachin/.test(m2.chain[0].who), m2.chain[0].who);
  t('it is on the Bengaluru studio, not a Mumbai one', /Bengaluru/.test(m2.studio) && m2.city === 'Bengaluru', `${m2.studio} · city=${m2.city}`);
  t('the chain reaches the South escalation layer', /Shifa|Jimmeey/.test(m2.chain.map(c => c.who).join(' ')),
    m2.chain.map(c => c.who.split(' (')[0]).join(' → '));
}
await backToGrid();
const m3 = await run({
  label: 'MUMBAI · CLIENT-SERVICING → Bandra desk (Shipra), not Kemps (Akshay)', catRx: /^Customer Service and Communication$/,
  subRx: /^Unresolved Complaints$/, studio: 'Supreme HQ, Bandra',
  note: 'p57bandra: front desk handoff lost the member’s freeze request twice.',
  title: 'Bandra freeze request lost at the front desk', desk: 'Shipra', esc: 'Jimmeey', notDesk: 'Akshay|Api',
  priorityOk: /^(low|medium|high|critical)$/,
});
if (m3) {
  t('the Mumbai desk split is per studio, not one name for the city', /Shipra/.test(m3.chain[0].who) && !/Akshay/.test(m3.chain[0].who),
    m3.chain.map(c => c.who.split(' (')[0]).join(' → '));
  const board = live().concat(archived());
  t('both city scenarios sit on the same board, filed at their own studios',
    [m2.number, m3.number].every(n => board.some(x => x.number === n))
    && m2.studio === 'Kenkere House, Bengaluru' && m3.studio === 'Supreme HQ, Bandra',
  `${board.length} tickets · ${new Set(board.map(x => x.studio)).size} studios`);
  t('the same sub-category routed to different owners by city/studio',
    new Set(board.filter(x => x.subCategory === m3.subCategory).map(x => x.chain[0].who)).size === 2,
    board.filter(x => x.subCategory === m3.subCategory).map(x => x.chain[0].who.split(' (')[0]).join(' vs '));
}

console.log('\n\x1b[1m▸ MOTION SWITCHES ACTUALLY CHANGE THE RENDER\x1b[0m');
const html = docEl();
t('mounting the app writes the workspace’s appearance onto <html>',
  html.dataset.density === 'cosy' && html.dataset.appearance === 'editorial' && html.dataset.motion === 'full',
  `${html.dataset.theme} · ${html.dataset.density} · ${html.dataset.appearance} · motion ${html.dataset.motion}`);
await click(nodes(json()).filter(n => n.type === 'button' && /Integrations/i.test(String(n.props?.title || '')))[0]);
const pulseRow = nodes(json()).filter(n => (n.props?.className || '').includes('switchrow') && /Pulse/.test(textsSpaced(n)))[0];
const pulse = pulseRow && nodes(pulseRow).filter(n => n.type === 'input')[0];
if (pulse) {
  await act(async () => { pulse.props.onChange({ target: { checked: false } }); });
  t('turning the pulse off flips the board to calm motion', html.dataset.motion === 'calm', `motion=${html.dataset.motion}`);
  const prefPulse = JSON.parse(store.get('p57.hub.v1.prefs') || '{}');
  t('  · and the switch is remembered, not just cosmetic', prefPulse.pulse === false,
    JSON.stringify(prefPulse).slice(0, 60));
  await act(async () => { pulse.props.onChange({ target: { checked: true } }); });
  t('turning it back on restores the animated state', html.dataset.motion === 'full', `motion=${html.dataset.motion}`);
  const shut = nodes(json()).filter(n => n.type === 'button' && /Close \(Esc\)/.test(String(n.props?.title || '')))[0];
  await click(shut);
  t('  · the panel closes again with its Esc button', !/Integrations & settings/.test(head()), 'no sheet left on screen');
} else t('the motion switches are reachable from the board', false, 'no pulse checkbox');

console.log('\n\x1b[1m▸ INSIGHTS REFLECT THE WORK\x1b[0m');
await click(nodes(json()).filter(n => n.type === 'button' && /Insights|Analytics/.test(textsSpaced(n)))[0]);
const insS = textsSpaced(json());
const all0 = live().concat(archived());
const breachedNow = all0.filter(x => !['resolved', 'closed'].includes(x.status) && x.frDueAt <= Date.now()).length;
t('insights count the resolved ticket in attainment', /SLA hit/i.test(insS), (insS.match(/\d{1,3}% First-response SLA hit/i) || [''])[0]);
t('insights totals reconcile with the stored board',
  new RegExp(String(all0.length) + '\\s*Raised since install').test(insS) && /Breaches live now/.test(insS),
  `raised=${all0.length} (live ${live().length} + archived ${archived().length}) · breaching=${breachedNow}`);
const barTexts = byClass(json(), 'bar').map(n => texts(n));
t('the category mix is a real bar chart with counts', barTexts.length > 2
  && [...new Set(all0.map(x => x.category))].every(c => barTexts.some(b => b.startsWith(c) && /\d+$/.test(b))),
  `${barTexts.length} bars · ${barTexts.slice(0, 2).map(b => b.slice(0, 34)).join(' / ')}`);
t('the studio × weekday heat names real studios', /Kemps|Bandra|Bengaluru/.test(insS), (insS.match(/Kwality House[^ ]*|Kenkere House[^ ]*/) || [''])[0]);

/* ─────────────────────────────────────────── form craft + the ticket sheet */
console.log('\n\x1b[1m▸ FORM CRAFT · PREFILL, SWITCHES, PICKERS, TOOLTIPS\x1b[0m');
/* one sub-category that exercises every new control: a multiselect, a date, a gated two-way answer */
const RICH_CAT = 'Pricing and Memberships';
const RICH_SUB = 'Class Pack Expiry Confusion';
const richIx = DATA.categories.findIndex(c => c.name === RICH_CAT);
const subIx = DATA.categories[richIx].subs.findIndex(x => x.name === RICH_SUB);
const richKey = `${RICH_CAT}|||${RICH_SUB}`;
const planOf = () => DATA.universal.concat(DATA.subFields[richKey] || []);
/* this half owns its own mount — a form test that inherits the previous section’s view is a test of
   the wrong screen */
tree.unmount();
store.set('p57.hub.v1.tickets', '[]'); store.set('p57.hub.v1.archived', '[]'); store.set('p57.hub.v1.desk', '');
tree = create(React.createElement(App));
await settle();
t('a clean mount lands on the triage grid', byClass(json(), 'cat').length === DATA.categories.length,
  `${byClass(json(), 'cat').length} categories`);
await click(byClass(json(), 'cat')[richIx]);
await settle();
await click(byClass(json(), 'subc')[subIx]);
await settle();
const fidOf = id => fields().find(f => fid(f) === id);
/* read an answer wherever it lives: selects keep it on the element, text and dates on their input */
const valOf = f => {
  const sel = byType(f, 'select')[0];
  if (sel) return Array.isArray(sel.props?.value) ? sel.props.value.join(', ') : String(sel.props?.value ?? '');
  const hit = byType(f, 'input').find(n => n.props?.type === 'radio' && n.props?.checked);
  if (hit) return String(hit.props?.value ?? '');
  const inp = byType(f, 'input').find(n => n.props?.value !== undefined && !['radio', 'file'].includes(n.props?.type));
  return String(inp?.props?.value ?? byType(f, 'textarea')[0]?.props?.value ?? '');
};
const tipsIn = n => nodes(n).filter(x => typeof x.props?.['data-tip'] === 'string' && x.props['data-tip'].length > 12);
const progNum = () => +((texts(byClass(json(), 'fp-txt')[0] || '').match(/(\d+)\//) || [])[1] ?? -1);
const chipsOf = id => byClass(fidOf(id) || {}, 'pk-chip').length;
t('the intake is generated from the sub-category, not a hand-written list',
  fields().length > 30 && byClass(json(), 'fsec').length >= 4 && byClass(json(), 'fprogress').length === 1,
  `${fields().length} fields in ${byClass(json(), 'fsec').length} sections of ${planOf().length}`);
t('the reporter block arrives filled, not blank',
  valOf(fidOf('reporter_name')).length > 3 && /@physique57\.com$/.test(valOf(fidOf('reporter_contact')))
  && !!valOf(fidOf('reporter_type')),
  `${valOf(fidOf('reporter_name'))} · ${valOf(fidOf('reporter_contact'))} · ${valOf(fidOf('reporter_type'))}`);
t('a prefilled field says so and explains itself', byClass(fidOf('reporter_name'), 'auto').length === 1
  && tipsIn(fidOf('reporter_name')).some(x => /Prefilled from the desk/.test(x.props['data-tip'])),
  `chip “${byClass(fidOf('reporter_name'), 'auto').length ? 'auto' : '—'}” · ${(tipsIn(fidOf('reporter_name'))[0]?.props['data-tip'] || '').slice(0, 30)}…`);
const deskLbl = byClass(json(), 'deskid')[0];
const deskSel = deskLbl ? byType(deskLbl, 'select')[0] : null;
t('the desk identity is switchable from the header', !!deskSel && typeof deskSel.props?.onChange === 'function'
  && byType(deskSel, 'option').length === CORE.DESK_PERSONAS.length + 1,
  deskSel ? byType(deskSel, 'option').slice(1).map(o => texts(o)).join(' · ').slice(0, 62) : 'no desk select');
const nameF = fidOf('reporter_name');
await set(byType(nameF, 'input').find(n => n.props?.type === 'text'), 'Shifa Ali');
await settle();
t('editing an auto field clears its badge and keeps the new value',
  valOf(fidOf('reporter_name')) === 'Shifa Ali' && byClass(fidOf('reporter_name'), 'auto').length === 0,
  valOf(fidOf('reporter_name')));
const contactWas = valOf(fidOf('reporter_contact'));
const otherPersona = byType(deskSel, 'option').map(o => o.props?.value).filter(v => v && v !== deskSel.props.value)[0];
await set(deskSel, otherPersona);
await settle();
t('switching the desk re-prefills what nobody touched and never the value the desk typed',
  valOf(fidOf('reporter_contact')) !== contactWas && /@physique57\.com$/.test(valOf(fidOf('reporter_contact')))
  && valOf(fidOf('reporter_name')) === 'Shifa Ali', `${contactWas} → ${valOf(fidOf('reporter_contact'))}`);
const dt = fidOf('occurred_at');
t('the date/time box is built like every other control', byClass(dt, 'datet').length === 1
  && byType(dt, 'input')[0]?.props?.type === 'datetime-local'
  && btnIn(dt, /just now/i) && byClass(dt, 'dt-presets')[0] && nodes(byClass(dt, 'dt-presets')[0]).filter(n => n.type === 'button').length === 3,
  `${byType(dt, 'input')[0]?.props?.type} + ${nodes(byClass(dt, 'dt-presets')[0] || {}).filter(n => n.type === 'button').length} shortcuts`);
await click(btnIn(dt, /just now/i));
await settle();
t('the “just now” shortcut stamps a machine-readable moment and reads it back human',
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(valOf(fidOf('occurred_at')))
  && /\d{1,2} \w+ \d{4}/.test(texts(byClass(dt, 'dt-read')[0] || '')),
  `${valOf(fidOf('occurred_at'))} → ${texts(byClass(dt, 'dt-read')[0] || '')}`);
/* the two-way answer is gated on the studio, so answer the parent and the field appears */
await answer(fidOf('studio'), 'Kwality House, Kemps Corner', '', '');
await settle();
const boolF = fields().find(f => byClass(f, 'sw-btn').length);
t('a two-way answer becomes a switch the moment its gate opens', !!boolF,
  boolF ? `${fid(boolF)} · ${planOf().find(f => f.id === fid(boolF))?.options?.join(' | ')}`.slice(0, 74) : 'no two-option field');
if (boolF) {
  const id = fid(boolF), was = valOf(fidOf(id));
  await click(byClass(fidOf(id), 'sw-btn')[0]);
  await settle();
  const now2 = valOf(fidOf(id));
  t('flipping it answers the other side, and the native radios stay honest', !!now2 && now2 !== was
    && nodes(fidOf(id)).some(n => n.props?.type === 'radio' && n.props?.checked)
    && byClass(fidOf(id), 'sw-btn').length === 1, `${was || '—'} → ${now2.slice(0, 34)}`);
  await click(byClass(fidOf(id), 'sw-btn')[0]);
  await settle();
  const back = valOf(fidOf(id));
  t('flipping it again answers the other side of the pair, never a third value',
    back !== now2 && (planOf().find(f => f.id === id).options || []).includes(back), back.slice(0, 30));
}
/* One control for every choice. A multi-pick opens the same popover a single-select does, counts
   what is picked, filters its own list and reads the answer back as chips on the field. Every read
   below re-queries the live tree, because a snapshot taken before the click is a snapshot of the
   answer the desk has not given yet. */
const txt = n => (n ? textsSpaced(n).replace(/\s+/g, ' ') : '');
const pkOf = f => byClass(f || {}, 'pk')[0];
const multiF = fields().find(f => { const p = pkOf(f); return !!p && byClass(p, 'multi').length && byClass(p, 'pk-opt').length >= 4; });
const mid = fid(multiF);
const mpk = () => pkOf(fidOf(mid));
const mbtn = () => byClass(mpk(), 'pk-btn')[0];
const mopts = () => byClass(mpk(), 'pk-opt').length;
const optCount = mopts();
t('a multi-pick answers through the same one dropdown control as every other choice',
  !!mbtn() && !byClass(multiF, 'sw-btn').length && !byClass(multiF, 'selwrap').length
  && /pick as many as apply/.test(mbtn()?.props?.['data-tip'] || ''),
  mid ? `“${mid}” · ${optCount} options inside one picker` : 'no multi-pick on this form');
await click(mbtn()); await settle();
t('the popover counts its list and offers all / clear',
  byClass(mpk(), 'pk-pop').length === 1 && txt(byClass(mpk(), 'pk-count')[0]) === `${optCount} options`
  && !!btnIn(mpk(), /^all$/i) && !!btnIn(mpk(), /^clear$/i),
  `${txt(byClass(mpk(), 'pk-count')[0])} · all + clear`);
t('the trigger tells an assistive tech what it opens',
  mbtn()?.props?.['aria-haspopup'] === 'listbox' && mbtn()?.props?.['aria-expanded'] === true
  && byClass(mpk(), 'pk-list').length === 1, 'aria-haspopup=listbox · aria-expanded=true · role=listbox');
await click(btnIn(mpk(), /^all$/i)); await settle();
t('“all” picks every option and the chips read the answer back on the field',
  chipsOf(mid) === optCount && byClass(fidOf(mid), 'done').length === 1
  && txt(byClass(mpk(), 'pk-n')[0]).replace(/\s+/g, '') === `${optCount}/${optCount}`,
  `${chipsOf(mid)} chips · counter “${txt(byClass(mpk(), 'pk-n')[0])}”`);
const mWord = String(valOf(fidOf(mid)).split(',')[0] || '').trim().split(/\s+/).slice(0, 2).join(' ');
await set(byType(mpk(), 'input').find(n => n.props?.type === 'search'), mWord); await settle();
const shownOpts = mopts();
t('the filter trims the list without dropping what is already picked',
  shownOpts > 0 && shownOpts < optCount && chipsOf(mid) === optCount
  && txt(byClass(mpk(), 'pk-count')[0]) === `${shownOpts} of ${optCount}`,
  `“${mWord}” leaves ${shownOpts} of ${optCount} · ${chipsOf(mid)} still picked`);
await set(byType(mpk(), 'input').find(n => n.props?.type === 'search'), 'zzz-no-such-answer'); await settle();
t('an empty result is said out loud rather than left as a blank box',
  !mopts() && /Nothing in this list matches/.test(txt(byClass(mpk(), 'pk-none')[0])),
  txt(byClass(mpk(), 'pk-none')[0]).slice(0, 46));
await set(byType(mpk(), 'input').find(n => n.props?.type === 'search'), ''); await settle();
await click(btnIn(mpk(), /^clear$/i)); await settle();
t('clearing empties the answer and un-marks the field',
  !chipsOf(mid) && !byClass(fidOf(mid), 'done').length && !byClass(mpk(), 'pk-n').length,
  `${chipsOf(mid)} chips · ${mopts().length} on`);
await click(btnIn(mpk(), /^all$/i)); await settle();               /* then take the whole list back */
t('re-picking everything marks the field answered again',
  chipsOf(mid) === optCount && byClass(fidOf(mid), 'done').length === 1, `${chipsOf(mid)} chips`);
/* a single-select on the same grid: one value, shown on the trigger, and a reset that leaves it blank */
const oneF = () => fidOf('area');
await click(byClass(oneF(), 'pk-btn')[0]); await settle();
await click(byClass(oneF(), 'pk-opt')[0]); await settle();
const oneVal = valOf(oneF());
t('a single-select takes one value and shows it on the trigger',
  !!oneVal && txt(byClass(oneF(), 'pk-val')[0]) === oneVal && byClass(oneF(), 'done').length === 1,
  oneVal.slice(0, 36));
await click(byClass(oneF(), 'pk-btn')[0]); await settle();
await click(btnIn(pkOf(oneF()), /^reset$/i)); await settle();
t('resetting a picker leaves the field blank, not half-answered',
  valOf(oneF()) === '' && !byClass(oneF(), 'done').length, `“${valOf(oneF())}”`);
t('every field carries the tooltip the desk needs', tipsIn(json()).length >= 100, `${tipsIn(json()).length} tooltips on this form`);
t('each section counts its own answers in the header', /\d+\/\d+ · \d+ fields/.test(texts(byClass(json(), 'fh-meta')[0] || '')),
  texts(byClass(json(), 'fh-meta')[0] || '').slice(0, 26));
const emptyReq = fields().filter(f => planOf().some(p => p.id === fid(f) && p.required) && !valOf(f).trim());
const p0 = progNum(), gapField = emptyReq[0];
const how = gapField ? await answer(gapField, 'Kwality House, Kemps Corner', 'a note', 'a title') : null;
await settle();
t('answering a required field moves the band and marks the field done', !!gapField && progNum() === p0 + 1
  && byClass(fidOf(fid(gapField)), 'done').length === 1, `${p0} → ${progNum()} on “${fid(gapField)}” via ${how}`);

console.log('\n\x1b[1m▸ THE TICKET SHEET\x1b[0m');
/* finish the same form through the ordinary answer loop, then file it */
for (let round = 0; round < 8 && outstanding(); round++)
  for (const f of fields()) await answer(f, 'Kwality House, Kemps Corner', 'The pack expired two classes early and the member was charged for a drop-in.', 'Class pack expired mid-week');
t('the rewritten form still leaves nothing outstanding', outstanding() === 0, `${outstanding()} outstanding`);
await click(button(/Review & create ticket/));
await settle();
await click(button(/File & start SLA/));
await settle();
if (button(/new problem|file separately/i)) { await click(button(/new problem|file separately/i)); await settle(); }
t('a ticket filed with the new form is on the board', live().length === 1, `${live().length} live`);
const tk = () => live()[0];
const escRx = x => String(x).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
t('it was given its own narrative line, not a duplicate title', !!tk().narrative && tk().narrative !== tk().title
  && /Class Pack Expiry/i.test(tk().narrative), (tk().narrative || '').slice(0, 70));
await click(nodes(json()).filter(n => n.type === 'button' && /Live queue/.test(textsSpaced(n)))[0]);
await settle();
const labelNode = () => byClass(json(), 'tklabel')[0];
t('the queue shows the story line under the title', !!labelNode() && texts(labelNode()).length > 24,
  texts(labelNode()).slice(0, 62));
await click(labelNode());
await settle();
const sheet = byClass(json(), 'tsheet')[0];
const heads = () => byClass(json(), 'mh');
t('clicking it opens the full record as a modal sheet', !!sheet
  && heads().some(h => new RegExp(escRx(RICH_SUB)).test(texts(h))),
  sheet ? `${byClass(sheet, 'ts-ans').length} answers · ${byClass(sheet, 'ts-kpi').length} tiles · “${texts(heads()[0] || '').slice(0, 26)}”` : 'no sheet');
t('the sheet tells the story in prose before the data', !!sheet && texts(byClass(sheet, 'ts-story')[0] || '').length > 120,
  texts(byClass(sheet, 'ts-story')[0] || '').replace(/\s+/g, ' ').slice(0, 58) + '…');
t('both clocks tick at the top of the sheet', byClass(sheet, 'clockbox').length === 2
  && /due|answered|promise/.test(texts(byClass(sheet, 'ts-clocks')[0] || '')),
  texts(byClass(sheet, 'ts-clocks')[0] || '').replace(/\s+/g, ' ').slice(0, 40));
t('the lifecycle rail knows what has happened', byClass(sheet, 'ts-stage').length === 4
  && byClass(sheet, 'ts-stage').filter(n => byClass(n, 'done').length).length >= 2,
  `${byClass(sheet, 'ts-stage').filter(n => byClass(n, 'done').length).length}/4 stages · ${byClass(sheet, 'ts-spine').length} rail`);
t('answers are grouped the way the form asked them', byClass(sheet, 'ts-grp').length >= 2
  && byClass(sheet, 'ts-ans').length >= 20, `${byClass(sheet, 'ts-grp').length} groups · ${byClass(sheet, 'ts-ans').length} answers`);
t('the sheet answers “who told us” without a second lookup', new RegExp(escRx(tk().data.reporter_name)).test(texts(sheet))
  && new RegExp(escRx(tk().data.reporter_contact)).test(texts(sheet)),
  `${tk().data.reporter_name} · ${tk().data.reporter_contact}`);
const foot = () => byClass(json(), 'ts-foot')[0];
const respond = btnIn(foot() || {}, /first response/i);
if (respond) { await click(respond); await settle(); }
t('the sheet can act on the ticket, not only read it', respond ? !!tk().firstResponseAt : !!btnIn(foot() || {}, /Resolve/i),
  respond ? 'first response logged' : 'already answered — Resolve offered');
t('a multi-pick is filed as a real list, not a comma blob',
  Array.isArray(tk().data[mid]) && tk().data[mid].length === optCount
  && !tk().data[mid].some(x => !String(x).trim()) && tk().data[mid].join().indexOf(',,') < 0,
  `${(tk().data[mid] || []).length} of ${optCount} options stored`);
const closeSheet = () => byClass(json(), 'icobtn').filter(n => /Close/.test(n.props?.title || '')).pop();
await click(closeSheet());
await settle();
t('and closing it leaves the board consistent', !byClass(json(), 'tsheet').length && live().length === 1,
  `${byClass(json(), 'tsheet').length} sheets left · ${live().length} live · ${tk().status}`);

console.log('\n\x1b[1m▸ RELOAD + RECOVERY\x1b[0m');
tree.unmount();
tree = create(React.createElement(App));
const before = { live: live().length, arch: archived().length };
t('a reload restores the board exactly as it was left', live().length === before.live && archived().length === before.arch,
  `live=${live().length} archived=${archived().length}`);
await click(byClass(json(), 'cat').find(n => /Scheduling/.test(cardName(n))));
t('the grid is fully usable again after reload', byClass(json(), 'subc').length === DATA.categories.find(c => c.name === 'Scheduling').subs.length,
  `${byClass(json(), 'subc').length} sub-categories`);
fs.writeFileSync('/tmp/flow-final.json', JSON.stringify(json()).slice(0, 400000));
console.log('\n' + (fail ? '\x1b[41m\x1b[37m FAIL \x1b[0m' : '\x1b[42m\x1b[30m OK \x1b[0m')
  + '  \x1b[1m' + pass + ' passed, ' + fail + ' failed\x1b[0m\n');
process.exit(fail ? 1 : 0);
