/* ───────────────────────────────────────────────────────────────────────────────
   The numbers behind Analytics, and the files the owner actually asks for.

   Everything here is arithmetic over the tickets in the store — no chart library, no server. The
   point is that the collapsed “Filter & export” section on the page and the CSV a manager emails
   are computed by the *same* functions, so the file can never disagree with the screen.

   Exports are built in the browser: `download()` in src/core.js wraps a Blob in an object URL, so
   nothing leaves the device.
   ─────────────────────────────────────────────────────────────────────────────── */
import { fmtDur } from './core.js';
import { resolutionChecks } from './resolution.jsx';
import { cleanName, managerOf } from './org.js';

const MIN = 60e3, HR = 3600e3, DAY = 86400e3;
const isLive = t => !['resolved', 'closed'].includes(t.status);
const num = v => (Number.isFinite(Number(v)) ? Number(v) : 0);
export const pct = (a, b) => (b ? Math.round((100 * a) / b) : 0);
export const median = arr => { if (!arr.length) return 0; const s = [...arr].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
export const p90 = arr => { if (!arr.length) return 0; const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(s.length * 0.9))]; };
export const mean = arr => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);
const dur = ms => (!ms ? '—' : fmtDur(ms));

/** RFC-4180 enough: quotes doubled, anything with a comma, quote or newline wrapped. */
export function toCsv(rows, cols) {
  const list = Array.isArray(rows) ? rows : [];
  const head = cols && cols.length ? cols : [...new Set(list.flatMap(r => Object.keys(r || {})))];
  const cell = v => {
    const s = v == null ? '' : String(Array.isArray(v) ? v.join(' | ') : v);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [head.join(','), ...list.map(r => head.map(c => cell(r[c]?.value !== undefined ? r[c].value : r[c])).join(','))].join('\r\n');
}

const rupees = t => { const r = t.resolution || {}; return /credit|refund|₹|passed|extended/i.test(String(r.goodwill || '')) ? num(r.amountINR) : 0; };

/** One flat row per ticket — the sheet a manager pivots. Everything is a string or a number. */
export function ticketRows(list) {
  return (list || []).map(t => {
    const r = t.resolution || {};
    const frMs = (t.firstResponseAt || t.resolvedAt || Date.now()) - t.createdAt;
    const att = t.class || {};
    return {
      number: t.number, raised: new Date(t.createdAt).toISOString(), studio: t.studio || '', area: t.area || '',
      category: t.category || '', sub_category: t.subCategory || '', kind: t.kind || 'issue',
      title: (t.title || '').slice(0, 160), priority: t.priority || '', status: t.status || '',
      escalation_step: num(t.escalation) + 1, chain_depth: (t.chain || []).length,
      owner: cleanName(t.assignee), manager: cleanName((t.chain || [])[num(t.escalation) + 1]?.who || ''),
      reporter: cleanName(t.data?.reporter_name) || '', member: cleanName(t.data?.member_name) || '',
      member_id: t.linked?.member?.id || '', session_id: att.sessionId || '',
      class_booked: num(att.booked), class_attended: num(att.attended), class_absent: num(att.absent), class_over: num(att.overbook),
      attendee_notes: (att.attendees || []).length || Object.keys(att.attendees || {}).length,
      first_response_min: Math.round(frMs / MIN), fr_target_min: Math.round(((t.frDueAt || 0) - t.createdAt) / MIN),
      fr_hit: (t.firstResponseAt || t.resolvedAt || 0) <= (t.frDueAt || 0),
      resolution_hr: t.resolvedAt ? +((t.resolvedAt - t.createdAt) / HR).toFixed(2) : '',
      repeats: num(t.recurrenceCount) || 1, reopened: (t.timeline || []).some(e => e.kind === 'reopen'),
      breached: isLive(t) && Date.now() > (t.resDueAt || Infinity),
      cause_category: r.causeCategory || '', cause: (r.cause || '').slice(0, 200), action: (r.action || '').slice(0, 200),
      outcome: r.outcome || '', goodwill: r.goodwill || '', goodwill_inr: rupees(t),
      proof: r.proof || '', verified_by: cleanName(r.verifiedBy || ''), closure_note: (r.closureNote || '').slice(0, 240),
      linked_to: t.linkedTicketId || t.data?.linked_ticket || '',
    };
  });
}

/** Attainment per category: who is quiet because nothing breaks, and who is quiet because it all closes. */
export function categoryStats(list) {
  const m = new Map();
  for (const t of list || []) {
    const k = t.category || 'Uncategorised';
    const row = m.get(k) || { category: k, raised: 0, open: 0, breach: 0, closed: 0, frHit: 0,
      fr: [], res: [], goodwill: 0, repeats: 0, reopened: 0, depts: new Set(), subs: new Set(), quality: [], worst: '' };
    row.raised++; row.subs.add(t.subCategory); row.depts.add(t.department);
    if (isLive(t)) { row.open++; if (Date.now() > (t.resDueAt || Infinity)) row.breach++; }
    if (t.resolvedAt) { row.closed++; row.res.push(t.resolvedAt - t.createdAt);
      if ((t.firstResponseAt || t.resolvedAt) <= t.frDueAt) row.frHit++; }
    row.fr.push((t.firstResponseAt || t.resolvedAt || Date.now()) - t.createdAt);
    row.goodwill += rupees(t); row.repeats += Math.max(0, (num(t.recurrenceCount) || 1) - 1);
    if ((t.timeline || []).some(e => e.kind === 'reopen')) row.reopened++;
    if (t.resolution) row.quality.push(resolutionChecks(t.resolution, t).filter(c => c.ok).length);
    m.set(k, row);
  }
  return [...m.values()].map(r => ({
    ...r, depts: [...r.depts].join(' / '), subs: r.subs.size,
    frHitPct: pct(r.frHit, r.closed || r.raised), medFr: median(r.fr), medRes: median(r.res), p90Res: p90(r.res),
    openPct: pct(r.open, r.raised), breachPct: pct(r.breach, r.raised),
    closureQuality: r.quality.length ? Math.round(mean(r.quality) / 8 * 100) : 0,
    frLabel: dur(median(r.fr)), resLabel: dur(median(r.res)), p90Label: dur(p90(r.res)),
  })).sort((a, b) => b.raised - a.raised || a.frHitPct - b.frHitPct);
}

/** Who is holding what, and how fast they answer — the table the owner reads top-down. */
export function ownerStats(list, org) {
  const m = new Map();
  for (const t of list || []) {
    const k = cleanName(t.assignee) || 'Unassigned';
    const row = m.get(k) || { owner: k, open: 0, closed: 0, breach: 0, fr: [], res: [], goodwill: 0, cats: new Set(), reopened: 0 };
    if (isLive(t)) { row.open++; if (Date.now() > (t.resDueAt || Infinity)) row.breach++; } else row.closed++;
    if (t.resolvedAt) row.res.push(t.resolvedAt - t.createdAt);
    row.fr.push((t.firstResponseAt || t.resolvedAt || Date.now()) - t.createdAt);
    row.goodwill += rupees(t); row.cats.add(t.category);
    if ((t.timeline || []).some(e => e.kind === 'reopen')) row.reopened++;
    m.set(k, row);
  }
  return [...m.values()].map(r => ({
    ...r, cats: [...r.cats], categories: r.cats.size, manager: org ? (managerOf(org, r.owner) || '') : '',
    medFr: median(r.fr), frLabel: dur(median(r.fr)), resLabel: dur(median(r.res)),
    quality: r.closed ? '—' : '—',
  })).sort((a, b) => (b.open - a.open) || (b.breach - a.breach) || a.owner.localeCompare(b.owner));
}

/** Chronic faults: the second and third report of one thing, which is a decision, not a spike. */
export function chronicStats(list) {
  const m = new Map();
  for (const t of list || []) {
    const k = `${t.category} › ${t.subCategory}`;
    const row = m.get(k) || { key: k, category: t.category, sub: t.subCategory, reports: 0, studios: new Set(),
      escalations: 0, goodwill: 0, last: 0, openNow: 0, medFr: [] };
    row.reports += Math.max(1, num(t.recurrenceCount) || 1);
    row.studios.add(t.studio || '—'); row.last = Math.max(row.last, t.createdAt || 0);
    if (t.escalation > 0 || t.isEscalated) row.escalations++;
    row.goodwill += rupees(t); if (isLive(t)) row.openNow++;
    row.medFr.push((t.firstResponseAt || Date.now()) - t.createdAt);
    m.set(k, row);
  }
  return [...m.values()].filter(r => r.reports > 1).map(r => ({
    ...r, studios: [...r.studios], studiosAt: r.studios.size, medFr: median(r.medFr),
    medFrLabel: dur(median(r.medFr)), lastAgo: r.last ? `${Math.max(1, Math.round((Date.now() - r.last) / DAY))} d ago` : '—',
  })).sort((a, b) => b.reports - a.reports || b.escalations - a.escalations);
}

/** Filing shape: hour of day × weekday, so a rota can be argued from evidence. */
export function clockGrid(list, days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']) {
  const grid = days.map(d => ({ day: d, hours: Array(24).fill(0), total: 0 }));
  const at = i => i;
  for (const t of list || []) {
    const d = new Date(t.createdAt);
    const di = (d.getDay() + 6) % 7;
    const hi = d.getHours();
    if (grid[di]) { grid[di].hours[hi]++; grid[di].total++; }
  }
  const max = Math.max(1, ...grid.flatMap(r => r.hours));
  const byHour = Array.from({ length: 24 }, (_, h) => grid.reduce((n, r) => n + r.hours[h], 0));
  const peakHour = byHour.indexOf(Math.max(...byHour));
  const peakDay = grid.slice().sort((a, b) => b.total - a.total)[0]?.day || '—';
  return { grid, days, max, byHour, peakHour, peakDay, at };
}

/** How complete the filed records are, per checklist point — the metric the rail is judged by. */
export function closureQuality(list) {
  const closed = (list || []).filter(t => t.resolution);
  const ids = ['cause', 'action', 'member', 'prevent', 'proof', 'signoff', 'money', 'closure'];
  const rows = ids.map(id => ({ id, label: '', filled: 0, of: closed.length }));
  for (const t of closed) {
    const cs = resolutionChecks(t.resolution, t);
    cs.forEach((c, i) => { if (c.ok) rows[i].filled++; rows[i].label = c.label; });
  }
  return { of: closed.length, rows: rows.map(r => ({ ...r, pct: pct(r.filled, r.of) })),
    full: closed.filter(t => resolutionChecks(t.resolution, t).every(c => c.ok)).length };
}

/** Weekly trend, oldest first, in five-day buckets — enough resolution to see a bad week. */
export function weekTrend(list) {
  const m = new Map();
  for (const t of list || []) {
    const d0 = new Date(t.createdAt); d0.setHours(0, 0, 0, 0);
    const wk = new Date(d0); wk.setDate(d0.getDate() - ((d0.getDay() + 6) % 7));
    const k = wk.getTime();
    const row = m.get(k) || { week: k, raised: 0, closed: 0, breach: 0, fr: [] };
    row.raised++;
    if (t.resolvedAt) { row.closed++; row.fr.push((t.firstResponseAt || t.resolvedAt) - t.createdAt); }
    if (isLive(t) && Date.now() > (t.resDueAt || Infinity)) row.breach++;
    m.set(k, row);
  }
  return [...m.values()].sort((a, b) => a.week - b.week).map(r => ({
    ...r, label: new Date(r.week).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
    medFr: median(r.fr), medFrLabel: dur(median(r.fr)),
    backback: r.raised - r.closed,
  }));
}

/** The money view: goodwill by cause, because that is what the owner asks about first. */
export function goodwillStats(list) {
  const m = new Map();
  let total = 0, count = 0;
  for (const t of list || []) {
    const v = rupees(t); if (!v) continue;
    total += v; count++;
    const k = (t.resolution?.causeCategory) || 'Not recorded';
    const row = m.get(k) || { cause: k, inr: 0, tickets: 0 };
    row.inr += v; row.tickets++; m.set(k, row);
  }
  return { total, count, avg: count ? Math.round(total / count) : 0,
    byCause: [...m.values()].sort((a, b) => b.inr - a.inr) };
}

/** Everything the collapsed panel can narrow by, in one object, so the state stays legible. */
export const emptyFilter = () => ({ from: '', to: '', cat: '', dept: '', prio: '', studio: '', status: 'all',
  onlyClass: false, onlyBreach: false, onlyRepeat: false, onlyClosure: false, q: '' });

export function applyFilter(list, f = {}) {
  const from = f.from ? new Date(`${f.from}T00:00:00`).getTime() : 0;
  const to = f.to ? new Date(`${f.to}T23:59:59`).getTime() : Infinity;
  const q = String(f.q || '').trim().toLowerCase();
  return (list || []).filter(t => {
    if (from && t.createdAt < from) return false;
    if (to && t.createdAt > to) return false;
    if (f.cat && t.category !== f.cat) return false;
    if (f.dept && t.department !== f.dept) return false;
    if (f.prio && t.priority !== f.prio) return false;
    if (f.studio && t.studio !== f.studio) return false;
    if (f.status === 'live' && !isLive(t)) return false;
    if (f.status === 'closed' && isLive(t)) return false;
    if (f.onlyClass && !(t.class?.sessionId || t.kind === 'hosted-class')) return false;
    if (f.onlyBreach && !(isLive(t) && (Date.now() > (t.resDueAt || Infinity) || Date.now() > (t.frDueAt || Infinity)))) return false;
    if (f.onlyRepeat && (num(t.recurrenceCount) || 1) < 2) return false;
    if (f.onlyClosure && !t.resolution?.closureNote) return false;
    if (q && !`${t.number} ${t.title} ${t.subCategory} ${t.category} ${t.studio} ${cleanName(t.assignee)} ${t.data?.member_name || ''} ${t.summary || ''} ${t.writeup || ''}`
      .toLowerCase().includes(q)) return false;
    return true;
  });
}
export const activeFilters = f => Object.entries(f || {})
  .filter(([k, v]) => v && v !== emptyFilter()[k]).map(([k]) => k);

/** The paragraph that gets pasted into the owners’ group: plain text, no markdown, real numbers. */
export function weeklyReport(stats) {
  const { list = [], cats = [], owners = [], quality = {}, chronic = [], money = {}, trend = [], grid = {} } = stats || {};
  const last = trend[trend.length - 1];
  const worst = cats.slice().sort((a, b) => a.frHitPct - b.frHitPct)[0];
  const busiest = owners[0];
  return [
    `Physique 57 · support desk · ${new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}`,
    `${list.length} tickets read · ${list.filter(t => isLive(t)).length} still open · ${quality.of || 0} with a resolution record.`,
    last ? `This week (${last.label}): ${last.raised} raised, ${last.closed} closed, ${last.breach} past clock, median first response ${last.medFrLabel}.` : '',
    cats.length ? `Sharpest: ${cats[0].category} (${cats[0].raised} raised, ${cats[0].frHitPct}% answered in SLA, median resolution ${cats[0].resLabel}).` : '',
    worst ? `Needs attention: ${worst.category} — ${worst.frHitPct}% first-response hit over ${worst.raised}, ${worst.breach} past clock.` : '',
    busiest ? `Load: ${busiest.owner} is holding ${busiest.open}${busiest.manager ? ` and reports to ${busiest.manager}` : ''}.` : '',
    chronic.length ? `Repeats: ${chronic[0].sub} has been reported ${chronic[0].reports} times across ${chronic[0].studiosAt} studio${chronic[0].studiosAt === 1 ? '' : 's'} — ${chronic[0].escalations} of them escalated.` : 'Repeats: nothing filed twice.',
    money.total ? `Goodwill: ₹${money.total.toLocaleString('en-IN')} across ${money.count} ticket${money.count === 1 ? '' : 's'} (avg ₹${money.avg.toLocaleString('en-IN')}).` : 'Goodwill: none recorded.',
    grid.peakHour != null ? `Rhythm: most tickets are filed on ${grid.peakDay} around ${String(grid.peakHour).padStart(2, '0')}:00 — the rota should reflect that.` : '',
    `Closure quality: ${quality.full || 0} of ${quality.of || 0} records pass all eight points of the close-out checklist.`,
  ].filter(Boolean).join('\n');
}

export default { toCsv, ticketRows, categoryStats, ownerStats, chronicStats, clockGrid, closureQuality,
  weekTrend, goodwillStats, applyFilter, emptyFilter, activeFilters, weeklyReport, pct, median, p90 };
