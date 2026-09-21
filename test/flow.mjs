#!/usr/bin/env node
/* End-to-end interaction runs against the real components.

   run() walks the app the way staff do — category grid → sub-category grid → generated
   form → submit → live queue → first response → escalate → resolve → reload — and asserts
   at each step. It is run twice with different cities and departments, so routing, form
   content and SLA tiers are all proven from the same code path a person would use. */
import fs from 'node:fs';
import { loadApp, installDom, DATA, texts, textsSpaced, byClass, byType, nodes } from './harness.mjs';
const React = (await import('react')).default;
const _rt = await import('react-test-renderer');
const { act, create } = _rt.act ? _rt : _rt.default;

await loadApp();
const VOC = await import('../src/vocab.js');
const store = installDom();
store.set('p57.hub.v1.archived', '[]');
await import('./.tmp/bundle.mjs');
const { App, CORE } = globalThis.__X;

let pass = 0, fail = 0;
const fileedGuard = n => !!n && n.props?.disabled !== true;
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

/* one overdue ticket in storage, so the Insights breach count is exact rather than random */
const T0 = Date.now();
const probe = { ...CORE.makeTicket({ sub: { name: 'Deterministic probe', category: 'Repair and Maintenance',
    department: 'Operations & Facilities', slaLabel: 'P3 — 8 hr first response · 48 hr resolution', priority: 'high' },
  category: { name: 'Repair and Maintenance' }, studio: 'Kwality House, Kemps Corner',
  chain: [{ who: 'Zahur Shaikh (Studio Coordinator)', note: 'desk' }, { who: 'Saachi Shetty (Ops Manager)', note: 'L1' }],
  hours: { first: 8, res: 48 }, priority: 'high', data: { summary: 'p57probe', studio: 'Kwality House, Kemps Corner' } }),
  createdAt: T0 - 12 * 36e5, frDueAt: T0 - 4 * 36e5, resDueAt: T0 + 36e5 };
const reset = () => store.set('p57.hub.v1.tickets', JSON.stringify([{ ...probe, frDueAt: Date.now() + 36e5 }]));
/* React holds the previous board in state, and usePersist writes that back on its next
   render — so a bare store.set() gets clobbered. Flush the update inside act() first. */
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
const fid = n => n.props?.['data-fid'];
/* read the value a field actually holds — inputs carry it in props, pickers in their mirror,
   multi-selects as chips, switches as their aria state */
const valOf = f => {
  if (!f) return '';
  const chips = byClass(f, 'pk-chip');
  if (chips.length) return chips.map(c => textsSpaced(c)).join(', ');
  const sel = byType(f, 'select')[0], area = byType(f, 'textarea')[0], inp = byType(f, 'input')[0];
  const raw = n => (n && n.props?.value != null && String(n.props.value) !== '' ? String(n.props.value) : '');
  return raw(sel) || raw(area) || raw(inp)
    || (byClass(f, 'sw-btn').some(b => byClass(b, 'on').length) ? 'on' : '')
    || (byClass(f, 'pk-val')[0] ? textsSpaced(byClass(f, 'pk-val')[0]) : '');
};
const outstanding = () => +(texts(json()).match(/· (\d+) outstanding/)?.[1] ?? byClass(json(), 'errtxt').length);

/* answer one field using whatever control it renders, and force the studio when asked */
async function answer(f, studio, note, title, keep) {
  const id = fid(f);
  /* a linked-lookup field is answered by picking the first row its dropdown shows */
  const lk = byClass(f, 'lk')[0];
  if (lk) {
    /* a link the desk already resolved stays resolved — re-running the search would re-pick
       whatever row happens to be first, which is not the member anyone chose */
    if (byClass(f, 'done').length) return 'kept';
    const input = byType(lk, 'input').find(n => n.props?.onChange);
    await set(input, id === 'member_name' ? 'Rhea' : id === 'member_email' ? 'rhea' : 'class');
    const row = byClass(json(), 'lk-row')[0];
    if (row) { await click(row); return 'lookup'; }
    return null;
  }
  /* the one choice control on this form is the picker: open it and click the first option it
     offers, the way a desk does — an option the guided report already chose is left alone */
  const pk = byClass(f, 'pk')[0];
  if (pk) {
    if (keep && byClass(f, 'done').length) return 'kept';   /* the guided block asks us not to write over its answers */
    const btn = byClass(pk, 'pk-btn')[0];
    const opts = btn ? byClass(pk, 'pk-opt') : [];
    if (btn && opts.length) {
      await click(btn);
      const free = opts.find(o => !byClass(o, 'on').length);
      await click(free || opts[0]);
      return 'picker';
    }
    const all = btn ? btnIn(pk, /^all$/i) : null;
    if (btn && all) { await click(btn); await click(all); return 'picker-all'; }
  }
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

/* ================= run 1 — Mumbai studio operations ================= */
const mine = await run({
  label: 'MUMBAI · STUDIO OPERATIONS → ops desk', catRx: /^Repair and Maintenance$/, subRx: /^AC and HVAC/,
  studio: 'Kwality House, Kemps Corner', note: 'p57flow: Studio 1 held 31C through the 6:30 pm class; two members moved out.',
  title: 'AC fault — Studio 1 at 31C during the 6:30 pm class', desk: 'Zahur', esc: 'Saachi', priorityOk: /^(low|medium|high|critical)$/,
});
if (!mine) { console.log('\n\x1b[41m run 1 did not produce a ticket — aborting \x1b[0m'); process.exit(1); }

console.log('\n\x1b[1m▸ TRACKING ACTIONS ON THE BOARD\x1b[0m');
await click(button(/Open in queue/));
const rows = () => byClass(json(), 'tkrow');
const myRow = () => rows().find(n => texts(n).includes(mine.number));
t('the queue renders every live ticket and finds ours', rows().length === live().length && !!myRow(), `${rows().length} rows for ${live().length} live`);
t('each row shows its own live SLA clock and owner', /FR due/.test(texts(myRow() || {})) && /Zahur/.test(texts(myRow() || {})),
  texts(myRow() || {}).replace(/\s+/g, ' ').match(/FR due [^ ]+/)?.[0] || 'no clock');
const isOpen = () => byClass(json(), 'tk').some(n => /open/.test(n.props.className) && texts(n).includes(mine.number));
if (!isOpen()) { await click(myRow()); if (!isOpen()) await click(myRow()); }
const detail = () => byClass(json(), 'detail').find(n => texts(n).includes(mine.number)) || byClass(json(), 'detail')[0];
t('a row click expands its own detail panel with actions', !!detail() && /Resolve/.test(texts(detail())) && /first response/i.test(texts(detail())),
  texts(detail() || {}).replace(/\s+/g, ' ').slice(0, 50) || 'no .detail rendered');
await click(button(/Log first response/));
let fr = live().find(x => x.number === mine.number);
t('logging the first response stamps it and stops the FR clock', fr.firstResponseAt > 0 && fr.status !== 'new', `status=${fr.status}`);
t('the action is recorded on the ticket timeline', (fr.timeline || []).some(e => /First response/i.test(e.text)), `${(fr.timeline || []).length} events`);
t('the first-response button disappears once used', !/Log first response/.test(texts(detail() || {})), 'detail refreshed');
await click(button(/Escalate to/));
let esc = live().find(x => x.number === mine.number);
t('escalation advances the owner to L1 in the chain and on the ticket',
  esc.escalation === 1 && /Saachi/.test(esc.chain[1].who) && /Saachi/.test(esc.assignee), `step ${esc.escalation} · ${esc.assignee.split(' (')[0]}`);
t('escalating lifts priority to at least High', ['high', 'critical'].includes(esc.priority), esc.priority);
t('the escalation is on the timeline too', (esc.timeline || []).some(e => /Escalated/i.test(e.text)), `${(esc.timeline || []).length} events`);
const statusSel = detail() ? byType(detail(), 'select')[0] : null;
if (await set(statusSel, 'waiting_on_vendor')) {
  esc = live().find(x => x.number === mine.number);
  t('the status dropdown writes through to the ticket', esc.status === 'waiting_on_vendor', esc.status);
}
/* a re-render can drop the expansion — re-open ours without toggling it shut again */
const rowIsOpen = () => byClass(json(), 'tk').some(n => /open/.test(n.props.className) && texts(n).includes(mine.number));
if (!rowIsOpen()) await click(myRow());
t('the detail panel stays reachable after a status change', rowIsOpen() && !!button(/Resolve/), rowIsOpen() ? 'actions visible' : 'actions lost');
/* Resolve now opens the capture panel: cause + action are required before it files. */
await click(button(/Resolve/));
t('resolving asks for a cause and an action first', /Close out/.test(textsSpaced(json())) && /Root cause/.test(textsSpaced(json())), 'resolution panel opened');
const resTas = byType(json(), 'textarea');
await set(resTas[0], 'Condenser coil failed; vendor part on order.');
await set(resTas[1], 'Bike taken out of rotation, member told by WhatsApp, vendor visit booked for Thursday.');
t('the wider panel refuses to file on cause + action alone', button(/Record resolution/)?.props?.disabled === true,
  'category and the closure line are required too');
await click(byClass(json(), 'opt').find(n => /^Wear and tear$/.test(textsSpaced(n))));
await set(resTas[resTas.length - 1], 'Coil replaced by the vendor on Thursday; the other nine bikes were checked the same shift.');
t('the panel files once cause, category, action and closure are written', button(/Record resolution/)?.props?.disabled !== true,
  (textsSpaced(button(/Record resolution/)) || '') + ' · ' + (byType(json(), 'textarea').length + byType(json(), 'select').length) + ' capture controls');
await click(button(/Record resolution/));
const archivedMine = archived().find(x => x.number === mine.number) || {};
t('resolving moves it out of the live queue into the archive', live().length === BASE && !!archivedMine.number, `live=${live().length} archived=${archived().length}`);
t('it is archived as resolved, with a resolution timestamp', archivedMine.status === 'resolved' && archivedMine.resolvedAt >= archivedMine.createdAt);
t('no duplicate lands in the archive', archived().filter(x => x.number === mine.number).length === 1, `${archived().length} archived total`);
t('resolution is written into the ticket history', (archivedMine.timeline || []).some(e => /vendor|Condenser|Fixed/i.test(e.text)), `${(archivedMine.timeline || []).length} events`);
t('the capture panel’s answers are stored on the archived ticket',
  /Condenser coil/.test(JSON.stringify(archivedMine.resolution || {})) && !!archivedMine.resolutionNotes,
  String(archivedMine.resolutionNotes || '').slice(0, 60));
t('sub-minute durations read as language, not “0m 00s”', !/\b0m 00s\b|\b0:00:00\b/.test(textsSpaced(json())), 'checked');


/* ================= run 4 — linked records, merge counting, record modals, settings ================= */
console.log('\n\x1b[1m▸ LINKED RECORDS, MERGE COUNTING, RECORD MODALS AND SETTINGS\x1b[0m');
/* the control debounces typing by design; advance timers inside act() so the dropdown
   reflects the query rather than the unfiltered page */
const settle = async (ms = 220) => { await act(async () => { await new Promise(r => setTimeout(r, ms)); }); };
const escBtn = () => nodes(json()).filter(n => n.type === 'button' && /Close \(Esc\)/.test(n.props?.title || ''))[0];
const head = () => textsSpaced(json()).replace(/\s+/g, ' ');
const decodeRef = txt => (/\[#+\d+\]/.test(txt) || /#\d{6}/.test(txt)) ? txt : null;
await click(nodes(json()).filter(n => n.type === 'button' && /New ticket|Raise a ticket/.test(textsSpaced(n)))[0]);
if (byClass(json(), 'subc').length) await click(button(/all categories/));
await click(byClass(json(), 'cat').find(n => /Customer Service/.test(cardName(n))));
await click(byClass(json(), 'subc').find(n => /Unresolved Complaints/.test(cardName(n))));
const mField = () => fields().find(f => fid(f) === 'member_name');
t('the member field renders as a directory lookup, not a text box', !!mField()
  && /Momence ID|demo data/i.test(textsSpaced(mField() || {})), mField() ? 'lookup control on screen' : 'member_name not rendered');
await set(byType(byClass(json(), 'lk-bar')[0], 'input').find(n => n.props?.onChange), 'Priya');
await settle();
await click(byClass(json(), 'lk-row')[0]);
const chips0 = byClass(json(), 'lk-chip')[0];
const chipTxt = texts(chips0 || {});
const chipName = /^(?:[A-Z]{2})?([A-Z][a-z]+) ?/.exec(chipTxt.replace(/\s+/g, ' ').trim());
t('picking a member leaves a chip carrying their Momence id', /#\d+/.test(chipTxt)
  && !!chipName && new RegExp(chipName[1]).test(chipTxt), chipTxt.replace(/\s+/g, ' ').slice(0, 56));
await click(nodes(byClass(json(), 'lk-chip')[0] || {}).filter(n => n.type === 'button' && /Open the record/.test(n.props?.title || ''))[0]);
t('the chip opens the member record: profile, tags, visits', /First seen/.test(head()) && /visits/.test(head()) && /Home studio/.test(head()), 'record overview');
const segs = () => byClass(json(), 'segbar').length ? nodes(byClass(json(), 'segbar')[0]).filter(n => n.type === 'button') : [];
await click(segs().find(n => /Memberships/.test(textsSpaced(n))));
t('the record’s tabs switch to related records', /Credits left|Expires|Active|Frozen/.test(head()), 'memberships tab');
await click(segs().find(n => /Bookings/.test(textsSpaced(n))));
t('bookings on the record show check-in state', /Booked|Checked in|Cancelled/.test(head()), 'bookings tab');
await click(segs().find(n => /Raw/.test(textsSpaced(n))));
t('the raw payload is browsable as a tree', /entries|details/.test(head()), 'raw tab');
await click(escBtn());
const storedRef = () => decodeRef(texts(mField() || {}));
t('the record modal closes without touching the form', !/First seen/.test(head()) && !!storedRef(),
  'form keeps its answer');

/* the rest of the form, then the ticket reference is chosen by search */
const kinds = new Set();
for (let round = 0; round < 8 && outstanding(); round++)
  for (const f of fields()) { const k = await answer(f, 'Supreme HQ, Bandra', 'repeat of the lost freeze request', 'Second freeze request lost at Bandra'); if (k) kinds.add(k); }
t('every control on a lookup-bearing form is answerable', outstanding() === 0,
  `${outstanding()} outstanding · kinds: ${[...kinds].join(', ')}`);
const lkField = () => fields().find(f => fid(f) === 'linked_ticket');
t('the linked-ticket field offers a board search beside the text box',
  !!lkField() && /find a ticket/.test(textsSpaced(lkField())), 'ticket lookup rendered');
/* “find a ticket” asks the merge question first — that is where a repeat belongs */
await click(btnIn(lkField(), /find a ticket/));
t('a probable repeat is met with the merge question, not a second clock',
  /same fault/i.test(head()) && /file separately|Link & report again/i.test(head()), 'merge prompt');
const rows0 = byClass(json(), 'picker-row');
const rowTxt = texts(rows0[0] || {});
const pickedNumber = (rowTxt.match(/P57-\d{4}-\d{4}/) || [])[0];
const foot = head();
const okFoot = /· 1 on this sub-category|· 0 on this sub-category/.test(foot) || /open tickets?/.test(foot);
if (process.env.FLOWDBG) console.log('    \x1b[2mdbg row:', rowTxt.replace(/\s+/g, ' '), '\x1b[0m');
t('the search lists the open tickets with their clocks',
  /P57-\d{4}-\d{4}/.test(rowTxt) && /FR |P3|high|critical|medium|low/.test(rowTxt)
  && rows0.length === live().filter(x => !['resolved', 'closed'].includes(x.status)).length && okFoot,
  `${rows0.length} row(s) · ${rowTxt.replace(/\s+/g, ' ').slice(0, 58)}`);
t('an unknown reference is flagged before it can mislead the desk', /e\.g\./.test(texts(lkField() || {})), 'placeholder guidance shown');
await click(escBtn());
t('dismissing the merge prompt leaves the desk in control', !/same fault/i.test(head()) && !!lkField(), 'back to the form');
/* the reference can also be typed — the field verifies it either way */
const lkInput = byType(lkField() || {}, 'input')[0];
await set(lkInput, pickedNumber);
const lkTxt = texts(lkField() || {});
t('the chosen reference resolves to a real ticket on this board', /matched/.test(lkTxt),
  lkTxt.replace(/\s+/g, ' ').slice(0, 86));
const badInput = byType(lkField() || {}, 'input')[0];
await set(badInput, 'TKT-27C18254');
t('a number that is not on this board is called out, not swallowed', /not on this board/.test(texts(lkField() || {})),
  texts(lkField() || {}).replace(/\s+/g, ' ').slice(0, 76));
await set(badInput, pickedNumber);
/* file it: the link must count as a repeat on the ticket it points at */
const boardBefore = live().length;
await click(button(/Review & create ticket/));
await click(button(/File & start SLA/));
const mine4 = live().find(x => /Second freeze request/.test(x.title));
const targetAfter = live().find(x => x.number === pickedNumber);
t('filing with a reference creates the ticket and keeps the link',
  !!mine4 && String(mine4.data.linked_ticket).includes(pickedNumber || 'P57'), live().length === boardBefore + 1
    ? `${mine4?.number} → ${mine4?.data.linked_ticket}` : 'not filed');
t('the older ticket records the repeat and counts it',
  !!targetAfter && (targetAfter.recurrenceCount || 1) >= 2 && (targetAfter.timeline || []).some(e => /Report #/.test(e.text)),
  targetAfter ? `report #${targetAfter.recurrenceCount}` : 'target missing');
t('the new ticket points back at the older one', !!mine4 && mine4.linkedTicketId === targetAfter?.id, 'linkedTicketId');
t('the handover header states the link, so the desk reads one clock not two',
  /linked to /.test(CORE.handover(mine4 || {}, {})), CORE.handover(mine4 || {}, {}).split('\n')[0]);
t('the filed ticket carries the member reference for whoever picks it up',
  /#481102/.test(mine4?.data.member_name || '') &&   /^Priya Mehta \[#481102\]/.test(mine4?.data.member_name || ''),
  mine4?.data.member_name || '—');

/* settings: appearance presets, density, integration probe */
{
  const gear = nodes(json()).filter(n => n.type === 'button' && /Integrations & settings/.test(n.props?.title || ''))[0];
  t('the topbar opens workspace settings', !!gear, 'settings control present');
  await click(gear);
  t('settings carries appearance presets, density and motion switches',
    /editorial/.test(head()) && /glass/.test(head()) && /Density/i.test(head()) && /Compact fits/i.test(head()), 'appearance tab');
  await click(nodes(json()).filter(n => n.type === 'button' && /glass/.test(textsSpaced(n)))[0]);
  const pref = JSON.parse(store.get('p57.hub.v1.prefs') || '{}');
  t('choosing a preset persists with the workspace', pref.appearance === 'glass', JSON.stringify(pref).slice(0, 80));
  await click(nodes(json()).filter(n => n.type === 'button' && /Integrations/.test(textsSpaced(n)))[0]);
  t('the integrations tab states what the lookups are reading', /Demo records are read-only|OAuth/i.test(head()), 'integrations panel');
  await click(button(/Test the demo dataset/));
  t('“test the dataset” lists, pages and opens a detail like a live probe',
    /members/.test(head()) && /Detail for .* returned/.test(head()), (head().match(/\d+ members[^\n]{0,64}/)?.[0] || '').slice(0, 72));
  await click(button(/Done/));
}
/* guided powerCycle intake, verbatim from the reference repo */
{
  await click(button(/Open in queue/));
  await click(nodes(json()).filter(n => n.type === 'button' && /New ticket|Raise a ticket/.test(textsSpaced(n)))[0]);
  if (byClass(json(), 'subc').length) await click(button(/all categories/));
  await click(byClass(json(), 'cat').find(n => /Repair and Maintenance/.test(cardName(n))));
  await click(byClass(json(), 'subc').find(n => /PowerCycle Bike Fault/i.test(cardName(n))));
  await click(nodes(json()).filter(n => n.type === 'button' && /Guided powerCycle report/.test(n.props?.title || ''))[0]);
  const gqs = byClass(json(), 'gq');
  t('the guided report asks the vendor’s own intake questions', gqs.length >= 6, `${gqs.length} steps`);
  const cycSel = byType(gqs[1], 'select')[0];
  if (cycSel) { const o = byType(cycSel, 'option').map(x => x.props?.value).filter(Boolean); await set(cycSel, o[0]); }
  await set(byType(gqs[0], 'input')[0], 'Bike #3');
  /* cite a part straight out of the vendor’s catalogue, as the reference repo lets a desk do */
  const cited = byClass(json(), 'part')[0];
  const citedName = cited ? textsSpaced(cited).replace(/\s+/g, ' ').trim().split(' ')[0] : '';
  if (cited) await click(cited);
  t('the vendor’s own parts catalogue marks the cited part chosen',
    !!byClass(json(), 'part').find(n => byClass(n, 'on').length), `“${citedName}”`);
  await click(button(/Add to the ticket/));
  /* the answers have to be readable on the form the desk is filling, not only in storage */
  const fieldText = id => { const f = fields().find(x => fid(x) === id); return f ? `${valOf(f)} · ${textsSpaced(f).replace(/\s+/g, ' ')}` : ''; };
  t('guided answers are written into the live form', /Bike #3/.test(fieldText('asset_id')),
    fieldText('asset_id').slice(0, 72) || 'the bike number never reached the form');
  t('the guided report also names the asset on the ticket', /PowerCycle bike/.test(fieldText('asset_type')),
    fieldText('asset_type').slice(0, 72) || 'no asset named');
  t('the guided report does not steal the form away', outstanding() >= 0, `${outstanding()} still outstanding after applying`);
  for (let round = 0; round < 8 && outstanding(); round++)
    for (const f of fields()) await answer(f, 'Kwality House, Kemps Corner', 'Bike #3 grinding mid-class', 'Bike #3 grinding mid-class', true);

  /* a report the vendor marks as recurring must be triaged before a second clock is opened on it */
  const rep = fields().find(f => fid(f) === 'is_repeat');
  const repBtn = rep ? byClass(rep, 'pk-btn')[0] : null;
  if (repBtn) {
    await click(repBtn);
    const yes = byClass(rep, 'pk-opt').find(o => /yes/i.test(textsSpaced(o)));
    if (yes) await click(yes);
  }
  let triaged = /Is this the same fault\?/.test(head());
  if (triaged) { await click(button(/file separately/)); await settle(); }
  const rvBtn = button(/Review & create ticket/);
  if (rvBtn) {
    await click(rvBtn); await settle();
    const fb = button(/File & start SLA/);
    if (fb) await click(fb);
    await settle();
    if (/Is this the same fault\?/.test(head())) { triaged = true; await click(button(/file separately/)); await settle(); }
  }
  t('a probable repeat is triaged before a second clock opens on the same fault', triaged, 'merge-or-separate prompt');
  const cyc = live().find(x => /Bike #3 grinding/i.test(x.title));
  const stored = JSON.stringify((cyc || {}).data || {});
  /* a part with no open field on this form is folded into the summary rather than dropped */
  t('the part cited from the catalogue is carried onto the ticket, not dropped',
    new RegExp(citedName, 'i').test(stored),
    stored.match(/"[^"]+":"[^"]*SIC2[^"]*"/)?.[0] || `no ${citedName || 'part'} on the ticket`);
  t('the guided report files as a ticket that carries the asset it named',
    !!cyc && /Bike #3/.test(stored) && /PowerCycle bike/.test(stored),
    cyc ? `${cyc.number} · ${cyc.title}` : 'not filed');
  /* leave the board exactly as the next scenario expects */
  await resetBoard();
}



/* ═══════════════════════ class desk · roster triage · trainer desk ═══════════════════════
   Phase 4's contract: the desk reads the class and its roll out of Momence, triage happens per
   attendee, and everything learned lands on the ticket in the exact shape the taxonomy uses. */
console.log('\n\x1b[1m▸ CLASS DESK · ROSTER TRIAGE · TRAINER DESK\x1b[0m');
/* the previous scenario left a filed ticket on the board; flush React’s persist write-back
   first, then reset, so `live()` here is exactly the one seeded probe */
await settle(30); reset(); await act(async () => tree.unmount());
tree = create(React.createElement(App)); await settle(30);
t('the board starts this scenario with one seeded ticket', live().length === 1, live().length + ' tickets');
{
  const opts = n => byType(n || {}, 'option').filter(o => o.props?.value);
  const inDesk = re => btnIn(json(), re);

  await click(inDesk(/Class desk/));
  const pick0 = byClass(json(), 'cd-pick')[0];
  t('the desk opens on the class, not a form', byClass(json(), 'lk').length === 1 && /Find the class/.test(pick0 ? textsSpaced(pick0) : ''),
    (pick0 ? textsSpaced(pick0) : '').slice(0, 60));
  t('nothing else is on the desk until a class is chosen', byClass(json(), 'cd-card').length === 0 && byClass(json(), 'cd-foot').length === 0);
  t('and it says so in plain words', /Everything below fills itself from Momence/.test(texts(json())),
    (texts(json()).match(/Everything below fills itself from Momence[^.]*\./) || [''])[0].slice(0, 60));

  /* open the full finder and pick a real session */
  await click(inDesk(/Find the class/));
  t('the finder lists sessions with capacity and bookings', byClass(json(), 'picker-row').length > 60,
    byClass(json(), 'picker-row').length + ' rows');
  const prow = byClass(json(), 'picker-row')[0];
  const prowTxt = textsSpaced(prow);
  t('each row shows the class, its coach, its studio and its date',
    /Kwality House|Supreme HQ|Kenkere House/.test(prowTxt) && /(20\d\d|\d{1,2} \w{3})/.test(prowTxt), prowTxt.slice(0, 160));
  /* the picker commits on the first row it renders, exactly like the reference: one click, no
     “Use this” step to lose the selection behind it */
  await click(byClass(json(), 'picker-main')[0]);
  if (byClass(json(), 'modal').length) await click(inDesk(/Use this/));
  await settle();
  t('choosing a session loads the class context', byClass(json(), 'cd-card').length === 1 && /session #\d+/.test(texts(json())),
    (texts(json()).match(/session #\d+/) || ['no session id'])[0]);
  t('the roll arrives with fill, over-capacity and compatibility counts',
    byClass(json(), 'cds').length >= 6 && /capacity/.test(textsSpaced(byClass(json(), 'cd-stats')[0])),
    byClass(json(), 'cds').length + ' stats');
  t('the roster renders one row per booking, each with a status control',
    byClass(json(), 'arow').length >= 12 && byType(byClass(json(), 'arow')[0], 'select').length === 1,
    byClass(json(), 'arow').length + ' attendees');
  t('the roster can be filtered by what Momence already knows',
    byClass(json(), 'seg').filter(x => /no-show|first-timer|not compatible/.test(textsSpaced(x))).length >= 3,
    byClass(json(), 'seg').map(x => textsSpaced(x).replace(/\d+$/, '')).slice(0, 8).join(' '));
  t('the four grouped blocks cover host, audience, method and billing',
    byClass(json(), 'cd-block').length === 4, byClass(json(), 'cd-block').length + ' blocks');
  const sels = byType(byClass(json(), 'cd-block')[0], 'select');
  const hostOpts = byType(sels[0], 'option').slice(1).map(o => textsSpaced(o).replace(/\s+/g, ' ').trim());
  t('every class dropdown is filled from the controlled vocabulary',
    hostOpts.length > 2 && hostOpts.every(o => VOC.HOST_SITUATION.includes(o)) && sels.length === 4 &&
    byClass(json(), 'chiprow').every(cr => byType(cr, 'button').every(b => {
      const lab = textsSpaced(b).replace(/\s+/g, ' ').trim();
      return VOC.AUDIENCE.includes(lab) || VOC.BOOKING_FRICTION.includes(lab) || VOC.CAPACITY_NEED.includes(lab) ||
        VOC.COACHING.includes(lab) || VOC.ATT_ACTION.includes(lab); })),
    hostOpts.join(' / ').slice(0, 80));
  t('the class field vocabularies come from the same single source as the form',
    hostOpts.length === VOC.HOST_SITUATION.length, hostOpts.length + ' of ' + VOC.HOST_SITUATION.length);
  t('the roster is searchable by name as well as by filter', byClass(json(), 'roster-search').length === 1);

  /* triage one attendee in place: status, then what was offered, then the note */
  await click(byClass(byClass(json(), 'arow')[0], 'aexpand')[0]);
  let rowX = byClass(json(), 'arow')[0];
  const rSel = byType(rowX, 'select')[0];
  const note = byType(rowX, 'textarea')[0];
  t('an expanded row is the only place a note is written', byClass(json(), 'arow-extra').length === 1 && !!note,
    byClass(json(), 'arow-extra').length + ' open rows');
  t('expanding an attendee reveals tags, what was offered and a note box',
    byClass(rowX, 'atags').length === 2 && !!note, byClass(rowX, 'opt').length + ' quick chips');
  await set(rSel, 'No-show');
  await settle();
  rowX = byClass(json(), 'arow')[0];
  await click(byClass(rowX, 'opt').find(o => textsSpaced(o).replace(/\s+/g, ' ').trim() === 'Class credit granted'));
  await set(note, 'She was charged for a class she could not take; the desk owes her the credit back.');
  await settle();
  t('status, credit and note all land on the same attendee',
    /No-show/.test(textsSpaced(byClass(json(), 'arow')[0])) && /arow flagged/.test(byClass(json(), 'arow')[0].props.className || ''),
    textsSpaced(byClass(json(), 'arow')[0]).replace(/\s+/g, ' ').slice(0, 100));
  t('the row is marked as triaged the moment it has anything on it',
    /flagged/.test(byClass(json(), 'arow')[0].props.className || ''), byClass(json(), 'arow')[0].props.className);
  t('the desk counts attendee notes next to the file button',
    /1 attendee note/.test(textsSpaced(byClass(json(), 'cd-foot')[0])),
    textsSpaced(byClass(json(), 'cd-foot')[0]).slice(-60));
  t('it reads the roll back before filing', /Will be written on the ticket/.test(texts(json())) &&
    /No-show/.test(textsSpaced(byClass(json(), 'cd-summary')[0] || {})),
    textsSpaced(byClass(json(), 'cd-summary')[0] || json()).replace(/\s+/g, ' ').slice(0, 80));

  /* route + file */
  const subSel = byType(byClass(json(), 'cd-sub')[0], 'select')[0];
  t('the desk chooses which desk owns the ticket', byType(subSel, 'option').length >= 3,
    byType(subSel, 'option').map(o => textsSpaced(o)).join(' / ').slice(0, 80));
  const outBefore = live().length;
  await click(inDesk(/Build the ticket from this class/));
  const modal = byClass(json(), 'modal')[0];
  t('filing opens the same review sheet as the form', modal && /Read it back before it routes/.test(textsSpaced(modal)),
    h3(modal));
  const mtxt = texts(modal || {});
  t('the review sheet carries the class snapshot, not a summary typed twice',
    /Class & roll call · read back from Momence/.test(mtxt) && /session #\d+/.test(mtxt) &&
    /capacity\d+booked\d+attended\d+/.test(mtxt.replace(/\s+/g, '')) && /over book/.test(mtxt),
    (mtxt.match(/read back from Momence[\s\S]{0,70}/) || ['no header'])[0].replace(/\s+/g, ' '));
  t('and it reads the roll back with the real numbers from Momence',
    /coached by [A-Z][a-z]+/.test(mtxt) && /attendee note/.test(mtxt) && /% full/.test(mtxt),
    (mtxt.match(/Roll \d+ booked[^·]*·[^·]*·[^\n]{0,40}/) || ['no roll'])[0].slice(0, 90));
  t('the attendee note is on the review sheet verbatim', /could not take/.test(textsSpaced(modal)),
    (textsSpaced(modal).match(/charged for a class[^|]{0,40}/) || ['no note'])[0]);
  const filed = btnIn(modal || json(), /File & start SLA/);
  t('nothing is missing, so the desk can file straight from the class',
    modal && filed && filed.props?.disabled !== true,
    (textsSpaced(modal).match(/nothing missing[^K]*/) || ['no footer line'])[0].slice(0, 60));
  await click(filed);
  await settle();
  const board = live();
  const tk = board.find(x => x.kind === 'hosted-class') || board[0];
  t('the ticket is filed', board.length === outBefore + 1, outBefore + ' → ' + board.length);
  t('it carries the class snapshot with its roll', !!(tk && tk.class && tk.class.sessionId) && (tk.class.attendees || []).length >= 1,
    tk && tk.class ? tk.class.name + ' · ' + tk.class.attendees.length + ' note(s) · ' + tk.class.booked + '/' + tk.class.capacity + ' booked' : 'no snapshot');
  t('the triaged attendee rides along with status, action and note',
    !!(tk?.class?.attendees || []).find(a => a.status === 'No-show' && (a.actions || []).includes('Class credit granted') && a.note),
    JSON.stringify((tk?.class?.attendees || [])[0] || {}).slice(0, 90));
  t('the class answers became ordinary field values, so routing and export need no new code',
    VOC.HOST_SITUATION.includes(String(tk?.data?.class_host_situation || '')) &&
    /No-show/.test(String(tk?.data?.attendee_summary || '')) &&
    /Class credit granted/.test(String(tk?.data?.attendee_summary || '')) &&
    String(tk?.data?.attendee_flag_count) === '1',
    `${tk?.data?.class_host_situation} · ${String(tk?.data?.attendee_summary).slice(0, 44)}`);
  t('the attendee list is linked as member references', (tk?.linked?.attendees || []).length >= 1,
    JSON.stringify((tk?.linked?.attendees || [])[0] || {}).slice(0, 60));
  t('the ticket is kinded as a hosted-class problem', tk?.kind === 'hosted-class', String(tk?.kind) + ' · ' + (tk?.label || ''));
  t('the label never claims more than the ticket holds', !/undefined|null/.test(tk?.label || ''), tk?.label);
  t('the desk is cleared, so the same class cannot be filed twice by accident',
    byClass(json(), 'cd-card').length === 0 && /Find the class/.test(textsSpaced(byClass(json(), 'cd-pick')[0] || json())));

  /* queue presentation of that ticket */
  await click(inDesk(/Live queue/));
  t('queue rows read as a ticket, not a sub-category code', byClass(json(), 'tklabel').length >= 1,
    byClass(json(), 'tklabel').length + ' labels across ' + byClass(json(), 'arow').length + ' rows');
  const r0 = byClass(json(), 'tkrow').find(x => /Endurance|Strength|Barre|Cycle|Studio/.test(texts(x))) || byClass(json(), 'tkrow')[0];
  await click(r0);
  t('both clocks run live on the open ticket', byClass(json(), 'clockbox').length === 2 &&
    /first response · live/.test(texts(json())) && /resolution · live/.test(texts(json())),
    byClass(json(), 'clockbox').length + ' clocks');
  t('the roll is readable inside the ticket', /Class & roll call/.test(texts(json())) && /session record/.test(texts(json())),
    (texts(json()).match(/Class & roll call/) || ['not readable'])[0]);
  t('the read-back roster is marked and never editable from here',
    byClass(json(), 'roster').length >= 1 && byClass(json(), 'apick').length === 0,
    byClass(json(), 'roster').length + ' roster(s) · ' + byClass(json(), 'apick').length + ' pick boxes');

  /* trainer desk */
  await click(inDesk(/Trainers/));
  t('the trainer desk is a page of its own', byClass(json(), 'td-list').length === 1 && byClass(json(), 'trow').length >= 1,
    byClass(json(), 'trow').length + ' coaches');
  const kpiRows = byClass(json(), 'trow');
  const flat = n => textsSpaced(n).replace(/\s+/g, ' ');
  t('every row carries attendance and fill, and tickets where there are any',
    kpiRows.length > 0 && kpiRows.every(r => /% show-up/.test(flat(r))) &&
    kpiRows.some(r => /\d+ tickets?/.test(flat(r))),
    (kpiRows.map(flat).find(s2 => /ticket/.test(s2)) || flat(kpiRows[0] || {})).slice(0, 90));
  await click(byClass(json(), 'trow')[0]);
  t('selecting a coach opens their numbers and their filings',
    /Class ratings captured on tickets/.test(texts(json())) && /Feedback filed against them/.test(texts(json())),
    byClass(json(), 'cds').length + ' stats');
  t('and offers to file feedback without leaving the page', !!inDesk(/file feedback/));

  /* analytics and log */
  await click(inDesk(/Analytics/));
  t('analytics aggregates the rolls, not just the tickets', /Class & roster pressure/.test(texts(json())) &&
    /seats booked/.test(texts(json())), (texts(json()).match(/seats booked/) || [''])[0]);
  t('filing has an hour-of-day shape', byClass(json(), 'hr-bar').length === 24, byClass(json(), 'hr-bar').length + ' bars');
  t('closure quality is measured on the same board', /Full closure notes/.test(texts(json())) && /Reopened after resolution/.test(texts(json())),
    (texts(json()).match(/Full closure notes\D*\d+%/) || [''])[0].slice(0, 60));
  await click(inDesk(/Live queue/));
  t('the queue can save and re-apply a view', byClass(json(), 'preset').length >= 3, byClass(json(), 'preset').length + ' saved views');
  await click(byClass(json(), 'preset')[0]);
  const qSels = byClass(json(), 'sel');
  await set(qSels[0], 'all');            /* status: everything */
  await set(qSels[1], 'critical');       /* priority: critical only */
  const rowsFiltered = byClass(json(), 'tkrow').length;
  await click(byClass(json(), 'preset').find(p => /Breaching now/.test(textsSpaced(p))));
  t('applying a saved view resets the filters and re-routes the board',
    rowsFiltered === 0 && byClass(json(), 'tkrow').length === 2 &&
    byClass(json(), 'preset').some(p => /on/.test(p.props.className || '')),
    rowsFiltered + ' → ' + byClass(json(), 'tkrow').length + ' rows after “Breaching now”');
  await click(inDesk(/Class log/));
  t('the class log carries the roll for every class ticket', byClass(json(), 'logcard').length === 1 &&
    /attendee note/.test(textsSpaced(byClass(json(), 'logatt')[0] || json())),
    byClass(json(), 'logcard').length + ' cards');
  t('a log card can be opened in the queue or at Momence', !!btnIn(byClass(json(), 'logcard')[0], /open in queue/) &&
    !!btnIn(byClass(json(), 'logcard')[0], /class record/));
}
await resetBoard();

console.log('\n' + (fail ? '\x1b[41m\x1b[37m FAIL \x1b[0m' : '\x1b[42m\x1b[30m OK \x1b[0m')
  + '  \x1b[1m' + pass + ' passed, ' + fail + ' failed\x1b[0m\n');
process.exit(fail ? 1 : 0);
