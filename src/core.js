/* Core model: SLA clocks, priority inference, escalation chains, persistence. */
import DATA from './data.json';

/* Fields store `optsRef: n` into DATA.opts rather than repeating 91 option lists 1,768 times.
   Resolve once, in place, before anything reads a field. Idempotent. */
if (DATA?.opts && DATA.universal?.length) {
  const hydrate = f => { if (f.optsRef !== undefined) { f.options = DATA.opts[f.optsRef]; delete f.optsRef; } };
  DATA.universal.forEach(hydrate);
  Object.values(DATA.subFields).forEach(list => list.forEach(hydrate));
}
export const hydrateData = () => DATA;

export const H = h => h * 3600e3;

/* ---------- formatting ---------- */
export const pad = n => String(n).padStart(2, '0');
export function fmtDur(ms) {
  const abs = Math.abs(ms);
  const d = Math.floor(abs / 864e5), h = Math.floor(abs % 864e5 / 36e5),
        m = Math.floor(abs % 36e5 / 6e4), s = Math.floor(abs % 6e4 / 1000);
  if (abs < 6e4) return ms < 0 ? 'under a minute late' : 'under a minute';
  if (d > 0) return `${d}d ${pad(h)}h ${pad(m)}m`;
  if (h > 0) return `${pad(h)}:${pad(m)}:${pad(s)}`;
  return `${pad(m)}:${pad(s)}`;
}
export const fmtAt = ts => new Date(ts).toLocaleString('en-IN', {
  day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true });
export const fmtDay = ts => new Date(ts).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
export const initials = name => String(name || '?').replace(/\(.*?\)/g, '').trim()
  .split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
export const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
export const ownerCity = s => (/bengaluru|south/i.test(s || '') ? 'Bengaluru' : 'Mumbai');

/* ---------- SLA ---------- */
/* Priority-tier fallback, so a ticket that predates the taxonomy hours (or was imported /
   hand-edited without them) still gets a real clock instead of throwing. */
export const TIERS = { critical: { first: .5, res: 4 }, high: { first: 2, res: 12 },
                       medium: { first: 8, res: 48 }, low: { first: 24, res: 120 } };
export const hoursFor = t => t.hours || TIERS[t.priority] || TIERS.medium;
export function slaFor(t, now) {
  const hrs = hoursFor(t);
  const created = t.createdAt ?? now;
  const frDue = t.frDueAt ?? (created + H(hrs.first));
  const resDue = t.resDueAt ?? (created + H(hrs.res));
  if (t.status === 'closed' || t.status === 'resolved') {
    const used = (t.resolvedAt || now) - created;
    return { state: 'ok', pct: Math.min(1, used / H(hrs.res)), overdue: 0,
             dueIn: hrs.res * 36e5 - used, label: 'met', dueAt: resDue };
  }
  const dueIn = resDue - now, pct = 1 - dueIn / H(hrs.res);
  const frLeft = frDue - now;
  const state = dueIn <= 0 || frLeft <= 0 ? 'breach' : (dueIn < H(hrs.res) * 0.25 || frLeft < H(1)) ? 'risk' : 'ok';
  return { state, pct: Math.max(0, Math.min(1, pct)), dueIn, overdue: dueIn < 0 ? -dueIn : 0,
           label: dueIn <= 0 ? `breached by ${fmtDur(dueIn)}` : `${fmtDur(dueIn)} left`, dueAt: resDue };
}

/* ---------- priority inference (mirrors routing.ts: evidence may only raise) ---------- */
const RANK = { low: 0, medium: 1, high: 2, critical: 3 };
const atLeast = (p, floor) => (RANK[floor] > RANK[p] ? floor : p);
const saysYes = v => /^\s*yes\b/i.test(String(v ?? ''));
const saysNotYet = v => /^\s*not yet/i.test(String(v ?? ''));

export function inferPriority(base, data, sub) {
  let p = base || 'medium';
  if (saysYes(data.immediate_danger)) p = 'critical';
  if (/safety concern/i.test(String(data.member_impact || ''))) p = 'critical';
  if (saysYes(data.class_impacted) || saysNotYet(data.class_impacted)) p = atLeast(p, 'high');
  if (/could not proceed|charged or credited wrongly|turned away/i.test(String(data.member_impact || ''))) p = atLeast(p, 'high');
  if (Number(data.affected_count) >= 8) p = atLeast(p, 'high');
  if (/(^|\D)yes\D*(injury|hospital|treatment)/i.test(String(data.injury_risk || ''))) p = 'critical';
  if (/yes — staff suspected|yes — confirmed/i.test(String(data.staff_implicated || ''))) p = atLeast(p, 'high');
  if (sub && /emergency exit|panic|harass|medical|fire|breach|staff theft/i.test(sub.name)) p = atLeast(p, 'critical');
  if (sub && /outage|cannot use it|total outage/i.test(String(data.failure_mode || ''))) p = atLeast(p, 'high');
  if (/high — may not renew/i.test(String(data.churn_risk || ''))) p = atLeast(p, 'high');
  return p;
}
export const PRIO_COLOR = { critical: 'var(--crit)', high: 'var(--high)', medium: 'var(--med)', low: 'var(--low)' };
export const PRIORITY_RANK = RANK;

/* ---------- escalation chain ---------- */
/* The Mumbai service desk is split by site: Akshay takes Kemps/Courtside, Shipra takes Bandra. */
export function studioFrom(data) {
  const s = (data.studio || '').trim();
  if (s && !/^(Select|Other|—|-)/i.test(s)) return s;
  return '';
}
export function deskOverride(sub, studio) {
  if (!/Customer Service/i.test(sub.category || '') || !studio) return null;
  if (/bengaluru|kenkere|copper|cloves/i.test(studio)) return 'Api Serou (Sales & Client Servicing Associate, Bengaluru)';
  if (/bandra|supreme/i.test(studio)) return 'Shipra Pinge (Sales & Client Servicing Associate)';
  return 'Akshay Rane (Sr. Sales & Client Servicing Associate)';
}
export function chainFor(sub, studio, categories) {
  const cat = categories.find(c => c.name === sub.category);
  const inBLR = /bengaluru|kenkere|copper|cloves/i.test(studio || '');
  const centralIT = /IT & Systems/i.test(sub.department || '');
  let owner = (inBLR && !centralIT) ? sub.ownerBengaluru : sub.ownerMumbai;
  owner = deskOverride(sub, studio) || owner;
  const chain = [{ level: 0, who: owner, note: 'Owner (desk)' }];
  const push = (who, note) => {
    if (!who) return;
    const first = String(who).split(/[|·]/)[0].trim();
    if (!chain.some(c => c.who.includes(first.slice(0, 14)))) chain.push({ level: chain.length, who: first, note });
  };
  push(sub.l1, 'Escalation L1');
  push(sub.l2, 'Escalation L2');
  if (inBLR && cat && !/bengaluru|south/i.test(sub.ownerBengaluru || '')) push(sub.ownerBengaluru, 'Regional Ops');
  return chain;
}

/* ---------- descriptive label ---------- */
/** A queue of "AC issue at Kemps" tells nobody anything. Every ticket gets a one-line summary
    built from what the reporter actually said, and it is what the row, the export and the
    handover title all lead with. */
export function ticketLabel(t) {
  const d = t.data || {}, parts = [];
  const yes = v => /^\s*yes\b/i.test(String(v || ''));
  const impact = String(d.member_impact || '').toLowerCase();
  if (/danger|injury|unsafe|blocked|could not|turned away|charged/.test(impact)) parts.push(impact.length < 34 ? d.member_impact : 'member impact');
  if (yes(d.class_impacted)) parts.push('class impacted');
  else if (/not yet|did not run|cancelled/i.test(String(d.class_impacted || ''))) parts.push('class did not run');
  const n = Number(d.affected_count); if (n > 1) parts.push(`${n} affected`);
  if (t.class?.name) parts.push(t.class.name);
  const at = Number(d.attendee_flag_count); if (at > 0) parts.push(`${at} attendee${at > 1 ? 's' : ''} noted`);
  else if (t.class?.attendees?.length) parts.push(`${t.class.attendees.length} attendee note${t.class.attendees.length > 1 ? 's' : ''}`);
  if (t.class?.overbook > 0) parts.push(`${t.class.overbook} over capacity`);
  if (t.class?.waitlist > 0) parts.push(`${t.class.waitlist} waiting`);
  if (/not reproducible|outage|cannot use/i.test(String(d.failure_mode || ''))) parts.push('outage');
  if (/high — may not renew/i.test(String(d.churn_risk || ''))) parts.push('churn risk');
  const studio = String(t.studio || '').split(',')[0].replace(/^the /i, '');
  return [t.subCategory, ...parts, studio].filter(Boolean).join(' · ');
}

/* ---------- the identity this desk files as ---------- */
/* The three personas come from the same pool the demo board is seeded with (see seed() below), so a
   prefilled ticket reads like every other ticket on the board. Emails are derived from the name and
   are always editable — they are a starting point for the desk, not a claim about a real mailbox. */
export const DESK_PERSONAS = [
  { id: 'associate', type: 'Front desk / associate', name: 'Nadiya Shaikh', channel: 'Email' },
  { id: 'trainer', type: 'Trainer', name: 'Pranjali Jain', channel: 'WhatsApp' },
  { id: 'member', type: 'Member', name: 'Rhea Shah', channel: 'WhatsApp' },
];
export const deskEmail = name => {
  const parts = String(name || '').replace(/\(.*?\)/g, '').trim().toLowerCase().split(/[\s.]+/).filter(Boolean);
  if (!parts.length) return '';
  return (parts.length === 1 ? parts[0] : `${parts[0]}.${parts.slice(-1)[0]}`) + '@physique57.com';
};
/* Which persona a ticket implies: class and method noise is a trainer’s, member-facing billing and
   servicing arrive from a member, everything physical starts at the front desk. */
export function personaFor(sub) {
  const hay = `${sub?.category || ''} ${sub?.name || ''} ${sub?.department || ''}`.toLowerCase();
  if (/member|billing|payment|discount|freeze|renewal|complain|servicing/.test(hay)) return DESK_PERSONAS[2];
  if (/trainer|class|schedule|method|substitution|session|roster/.test(hay)) return DESK_PERSONAS[1];
  return DESK_PERSONAS[0];
}
/* A linked member outranks all of that: their directory record already carries the real contact. */
export function reporterFields({ sub, studio, desk, member } = {}) {
  const who = member || (desk && DESK_PERSONAS.find(p => p.id === desk.persona)) || personaFor(sub);
  const staff = who.type !== 'Member';
  const name = (desk && staff && desk.name) ? desk.name : who.name;
  const mail = (desk && staff && desk.contact) ? desk.contact
    : member?.email || (staff ? deskEmail(who.name) : `desk.${String(studio || 'studio').split(',')[0].toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'studio'}@physique57.com`);
  return {
    reporter_type: who.type, reporter_name: name, reporter_contact: mail,
    preferred_contact: desk?.channel || who.channel,
  };
}
/* Only ever fills what the desk has not touched, so it can never overwrite a typed answer. */
export function withReporterDefaults(data, ctx, auto = {}) {
  const defs = reporterFields(ctx);
  const out = { ...data };
  const nextAuto = { ...auto };
  for (const [k, v] of Object.entries(defs)) {
    const cur = out[k];
    const untouched = cur === undefined || cur === null || cur === '';
    const staleAuto = auto[k] !== undefined && String(cur) === String(auto[k]);
    if (untouched || staleAuto) { out[k] = v; nextAuto[k] = v; }
    else if (auto[k] !== undefined) delete nextAuto[k];   // the desk edited it: drop the badge
  }
  return { data: out, auto: nextAuto };
}

/* ---------- the narrative label: one line that tells the desk which ticket this is ---------- */
const firstClause = txt => String(txt || '').replace(/\s+/g, ' ').trim()
  .split(/(?<=[.!?])\s+|[,;—-]\s/)[0] || '';
const quote = t => t.length > 78 ? `“${t.slice(0, 75).trimEnd()}…”` : `“${t}”`;
const ORDINAL = ['', '', ' · II', ' · III', ' · IV', ' · V', ' · VI', ' · VII', ' · VIII'];
/** A short story per ticket: who/where, what happened in the reporter’s own words, and the facts
    that make it different from the next ticket on the same sub-category. Deterministic, and unique
    across the board — collisions get the hour, then the ticket number. */
export function narrativeOf(t) {
  const here = [String(t.studio || '').split(',')[0].replace(/^the /i, ''), t.area].filter(Boolean).join(' · ');
  const facts = ticketLabel(t).split(' · ').filter(p => p && p !== t.subCategory).slice(0, 2);
  const hook = firstClause(t.summary || t.title);
  const lead = `${here || t.category} — ${t.subCategory}`;
  const tail = [hook && hook.toLowerCase() !== String(t.title || '').toLowerCase() ? quote(hook) : '', ...facts]
    .filter(Boolean).join(' · ');
  return (tail ? `${lead}: ${tail}` : lead).slice(0, 168);
}
export function narrate(tickets = []) {
  const seen = new Map();
  const out = {};
  for (const t of [...tickets].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))) {
    let lab = narrativeOf(t);
    const n = (seen.get(lab) || 0) + 1;
    seen.set(lab, n);
    if (n > 1) lab = `${lab}${ORDINAL[n] || ` · #${String(t.number).slice(-4)}`}`;
    if (n > ORDINAL.length - 1) lab = `${lab.split(' · ')[0]} · #${String(t.number).slice(-4)}`;
    out[t.id] = lab;
  }
  return out;
}
/** Two sentences of plain description for the top of a ticket sheet — what happened, and what the
    desk owes whom by when. Built only from stored answers, so it never invents context. */
export function describeTicket(t, labels = fieldLabels) {
  const d = t.data || {};
  const L = k => labels[k] || fieldLabels[k] || k;
  const at = d.occurred_at ? new Date(d.occurred_at) : null;
  const when = at && !Number.isNaN(+at) ? at.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
    : (d.occurred_relative || 'time not recorded');
  const who = [d.reporter_name, d.reporter_type].filter(Boolean).join(' · ');
  const impact = d.member_impact ? `Impact on the member: ${d.member_impact.toLowerCase()}` : '';
  const cls = t.class?.sessionId ? `Class ${t.class.name || '—'} had ${t.class.booked ?? 0} on the roll${t.class.overbook ? `, ${t.class.overbook} over capacity` : ''}${t.class.waitlist ? `, ${t.class.waitlist} waiting` : ''}.` : '';
  const owed = `Routed to ${String(t.assignee || 'the desk').split('(')[0].trim()} at ${t.studio || 'the studio'} — first response ${t.slaLabel || 'per tier'}, ${t.firstResponseAt ? 'answered ' + fmtAt(t.firstResponseAt) : 'still owed'}.`;
  const what = d.summary || t.summary || 'The desk filed this without a written summary; the answers below are the record.';
  return [`${who || 'An unattributed report'} raised “${t.subCategory}” at ${t.studio || 'a studio'} on ${when}. ${String(what).trim()}`,
    [impact, cls].filter(Boolean).join(' '), owed].filter(Boolean).join(' ');
}

/* ---------- ticket factory ---------- */
export function makeTicket({ sub, category, data, studio, chain, hours, priority, kind, linked, recurrence, cls, writeup }) {
  const now = Date.now();
  const catName = sub.category || (category && category.name) || '';
  const title = (data.title || '').trim() ||
    `${sub.name} — ${studio || 'studio'}`;
  const filled = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== '' && v != null && !(Array.isArray(v) && !v.length)));
  const out = {
    id: 'tk_' + now.toString(36) + Math.random().toString(36).slice(2, 7),
    number: `P57-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 9000) + 1000)}`,
    createdAt: now, updatedAt: now,
    title, label: '', narrative: '', summary: data.summary || '',
    category: catName, subCategory: sub.name, kind: kind || 'issue',
    studio, area: data.area || '', city: ownerCity(studio === 'Bengaluru' ? 'Bengaluru' : (studio || '')),
    /* the roll-call snapshot the class desk took; attached here so the label is honest from birth */
    class: cls || null,
    priority, department: sub.department,
    slaLabel: sub.slaLabel, hours: { first: hours.first, res: hours.res },
    frDueAt: now + H(hours.first), resDueAt: now + H(hours.res),
    firstResponseAt: null, resolvedAt: null,
    status: 'new', escalation: 0, assignee: chain[0].who,
    chain, data: filled,
    /* Momence references ride alongside the answers: the chip in the queue and the record
       modal read the id from here, while `data` stays plain text for handover/exports. */
    linked: linked && Object.keys(linked).filter(k => linked[k]) .length ? linked : null,
    recurrenceCount: recurrence || 1,
    timeline: [{ at: now, kind: 'created', text: `Raised by ${data.reporter_name || '—'} · triaged to ${chain[0].who}` }],
  };
  out.label = ticketLabel(out);
  out.narrative = narrativeOf(out);
  /* the paragraph the model wrote from these answers, kept on the ticket so a reload never
     re-bills anyone and the sheet can still show it */
  if (writeup) out.writeup = String(writeup).slice(0, 2400);
  return out;
}

/* ---------- persistence ---------- */
const KEY = 'p57.hub.v1';
export function load() {
  try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch { return null; }
}
export function save(state) {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* quota */ }
}
export const download = (name, text, type = 'application/json') => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
};

/* Every field id in the 3,152-row plan → human label, so a handover never reads like JSON. */
export const fieldLabels = (() => {
  const m = {};
  (DATA.universal || []).forEach(f => { m[f.id] = f.label; });
  Object.values(DATA.subFields || {}).forEach(list => list.forEach(f => { if (!m[f.id]) m[f.id] = f.label; }));
  return m;
})();

/* ---------- handover text (what an associate pastes into Slack/email) ---------- */
export function handover(t, labels) {
  labels = labels || fieldLabels;
  const L = k => labels[k] || fieldLabels[k] || k;
  const rows = Object.entries(t.data)
    .filter(([k, v]) => !['title', 'summary', 'priority_override', 'notes'].includes(k) && String(v).trim() !== '')
    .slice(0, 22)
    .map(([k, v]) => `  ${L(k)}: ${Array.isArray(v) ? v.join(', ') : String(v).slice(0, 90)}`);
  const linkTo = t.linked?.ticket ? (t.linked.ticket.id || t.linked.ticket.label) : t.linkedTicketId;
  const cls = t.class;
  const linkBits = [t.recurrenceCount > 1 ? `report #${t.recurrenceCount}` : linkTo ? 'first report on this reference' : 'single report',
    linkTo ? `linked to ${linkTo}` : ''].filter(Boolean).join(' · ');
  return [
    `${t.number} · ${String(t.priority || 'medium').toUpperCase()} · ${t.status}${linkBits ? ' · ' + linkBits : ' · single report'}`,
    `${t.title}`,
    t.label && t.label !== t.title ? `Label ${t.label}` : '',
    t.narrative ? `Story  ${t.narrative}` : '',
    `${t.category} › ${t.subCategory} · ${t.studio}${t.area ? ' · ' + t.area : ''}`,
    `Dept ${t.department} · Owner ${t.assignee}`,
    `SLA ${t.slaLabel}`,
    `Raised ${fmtAt(t.createdAt)}` + (t.data.reporter_name ? ` by ${t.data.reporter_name}${t.data.reporter_type ? ` (${t.data.reporter_type})` : ''}` : ' — reporter not recorded'),
    `Summary: ${t.summary || '—'}`,
    cls ? `Class ${cls.name || ''} · ${cls.studio || ''} · ${cls.startsAt ? fmtAt(new Date(cls.startsAt).getTime()) : ''}\n`
      + `  Roll ${cls.booked ?? 0} booked / ${cls.attended ?? 0} attended / ${cls.absent ?? 0} absent · ${cls.capacity ?? '—'} places`
      + `${cls.waitlist ? ` · ${cls.waitlist} on the waitlist` : ''}${cls.guests ? ` · ${cls.guests} guests` : ''}${cls.overbook ? ` · ${cls.overbook} over capacity` : ''}\n`
      + `  Host ${cls.hostSituation || cls.trainer || '—'} · source ${cls.source || 'demo'}`
      + (cls.attendees?.length ? `\n${cls.attendees.map(a => `  · ${a.name}${a.status ? ` — ${a.status}` : ''}${(a.actions || []).length ? ` (${a.actions.join(', ')})` : ''}${a.note ? `: ${String(a.note).slice(0, 110)}` : ''}`).join('\n')}` : '') : '',
    rows.length ? `Fields:\n${rows.join('\n')}` : '',
  ].filter(Boolean).join('\n');
}

/* ---------- demo seeds, so the queue is never empty on first open ---------- */
export function seed(data, n = 14) {
  const now = Date.now();
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];
  const out = [];
  const cats = data.categories.filter(c => !/Internal/.test(c.name));
  for (let i = 0; i < n; i++) {
    const cat = pick(cats);
    const sub = pick(cat.subs);
    const studio = pick(data.studios).name;
    const hours = sub.hours;
    const ago = Math.floor(Math.random() * 72 * 3600e3);
    const createdAt = now - ago - 3600e3;
    const chain = chainFor(sub, studio, data.categories);
    const sample = pick([
      { reporter_type: 'Front desk / associate', reporter_name: 'Nadiya Shaikh', member_impact: 'Delayed or degraded', class_impacted: 'No' },
      { reporter_type: 'Member', reporter_name: 'Rhea Shah', member_impact: 'Could not proceed as normal', class_impacted: 'Yes — class was disrupted' },
      { reporter_type: 'Trainer', reporter_name: 'Pranjali Jain', member_impact: 'No impact', class_impacted: 'Only affects setup / pack-down' },
    ]);
    const priority = inferPriority(sub.priority, sample, sub);
    const status = pick(['new', 'triaged', 'in_progress', 'in_progress', 'waiting_on_vendor', 'resolved', 'awaiting_response']);
    const resolved = status === 'resolved';
    const t = makeTicket({
      sub, category: cat, studio, chain, hours, priority,
      data: { ...sample, area: pick(data.roomsByStudio[data.studios.find(s => s.name === studio)?.id] || data.allAreas),
              title: `${sub.name} at ${studio.split(',')[0]}`,
              summary: pick([
                'Flagged during the evening shift; members had to be re-routed to the other room.',
                'Third occurrence this fortnight. Desk has been chasing since Monday.',
                'Raised after a member reported it at the end of class and asked for a follow-up.',
                'Noticed on the pre-class walkthrough and photographed before it was used.',
              ]), occurred_relative: pick(['Just now', 'Earlier today', 'Yesterday', 'Ongoing / recurring']) },
    });
    Object.assign(t, {
      createdAt, updatedAt: now - Math.floor(Math.random() * 20) * 3600e3,
      frDueAt: createdAt + H(hours.first), resDueAt: createdAt + H(hours.res),
      firstResponseAt: status === 'new' ? null : createdAt + Math.floor(Math.random() * hours.first * 3600e3 * 1.4),
      resolvedAt: resolved ? createdAt + Math.floor(Math.random() * hours.res * 3600e3 * 0.8) : null,
      status, escalation: Math.random() > 0.75 ? 1 : 0,
      timeline: [{ at: createdAt, kind: 'created', text: `Raised by ${sample.reporter_name} · triaged to ${chain[0].who}` }],
    });
    if (t.escalation === 1) t.timeline.push({ at: t.updatedAt, kind: 'escalate', text: `Escalated to ${chain[1]?.who || '—'}` });
    if (t.firstResponseAt) t.timeline.push({ at: t.firstResponseAt, kind: 'response', text: `First response sent to reporter by ${t.assignee}` });
    out.push(t);
  }
  return out.sort((a, b) => b.createdAt - a.createdAt);
}
