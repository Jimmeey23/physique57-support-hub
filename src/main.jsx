import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import DATA from './data.json';
import svg, { I } from './icons.jsx';
import {
  chainFor, inferPriority, makeTicket, load, save, seed, download, handover, H, PRIORITY_RANK,
  studioFrom, fieldLabels, narrate, narrativeOf, describeTicket, withReporterDefaults,
  DESK_PERSONAS, deskEmail,
} from './core.js';
import {
  Countdown, Pill, StatusPill, Avatar, OwnerCell, IconBtn, Modal, Toasts, Search, Stats, STATUS, fmtDur, fmtAt, cx,
} from './ui.jsx';
import { buildOrg, viewerOptions, upline, directReports, resolutionRights, ownershipLine, cleanName as orgClean } from './org.js';
import { ResolutionRail } from './resolution.jsx';
import { narrateTicket, triageAdvice, aiReady, readKey, writeKey, maskKey, memberReplyDraft, AI_MODELS } from './ai.js';
import FormEngine, { buildFields, isVisible } from './forms.jsx';
import { LookupControl, RecordModal, AttendeeRoster, decodeLookup, decodeLookups, encodeLookup, encodeLookups,
  MODULE_META, hasLookup } from './lookups.jsx';
import { listMomence, detailMomence, readOnlyNotice, DEMO_SOURCE, listSessionBookings } from './momence.js';
import { ReviewModal, ResolutionModal, LinkTicketModal, SettingsModal, CycleTemplateModal, CommandPalette,
  ClassDesk, TrainerDesk, autofillMissing, TicketSheet } from './modals.jsx';
import { ATT_ACTION, ATT_STATUS, ATT_TAGS, CLASS_ASPECT } from './vocab.js';
import { trainerDirectory, populateSession, populateMember, sessionStats } from './momence.js';
import CONSTANTS from './constants.json';
import { cache as themeCache, themeVars, glyphSvg } from './themes.js';
import Picker from './picker.jsx';
import * as X from './export.js';
import { trainerReport } from './assessments.js';
import { TrainerReport } from './report.jsx';
import MomenceActions, { receiptText } from './actions.jsx';
import { FormHost, FORMS } from './embed.jsx';
import brandLight from './assets/brand-light-128.png';
import brandDark from './assets/brand-dark-128.png';
import './styles.css';

/* ------------------------------- utilities ------------------------------- */
const PC = { critical: 'var(--crit)', high: 'var(--high)', medium: 'var(--med)', low: 'var(--low)' };
const usePersist = (k, init) => {
  const [v, s] = useState(() => { try { const r = localStorage.getItem(k); return r ? JSON.parse(r) : init; } catch { return init; } });
  useEffect(() => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }, [k, v]);
  return [v, s];
};
const useNow = (ms = 1000) => { const [n, s] = useState(Date.now()); useEffect(() => { const i = setInterval(() => s(Date.now()), ms); return () => clearInterval(i); }, [ms]); return n; };
const filled = v => v !== '' && v != null && !(Array.isArray(v) && !v.length);
const dayKey = ts => new Date(ts).toLocaleDateString('en-IN', { weekday: 'short' });
const short = s => String(s || '').replace(/\s*\(.*?\)\s*/g, '');
const objOf = v => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
const copy = async t => { try { await navigator.clipboard.writeText(t); return true; } catch {
  const a = document.createElement('textarea'); a.value = t; document.body.appendChild(a); a.select();
  const ok = document.execCommand('copy'); a.remove(); return ok; } };

const LABELS = fieldLabels;
/* Where a hosted-class ticket lands by default: the scheduling desk, with the sub-category
   selectable on the desk itself. */
const CLASS_SUB_CANDIDATES = ['Scheduling|||Class Overbooking / Unregistered Attendance',
  'Scheduling|||Class Capacity Issues', 'Scheduling|||Waitlist Concerns', 'Scheduling|||Trainer Substitutions',
  'Scheduling|||Class Substitutions', 'Scheduling|||Last-minute Cancellations', 'Scheduling|||Booking Confirmation Issues',
  'Safety, Security & Compliance|||Injury or Medical Incident', 'Repair and Maintenance|||Equipment Malfunction'];
const firstClassSub = () => CLASS_SUB_CANDIDATES.find(k => {
  const [c, n] = k.split('|||');
  const cat = DATA.categories.find(x => x.name === c);
  return cat && cat.subs.some(s => s.name === n);
}) || 'Scheduling|||Class Capacity Issues';
const CLASS_DEFAULT_SUB = firstClassSub();

/* ================================ APP ================================ */
function App() {
  const boot = useMemo(() => {
    const st = load();
    if (st && Array.isArray(st.tickets)) return st;
    const t = seed(DATA, 16);
    return { tickets: t, archived: t.filter(x => x.status === 'resolved'), theme: 'light', seeded: true };
  }, []);

  const [view, setViewRaw] = useState('triage');
  const setView = useCallback(v => setViewRaw(x => (x === 'intake' && v === 'triage') ? 'triage' : v), []);
  const [tickets, setTickets] = usePersist('p57.hub.v1.tickets', boot.tickets);
  const [archived, setArchived] = usePersist('p57.hub.v1.archived', boot.archived || []);
  const [theme, setTheme] = usePersist('p57.hub.v1.theme', boot.theme || 'light');
  const [cat, setCat] = useState(null);
  const [search, setSearch] = useState('');
  const [sub, setSub] = useState(null);
  /* opening a sub-category enters the intake view; closing it returns to triage,
     while the topbar highlight stays on “Raise a ticket” either way */
  useEffect(() => { setViewRaw(sub ? 'intake' : v => (v === 'intake' ? 'triage' : v)); }, [sub]);
  const [data, setData] = useState({});
  const [errors, setErrors] = useState({});
  const [requiredOnly, setRequiredOnly] = useState(false);
  const [collapsed, setCollapsed] = useState(new Set());
  const [toasts, setToasts] = useState([]);
  const [openId, setOpenId] = useState(null);
  /* The desk files as one person all shift long: the reporter block is prefilled from here, and
     `autoFill` remembers which answers were written by the hub so the badge clears on edit. */
  const [desk, setDesk] = usePersist('p57.hub.v1.desk', null);
  const [autoFill, setAutoFill] = useState({});
  const [sheet, setSheet] = useState(null);
  const [showHelp, setShowHelp] = useState(false);
  const [done, setDone] = useState(null);
  const [statusFilter, setStatusFilter] = useState('live');
  const [prioFilter, setPrioFilter] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [ownerFilter, setOwnerFilter] = useState('');
  const [studioFilter, setStudioFilter] = useState('');
  const [sort, setSort] = useState('sla');
  const [onlyClass, setOnlyClass] = useState(false);
  const [q, setQ] = useState('');
  const [prefs, setPrefs] = usePersist('p57.hub.v1.prefs', {
    theme: 'light', density: 'cosy', appearance: 'editorial', animateCounters: true, skeletons: true, pulse: true });
  /* The write-up: OpenAI turns the answers already on the form into prose. Nothing here runs
     without a key on this device, and the local line from src/core.js is always the fallback. */
  const [aiKey, setAiKeyRaw] = useState(() => readKey());
  const [aiModel, setAiModel] = usePersist('p57.hub.v1.ai.model', AI_MODELS[0]);
  const [aiAuto, setAiAuto] = usePersist('p57.hub.v1.ai.auto', true);
  const [aiText, setAiText] = useState('');
  const [aiBusy, setAiBusy] = useState('');
  const [aiErr, setAiErr] = useState('');
  const [aiMeta, setAiMeta] = useState(null);
  const [aiAdvice, setAiAdvice] = useState(null);
  /* Analytics keeps its own filters: narrowing the numbers must not silently narrow the queue.
     The panel starts shut, because the desk wants the picture first and the knobs second. */
  const [axF, setAxF] = usePersist('p57.hub.v1.ax', X.emptyFilter());
  const [axOpen, setAxOpen] = usePersist('p57.hub.v1.ax.open', false);
  /* Which Fillout/Zite ids this device embeds, and what it may do with them. */
  const [formIds, setFormIds] = usePersist('p57.hub.v1.forms', {});
  const axSetF = (k, v) => setAxF(f => ({ ...f, [k]: f[k] === v && k !== 'status' && k !== 'q' ? '' : v }));
  const axCsv = (name, rows, cols) => { download(name, X.toCsv(rows, cols), 'text/csv');
    toast('Written out', `${rows.length} rows in ${name} — built from the same numbers on screen.`, 'ok'); };
  const setAiKey = k => { writeKey(k); setAiKeyRaw(String(k || '').trim()); };
  const [review, setReview] = useState(null);
  const [pendingLink, setPendingLink] = useState(null);
  const [resolving, setResolving] = useState(null);
  const [linkFromQueue, setLinkFromQueue] = useState(null);
  const [settings, setSettings] = useState(false);
  /* the board is the desk’s work — wiping it deserves a door with a handle on it */
  const [wipe, setWipe] = useState(false);
  const [cycleModal, setCycleModal] = useState(false);
  const [record, setRecord] = useState(null);
  const [momenceStatus, setMomenceStatus] = useState('demo');
  const [palette, setPalette] = useState(false);
  const [searching, setSearching] = useState(false);
  /* the class desk keeps its own little workspace: the chosen session, the class-level answers
     and one entry per attendee. All three fold onto the ticket, so nothing is stored twice. */
  const [captured, setCaptured] = useState({});
  const [classEntries, setClassEntries] = useState({});
  const [trainerSel, setTrainerSel] = useState(null);
  const now = useNow(1000);
  const searchRef = useRef(null);

  /* Appearance lives on <html> so a single selector chain restyles every surface, and the
     theme state here stays the source of truth for the persisted `theme` key too. */
  useEffect(() => {
    const d = document.documentElement;
    d.dataset.theme = prefs.theme === 'auto'
      ? (typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      : prefs.theme;
    d.dataset.density = prefs.density;
    d.dataset.appearance = prefs.appearance;
    d.dataset.motion = prefs.pulse && prefs.animateCounters ? 'full' : 'calm';
  }, [prefs]);
  useEffect(() => { setPrefs(p => (p.theme === theme ? p : { ...p, theme })); }, [theme]);
  /* Filtered grids recompute over 296 sub-categories, so they get a beat of skeleton rather
     than a hard swap. Skipped entirely when the desk has turned skeleton loaders off. */
  useEffect(() => {
    if (!search || !prefs.skeletons) { setSearching(false); return undefined; }
    setSearching(true);
    const id = setTimeout(() => setSearching(false), 130);
    return () => clearTimeout(id);
  }, [search, prefs.skeletons]);
  const toast = useCallback((title, body, tone) => {
    const id = Math.random().toString(36).slice(2);
    setToasts(t => [...t, { id, title, body, tone }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 5200);
  }, []);

  /* ---------- derived ---------- */
  const all = useMemo(() => [...tickets, ...archived], [tickets, archived]);

  /* ── who is looking at the board, and what that person may write ───────────────
     The org chart is read out of the escalation ladder the taxonomy already carries, so the
     reporting line is never a second source of truth. Everything the rails show hangs off it. */
  const org = useMemo(() => buildOrg(DATA.categories, [...tickets, ...archived]), [tickets, archived]);
  const [viewerName, setViewerName] = usePersist('p57.hub.v1.viewer', '');
  const people = useMemo(() => viewerOptions(org), [org]);
  const viewer = useMemo(() => people.find(p => p.name === viewerName) || people[0] || null, [people, viewerName]);
  const focus = useMemo(() => all.find(x => x.id === (sheet || openId)) || null, [all, sheet, openId]);
  const [mineOn, setMineOn] = usePersist('p57.hub.v1.mine', false);
  const live = useMemo(() => {
    const list = tickets.map(t => {
      const left = t.frDueAt - now, closed = false;
      const breach = !closed && left <= 0;
      return { ...t, _breach: breach, _left: left, _risk: !breach && left < Math.max(36e5, (t.frDueAt - t.createdAt) * .25) };
    });
    const f = list.filter(t =>
      (statusFilter === 'live' ? !['resolved', 'closed'].includes(t.status)
        : statusFilter === 'all' ? true : t.status === statusFilter)
      && (!prioFilter || t.priority === prioFilter)
      && (!deptFilter || t.department === deptFilter)
      && (!ownerFilter || String(t.chain[Math.min(t.escalation, t.chain.length - 1)]?.who).includes(ownerFilter))
      && (!studioFilter || t.studio === studioFilter)
      && (!onlyClass || !!(t.class?.sessionId || t.kind === 'hosted-class'))
      && (!mineOn || (short(t.assignee) === viewer?.name && !['resolved', 'closed'].includes(t.status)))
      && (!q || (t.title + ' ' + (t.label || '') + t.number + t.subCategory + t.category + (t.data.member_name || '') + t.studio + t.summary
        + (t.class?.name || '') + (t.class?.attendees || []).map(a => a.name + ' ' + (a.note || '')).join(' ')).toLowerCase().includes(q.toLowerCase())));
    const bySla = (a, b) => a._left - b._left;
    const byPri = (a, b) => PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority] || a._left - b._left;
    const byNew = (a, b) => b.createdAt - a.createdAt;
    return f.sort(sort === 'sla' ? bySla : sort === 'priority' ? byPri : sort === 'newest' ? byNew : (a, b) => a._left - b._left)
      .sort((a, b) => (b._breach - a._breach) || (sort === 'sla' ? bySla(a, b) : 0));
  }, [tickets, now, statusFilter, prioFilter, deptFilter, ownerFilter, studioFilter, q, sort, onlyClass, mineOn, viewer]);

  /* ---- hosted-class workspace derivations ---- */
  const classDeskId = decodeLookups(captured.class_date)[0]?.id || null;
  const classTickets = useMemo(() => all.filter(t => t.class?.sessionId || t.kind === 'hosted-class'), [all]);
  const flaggedAttendees = Object.values(classEntries)
    .filter(e => e && (e.status || (e.tags || []).length || (e.actions || []).length || (e.note || '').trim())).length;
  const trainerDir = useMemo(() => trainerDirectory(all, 14), [all]);
  const [presetsRaw, setPresets] = usePersist('p57.hub.v1.presets', null);
  const presets = presetsRaw || [
    { id: 'breach', label: 'Breaching now', q: { statusFilter: 'live', prioFilter: '', sort: 'sla' } },
    { id: 'mine', label: 'Waiting on a member', q: { statusFilter: 'awaiting_response', prioFilter: '', sort: 'sla' } },
    { id: 'class', label: 'Class tickets', q: { statusFilter: 'live', prioFilter: '', sort: 'sla', onlyClass: true } },
  ];
  const breaches = live.filter(t => t._breach).length;
  const atRisk = live.filter(t => t._risk).length;
  const due2 = live.filter(t => !t._breach && t._left < H(2)).length;

  const fields = useMemo(() => sub ? buildFields(data, `${sub.category}|||${sub.name}`, DATA, studioFrom(data)) : [], [sub, data]);
  const visible = useMemo(() => fields.filter(f => isVisible(f, data)), [fields, data]);
  const missing = useMemo(() => visible.filter(f => f.required && !filled(data[f.id])), [visible, data]);
  const livePriority = useMemo(() => sub ? inferPriority(sub.priority, data, sub) : 'medium', [sub, data]);
  /* whether the answers so far have pushed the priority above the sub-category’s own default */
  const raised = !!sub && livePriority !== sub.priority;
  /* The reference only insists on a member record when someone is reporting on a member's
     behalf, and only insists on a session when a class was actually involved. */
  const gating = useMemo(() => {
    if (!sub) return [];
    const out = [];
    const isStaff = /front desk|colleague|walkthrough|audit|myself/i.test(String(data.reporter_type || ''));
    if (isStaff && !hasLookup(data.member_name)) out.push({ id: 'member_name', label: 'Member', _gate: 'pick the member this is about' });
    const classTouched = filled(data.class_impacted) || !!data.class_date || /class|session/i.test(sub.name + ' ' + sub.department);
    if (classTouched && !hasLookup(data.class_date)) out.push({ id: 'class_date', label: 'Class', _gate: 'link the affected class' });
    return out;
  }, [sub, data]);
  const studio = studioFrom(data);
  const previewChain = useMemo(() => sub ? chainFor(sub, studio, DATA.categories) : [], [sub, studio]);
  const stories = useMemo(() => narrate([...tickets, ...archived]), [tickets, archived]);
  /* Auto-populate the reporter block: never over an answer the desk has touched, and again every
     time the studio or the linked member changes, because those decide who is actually reporting. */
  useEffect(() => {
    if (!sub) { setAutoFill({}); return; }
    const ref = decodeLookup(data.member_name);
    const hit = ref?.id ? detailMomence('members', String(ref.id)) : null;
    const member = hit && !hit.error ? hit.item : null;
    const next = withReporterDefaults(data, { sub, studio, desk, member }, autoFill);
    const changed = Object.keys(next.data).filter(k => next.data[k] !== data[k]);
    if (changed.length) setData(d => ({ ...d, ...Object.fromEntries(changed.map(k => [k, next.data[k]])) }));
    if (JSON.stringify(next.auto) !== JSON.stringify(autoFill)) setAutoFill(next.auto);
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [sub?.name, studio, data.member_name, desk]);

  /* ---------- actions ---------- */
  const openSub = (c, s) => {
    setSub({ ...s, category: c.name });
    setData(d => ({
      occurred_relative: 'Just now', reporter_type: 'Front desk / associate',
      preferred_contact: 'WhatsApp', studio: d.studio || '',
      occurred_at: new Date(Date.now() - new Date().getTimezoneOffset() * 6e4 - 36e5).toISOString().slice(0, 16),
    }));
    setErrors({}); setView('intake'); window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const reviewThenFile = () => {
    if (missing.length) {
      const e = {}; missing.forEach(f => e[f.id] = 'Required for this sub-category');
      setErrors(e);
      const el = document.querySelector('[data-fid="' + (missing[0] || gating[0]).id + '"]');
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      toast('Nothing sent', `${missing.length} required field${missing.length > 1 ? 's' : ''} still need an answer.`, 'bad');
      return;
    }
    if (gating.length) {
      const e = {}; gating.forEach(f => e[f.id] = f._gate);
      setErrors(e);
      const el = document.querySelector('[data-fid="' + gating[0].id + '"]');
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      toast('One linked record missing', `${gating.map(g => g.label).join(' and ')} still needs to be chosen.`, 'bad');
      return;
    }
    /* A probable repeat should be merged into the open ticket, not filed as a second clock —
       the same question the reference asks before it creates anything. */
    const dupish = !filled(data.linked_ticket) && (/yes/i.test(String(data.is_repeat || ''))
      || tickets.some(t => t.subCategory === sub.name && t.studio === studio));
    setReview({ at: Date.now(), dupish });
  };
  /* A ticket-shaped view of what is on the form right now. The model only ever sees these facts,
     so a bad answer can produce a bad sentence but never an invented machine or member. */
  const draftTicket = () => (sub ? ({
    id: 'draft', number: 'draft', studio, category: sub.category, subCategory: sub.name, label: sub.name,
    priority: livePriority, status: 'new', data: { ...data }, summary: data.summary || '',
    chain: previewChain, recurrenceCount: 1, slaLabel: sub.slaLabel, hours: { first: sub.hours.first, res: sub.hours.res },
  }) : null);
  const runWriteup = async () => {
    const t = draftTicket();
    if (!t) return;
    if (!aiReady(aiKey)) { setAiErr('No OpenAI key on this device. Add one in Settings → Integrations to write with the model.'); return; }
    setAiBusy('write'); setAiErr('');
    const r = await narrateTicket(t, { key: aiKey, model: aiModel });
    setAiBusy('');
    if (!r.ok) { setAiErr(r.error || 'the model did not answer'); return; }
    setAiText(r.text); setAiMeta({ words: r.words, model: r.model, ms: r.ms, usage: r.usage });
  };
  /* A desk-typed description outranks a generated one: the write-up only fills the field when it is
     empty, and otherwise rides with the ticket as `writeup` so nothing that was typed is replaced. */
  const applyWriteup = () => {
    const text = aiText.trim(); if (!text) return;
    const typed = String(data.summary || '').trim();
    if (!typed) setData(d => ({ ...d, summary: text }));
    toast(typed ? 'The write-up rides with the ticket' : 'Write-up put on the form', typed
      ? `${text.split(/\s+/).length} words kept beside your own description — it prints under the story and in the handover.`
      : `${text.split(/\s+/).length} words now in the description — check them before you file.`, 'ok');
  };
  const runAdvice = async () => {
    const t = draftTicket();
    if (!t) return;
    if (!aiReady(aiKey)) { setAiErr('No OpenAI key on this device — the priority the taxonomy inferred stays as it is.'); return; }
    setAiBusy('advice'); setAiErr('');
    const r = await triageAdvice(t, { key: aiKey, model: aiModel });
    setAiBusy('');
    if (!r.ok) { setAiErr(r.error || 'the model did not answer'); return; }
    setAiAdvice(r);
  };
  const buildTicket = (patchData = {}) => {
    if (!sub) return null;
    const hours = { first: sub.hours.first, res: sub.hours.res };
    /* fill whatever the desk did not answer from the same controlled lists, so a class ticket is
       never blocked on an unrelated required field, and never stores a blank */
    const merged = autofillMissing(fields, { ...data, ...patchData }, {});
    /* a hosted-class ticket carries the roll call with it: the snapshot of what Momence showed
       when the desk filed it, plus one entry per attendee the desk actually wrote something on. */
    const cls = merged.kind === 'hosted-class' && classDeskId ? classSnapshot(classDeskId) : null;
    const t = makeTicket({ sub, category: DATA.categories.find(c => c.name === sub.category), data: merged, studio,
      chain: previewChain, hours, priority: livePriority, kind: merged.kind || 'issue',
      writeup: aiText.trim() || undefined,
      linked: { member: decodeLookup(merged.member_name), session: decodeLookup(merged.class_date),
                ticket: decodeLookup(merged.linked_ticket),
                attendees: decodeLookups(merged.affected_members) }, cls });
    return t;
  };
  /* A roster edit and the “build the ticket” click can land in one batch, and `captured` already
     holds those notes — so the roll is read from the same pending value, never from the last
     render’s state, or the desk would file notes it just lost. */
  const pendingClassEntries = () => (captured && captured._classEntries) || classEntries;
  const classSnapshot = id => {
    const det = detailMomence('sessions', String(id)); const raw = det.item?.raw || {};
    const st = det.related?.stats || sessionStats(id) || {};
    const rows = listSessionBookings(id, { pageSize: 400 }).payload || [];
    const entries = Object.entries(pendingClassEntries()).filter(([, e]) => e && (e.status || (e.tags || []).length || (e.actions || []).length || (e.note || '').trim()));
    return { sessionId: raw.id ?? id, name: raw.name, startsAt: raw.startsAt, endsAt: raw.endsAt, studio: objOf(raw.inPersonLocation).name,
      trainer: [objOf(raw.teacher).firstName, objOf(raw.teacher).lastName].filter(Boolean).join(' '),
      capacity: raw.capacity, booked: st.booked, attended: st.attended, absent: st.absent, guests: st.guests,
      firstTimers: st.firstTimers, overbook: st.overbook, incompatible: st.incompatible, waitlist: st.waitlist,
      fillPct: st.fillPct, hostSituation: captured.class_host_situation || (raw.originalTeacher ? 'Guest coach stood in' : 'As scheduled'),
      flags: rows.filter(r => entries.some(([id2]) => String(id2) === String(r.id))).length,
      attendees: entries.map(([bookingId, e]) => { const b = rows.find(x => String(x.id) === String(bookingId)) || {};
        return { bookingId: Number(bookingId) || bookingId, memberId: b.member?.id ?? null, name: b.member ? `${b.member.firstName} ${b.member.lastName}` : String(b.guestName || 'Guest'),
          paidWith: b.paidWith ?? null, incompatibility: b.compatibility?.incompatibility ?? null,
          status: e.status || null, tags: e.tags || [], actions: e.actions || [], note: e.note || null }; }),
      source: det.source || 'demo' };
  };
  /* Merging a repeat into the ticket that is already open: count goes up, a class-blocking
     repeat outranks the original, three reports of one fault stop being routine. */
  const mergeRepeat = target => {
    const rec = target.recurrenceCount || 1;
    const next = { ...target, recurrenceCount: rec + 1, linkedTicketId: null, updatedAt: Date.now(),
      priority: (/^yes/i.test(String(data.class_impacted || '')) && PRIORITY_RANK[target.priority] < 2) ? 'high' : target.priority,
      timeline: [{ at: Date.now(), kind: 'repeat',
        text: `Report #${rec + 1} by ${data.reporter_name || 'the desk'}${data.summary ? ' · ' + String(data.summary).slice(0, 90) : ''}` }, ...target.timeline] };
    const chronic = rec + 1 >= 3 && !next.isEscalated && next.escalation < next.chain.length - 1;
    if (chronic) {
      next.escalation = Math.min(next.escalation + 1, next.chain.length - 1);
      next.assignee = next.chain[next.escalation]?.who || next.assignee;
      if (PRIORITY_RANK[next.priority] < 2) next.priority = 'high';
      next.isEscalated = true;
      next.timeline = [{ at: Date.now(), kind: 'escalate', text: `Auto-escalated to ${short(next.assignee)} — ${rec + 1} reports of one fault` }, ...next.timeline];
    }
    setTickets(list => list.map(x => x.id === next.id ? next : x));
    setReview(null); setPendingLink(null); setSub(null); setData({}); setErrors({});
    setOpenId(next.id); setView('queue');
    toast(`Report #${rec + 1} added to ${next.number}`, chronic
      ? `Chronic fault — escalated to ${short(next.assignee)}.`
      : `Priority ${next.priority.toUpperCase()} · the original clock keeps running.`, 'ok');
  };
  const fileTicket = (patchData = {}) => {
    const dupish = review?.dupish;
    /* whatever the desk ends up typing becomes this device’s identity for the next ticket */
    setDesk(d => ({ ...(d || {}), name: data.reporter_name || d?.name, contact: data.reporter_contact || d?.contact,
      channel: data.preferred_contact || d?.channel,
      persona: DESK_PERSONAS.find(p => p.type === data.reporter_type)?.id || d?.persona }));
    setReview(null);
    if (pendingLink?.ticket) { mergeRepeat(pendingLink.ticket); return; }
    /* A probable repeat gets the merge question before anything new is written. */
    if (dupish && !data.linked_ticket) { setPendingLink({ at: Date.now() }); return; }
    let t = buildTicket(patchData);
    if (!t) return;
    const ref = decodeLookup(t.data.linked_ticket);
    const target = ref && tickets.find(x => x.number === String(ref.id || ref.label));
    if (target) {
      t = { ...t, linkedTicketId: target.id,
        timeline: [{ at: Date.now(), kind: 'link', text: `Linked to ${target.number} — one clock, not two` }, ...t.timeline] };
      setTickets(list => [t, ...list.map(x => x.id === target.id
        ? { ...x, linkedTicketId: t.id, recurrenceCount: (x.recurrenceCount || 1) + 1,
            timeline: [{ at: Date.now(), kind: 'repeat', text: `Report #${(x.recurrenceCount || 1) + 1} filed as ${t.number} · linked` }, ...x.timeline] } : x)]);
    } else setTickets(list => [t, ...list]);
    setDone(t); setSub(null); setData({}); setErrors({});
    if (review?.fromClass) { setView('class'); setCaptured({}); setClassEntries({}); }
    toast(`${t.number} routed to ${short(t.assignee)}`, `${t.priority.toUpperCase()} · first response by ${fmtAt(t.frDueAt)}`);
  };
  const patch = (id, fn) => setTickets(list => list.map(t => t.id === id ? fn(t) : t));
  /* A drafted Momence action rides on the ticket: the payload, the endpoint that would take it, and
     a pending marker. Nothing is posted from a browser, so the receipt is the record. */
  const applyAction = (id, r) => {
    patch(id, t => ({ ...t, actions: [r, ...(t.actions || [])],
      timeline: [{ at: Date.now(), kind: 'action', text: `${r.summary} — drafted for ${r.targetName}` }, ...t.timeline] }));
    toast('Drafted on the ticket', `${r.summary} · ${r.targetName} · status pending, ref ${r.momenceRef}`, 'ok');
  };
  const markFR = id => {
    patch(id, t => ({ ...t, firstResponseAt: Date.now(), status: t.status === 'new' ? 'triaged' : t.status,
      timeline: [{ at: Date.now(), kind: 'response', text: `First response sent by ${short(t.assignee)} — FR clock stopped` }, ...t.timeline] }));
    toast('First response logged', 'The FR clock is stopped; resolution continues to run.', 'ok');
  };
  const escalate = id => {
    patch(id, t => {
      const next = Math.min(t.escalation + 1, t.chain.length - 1);
      const who = short(t.chain[next]?.who || '');
      /* the owning desk changes with the escalation, so everything that reads `assignee`
         (handover, export, Insights “by owner”) has to move with it. */
      return { ...t, escalation: next, assignee: t.chain[next]?.who || t.assignee,
        priority: PRIORITY_RANK[t.priority] < 2 ? 'high' : t.priority,
        timeline: [{ at: Date.now(), kind: 'escalate', text: `Escalated to ${who} (${t.chain[next]?.note})` }, ...t.timeline] };
    });
    toast('Escalated', 'Priority lifted to High and the next owner has been named on the thread.', 'ok');
  };
  const recordResolution = (id, f) => {
    setTickets(list => {
      const t = list.find(x => x.id === id); if (!t) return list;
      const doneT = { ...t, status: 'resolved', resolvedAt: Date.now(), resolution: f,
        resolutionNotes: [f.cause, f.action, f.outcome !== 'Escalated permanently' ? f.prevention : ''].filter(Boolean).join(' · '),
        timeline: [{ at: Date.now(), kind: 'resolve', text: `${f.outcome} — ${f.cause}${f.memberNotified.startsWith('Yes') ? ' · member told' : ''}` }, ...t.timeline] };
      setArchived(a => [doneT, ...a.filter(x => x.id !== id)]);
      return list.filter(x => x.id !== id);
    });
    setResolving(null);
    toast('Resolution recorded', 'Captured with cause and action, moved to archive, counted in SLA attainment.', 'ok');
  };
  const resolve = id => {
    setTickets(list => {
      const t = list.find(x => x.id === id); if (!t) return list;
      const doneT = { ...t, status: 'resolved', resolvedAt: Date.now(),
        timeline: [{ at: Date.now(), kind: 'resolve', text: `Resolution recorded by ${short(t.assignee)}` }, ...t.timeline] };
      setArchived(a => [doneT, ...a.filter(x => x.id !== id)]);
      return list.filter(x => x.id !== id);
    });
    toast('Ticket closed out', 'Moved to archive and counted in SLA attainment.', 'ok');
  };
  const reopen = id => {
    setArchived(a => {
      const t = a.find(x => x.id === id); if (!t) return a;
      const back = { ...t, status: 'in_progress', resolvedAt: null, resDueAt: Date.now() + H(t.hours.res / 2),
        timeline: [{ at: Date.now(), kind: 'reopen', text: 'Reopened by desk after member follow-up' }, ...t.timeline] };
      setTickets(l => [back, ...l]);
      return a.filter(x => x.id !== id);
    });
    toast('Reopened', 'Back on the board with a fresh half-cycle resolution clock.', 'ok');
  };
  const setStatus = (id, status) => patch(id, t => ({
    ...t, status, timeline: [{ at: Date.now(), kind: 'status', text: `Status → ${STATUS[status]}` }, ...t.timeline] }));

  /* ---------- class desk ---------- */
  const pickClassSession = v => {
    const ref = v ? (typeof v === 'string' ? v : encodeLookup(v)) : '';
    setCaptured(c => ({ ...c, class_date: ref }));
    const id = decodeLookups(ref)[0]?.id;
    if (!id) return;
    const det = detailMomence('sessions', String(id));
    if (det.error) { toast('Session not found', 'That id is not in the local dataset.', 'bad'); return; }
    const fill = populateSession(det);                       // keeps class_date in; overwritten below
    setCaptured(c => ({ ...c, ...fill, class_date: ref }));
    toast(`Class loaded · ${det.item.name}`, `${fill.class_booked ?? 0} booked · ${fill.class_capacity ?? '—'} places · roll ready to triage below.`, 'ok');
  };
  /* The desk writes into the same fields the generated form has, so review, routing, handover
     and export all keep working with no special-casing. */
  const applyClassCaptureTo = (to = 'intake', entries = classEntries) => {
    const flagged = Object.entries(entries).filter(([, e]) => e && (e.status || (e.tags || []).length || (e.actions || []).length || (e.note || '').trim()));
    const names = flagged.map(([id, e]) => e.name || id);
    const patch = {
      ...captured,
      kind: 'hosted-class',
      attendee_flag_count: String(flagged.length || ''),
      attendee_summary: flagged.length
        ? flagged.map(([id, e]) => `${e.name || 'Attendee ' + id}: ${e.status || '—'}${(e.actions || []).length ? ` → ${e.actions.join(', ')}` : ''}${e.note ? ` · ${e.note}` : ''}`).join(' | ').slice(0, 900)
        : (captured.attendee_summary || ''),
      class_notes: [captured.class_audience_notes, captured.class_host_notes, captured.class_compatibility_notes].filter(Boolean).join(' | '),
    };
    const affected = flagged.filter(([, e]) => e.memberId).map(([id, e]) => ({ id: String(e.memberId), label: e.name || `Attendee ${id}`, sublabel: e.status || '' }));
    if (affected.length) patch.affected_members = encodeLookups(affected);
    setData(d => ({ ...d, ...patch }));
    setCaptured(c => ({ ...c, ...patch }));
    return { patch, flagged };
  };
  const fileFromClassDesk = async () => {
    if (!classDeskId) { toast('Pick the class first', 'Everything else on this ticket is read from the session you choose.', 'bad'); return; }
    const key = captured._subKey || CLASS_DEFAULT_SUB;
    const [catName, subName] = key.split('|||');
    const cat = DATA.categories.find(c => c.name === catName);
    const sub = cat && { ...cat.subs.find(s => s.name === subName), category: catName };
    if (!sub) { toast('Sub-category missing', 'Choose which desk should own this class ticket.', 'bad'); return; }
    const { flagged } = applyClassCaptureTo('intake', pendingClassEntries());
    const det = detailMomence('sessions', String(classDeskId));
    const st = det.related.stats || {};
    const cls = classSnapshot(classDeskId);
    setCaptured(c => ({ ...c, _classEntries: pendingClassEntries() }));
    /* a member was affected by definition, so link the first flagged one — the desk can change it */
    const firstMember = flagged.find(([, e]) => e.memberId)?.[1];
    if (firstMember && !hasLookup(data.member_name)) {
      const mDet = detailMomence('members', String(firstMember.memberId));
      if (!mDet.error) setData(d => ({ ...d, ...populateMember(mDet), member_name: `${mDet.item.name} [#${mDet.item.id}]` }));
    }
    setSub(sub); setView('triage'); setView('intake');
    setReview({ at: Date.now(), dupish: false, fromClass: true, classStats: st, cls });
  };
  /* ---------- keyboard ---------- */
  useEffect(() => {
    const h = e => {
      const typing = /INPUT|TEXTAREA|SELECT/.test(e.target.tagName);
      if (e.key === 'Escape' && sub) { setSub(null); setView('triage'); return; }
      if (typing) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPalette(p => !p); return; }
      if (e.key === '/') { e.preventDefault(); (view === 'queue' ? document.getElementById('qinput') : searchRef.current)?.focus(); }
      else if (e.key === 'n') { setSub(null); setView('triage'); setCat(null); }
      else if (e.key === 'q') setView('queue');
      else if (e.key === 'i') setView('insights');
      else if (e.key === 'c') setView('class');
      else if (e.key === 'r') setView('trainers');
      else if (e.key === 't') setTheme(x => x === 'dark' ? 'light' : 'dark');
      else if (e.key === '?') setShowHelp(true);
      else if (e.key === 's') setSettings(true);
    };
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h);
  }, [view, sub, searchRef]);

  /* Probes the local dataset the way a connection test probes an API: list, page, detail. */
  const testMomence = () => {
    const members = listMomence('members', { pageSize: 5 });
    const sessions = listMomence('sessions', { pageSize: 5, upcoming: true });
    const first = members.items[0];
    const detail = first ? detailMomence('members', first.id) : null;
    const ok = !!detail && !!detail.item && (detail.related.memberships || []).length > 0;
    setMomenceStatus(ok ? 'ready' : 'error');
    toast(ok ? `Demo dataset answered · ${members.total} members, ${sessions.total} classes` : 'Dataset probe failed',
      ok ? `Detail for ${detail.item.name} returned ${detail.related.memberships.length} membership record(s) and ${detail.related.bookings.length} booking(s). Paged ${members.page + 1}/${Math.ceil(members.total / 5)}.`
         : 'The local record set did not resolve a member detail.', ok ? 'ok' : 'bad');
  };
  const paletteItems = () => [
    { id: 'v-queue', label: 'Live queue', hint: `${live.length} open`, icon: 'inbox', kind: 'view', run: () => setView('queue') },
    { id: 'v-triage', label: 'Raise a ticket', hint: 'start from the grid', icon: 'plus', kind: 'view', run: () => { setView('triage'); setCat(null); setSub(null); } },
    { id: 'v-insights', label: 'Insights', hint: 'SLA + load', icon: 'chart', kind: 'view', run: () => setView('insights') },
    { id: 'set', label: 'Appearance & integrations', hint: 'theme, density, Momence', icon: 'sliders', kind: 'action', run: () => setSettings(true) },
    { id: 'cyc', label: 'Guided powerCycle report', hint: `${(DATA.repo?.cycleIntake || []).length} vendor questions`, icon: 'whistle', kind: 'action', run: () => setCycleModal(true) },
    { id: 'theme', label: 'Toggle light / dark', icon: 'moon', kind: 'action', run: () => setPrefs(p => ({ ...p, theme: p.theme === 'dark' ? 'light' : 'dark' })) },
    ...DATA.categories.map(c => ({ id: 'c-' + c.name, label: c.name, hint: `${c.subs.length} sub-categories · ${c.department}`, icon: 'layers', kind: 'category',
      keywords: c.ownerMumbai + ' ' + c.ownerBengaluru + ' ' + c.department, run: () => { setView('triage'); setSub(null); setCat(c.name); setSearch(''); } })),
    ...DATA.categories.flatMap(c => c.subs.filter(s => (s.hist || 0) > 2).slice(0, 3).map(s => ({
      id: 's-' + c.name + s.name, label: `${c.name} › ${s.name}`, hint: s.slaLabel, icon: 'bolt', kind: 'sub-category',
      run: () => { setView('triage'); setCat(c.name); openSub(c, s); } }))),
    ...[...new Set([...tickets.map(t => short(t.assignee)), ...DATA.categories.map(c => short(c.ownerMumbai))])]
      .slice(0, 12).map(o => ({ id: 'o-' + o, label: `Everything on ${o}`, hint: 'filter the queue', icon: 'user', kind: 'owner',
        run: () => { setView('queue'); setOwnerFilter(o); setStatusFilter('all'); } })),
  ];

  /* ============================ VIEWS ============================ */
  const TABS = [
    { id: 'triage', label: 'Raise a ticket', icon: svg.plus, badge: null },
    { id: 'class', label: 'Class desk', icon: svg.calendar, badge: flaggedAttendees, alert: 0 },
    { id: 'queue', label: 'Live queue', icon: svg.inbox, badge: live.length, alert: breaches },
    { id: 'trainers', label: 'Trainers', icon: svg.whistle, badge: null },
    { id: 'insights', label: 'Analytics', icon: svg.chart, badge: null },
    { id: 'log', label: 'Class log', icon: svg.clip, badge: classTickets.length },
  ];

  const triage = () => {
    const cats = DATA.categories
      .map(c => ({ ...c, subs: c.subs.filter(s =>
        !search || (s.name + ' ' + c.name + ' ' + s.department + ' ' + s.ownerMumbai + ' ' + s.ownerBengaluru)
          .toLowerCase().includes(search.toLowerCase())) }))
      .filter(c => c.subs.length);
    const current = cat ? DATA.categories.find(c => c.name === cat) : null;
    if (current) {
      const subs = current.subs.filter(s => !search || (s.name + s.department).toLowerCase().includes(search.toLowerCase()));
      return <div>
        <div className="phead">
          <div><div className="eyebrow">Step 2 of 2 · pick the exact issue</div>
            <button className="back" onClick={() => setCat(null)}><I s={svg.back}/> all categories</button>
            <h1 style={{ marginTop: 7 }}>{current.name}</h1>
            <p>{current.department} · Mumbai desk <b>{short(current.ownerMumbai)}</b> · Bengaluru <b>{short(current.ownerBengaluru)}</b> · escalation {short(current.l1)} → {short(current.l2)}</p></div>
          <div className="right"><Search value={search} onChange={setSearch} placeholder={`Filter ${current.subs.length} sub-categories…`} /></div>
        </div>
        <div className="subs">
          {subs.map((s, i) => {
            const th = themeCache(current.name, s.name, i);
            const nf = (DATA.subFields[`${current.name}|||${s.name}`] || []).length + DATA.universal.length;
            return <div className={cx('subc', searching && 'skel')} style={{ ...themeVars(th), animationDelay: `${Math.min(i, 10) * 18}ms` }} key={s.name} onClick={() => openSub(current, s)}>
              <span className="subc-em" aria-hidden="true"><I s={glyphSvg(th.emblem, 20, 1.85)} /></span>
              <span className="subc-wm" aria-hidden="true"><I s={glyphSvg(th.emblem, 96, 1.1)} /></span>
              <div className="subc-body">
                <b>{s.name}</b>
                <span className="subc-dept">{s.department} · {short(s.ownerMumbai)} first, {short(s.l1)} if it waits</span>
                <div className="meta">
                  <Pill p={s.priority} />
                  <span className="chip mono" title={`First response ${s.hours.first} h · resolution ${s.hours.res} h`}>
                    <I s={svg.clock}/> {s.hours.first} h → {s.hours.res} h</span>
                  {s.hist > 0 && <span className="chip" title={`${s.hist} tickets like this in your historic log`}><I s={svg.flame}/> {s.hist}</span>}
                  <span className="chip"><I s={svg.wand}/> {nf} fields</span>
                </div>
              </div>
              <span className="subc-go" aria-hidden="true"><I s={svg.chev} /></span>
            </div>;
          })}
          {!subs.length && <div className="empty"><h3>No sub-category matches</h3><p>Clear the filter to see all {current.subs.length}.</p></div>}
        </div>
      </div>;
    }
    return <div>
      <div className="phead">
        <div><div className="eyebrow">Triage grid · {DATA.counts.categories} categories · {DATA.counts.subcategories} sub-categories</div>
          <h1>What are we dealing with?</h1>
          <p>Every card carries its own handling desk, escalation chain and SLA. Pick a category, then the exact
            sub-category — the intake form is built from that choice, not a generic one.</p></div>
        <div className="right"><Search value={search} onChange={setSearch} idRef={searchRef}
          placeholder="Search sub-categories, owners, departments… ( / )" autoFocus /></div>
      </div>
      <div className="catgrid">
        {cats.map((c, i) => {
          const hist = c.subs.reduce((n, s) => n + s.hist, 0);
          const open = tickets.filter(t => t.category === c.name && !['resolved', 'closed'].includes(t.status)).length;
          const th = themeCache(c.name, '');
          return <article className={cx('cat', searching && 'skel')} style={{ ...themeVars(th), animationDelay: `${Math.min(i, 8) * 22}ms` }} key={c.name} onClick={() => setCat(c.name)}>
            <span className="cat-em" aria-hidden="true"><I s={glyphSvg(th.emblem, 17, 1.8)} /></span>
            <div className="ctop">
              <span className="num">{String(i + 1).padStart(2, '0')}</span>
              <div style={{ flex: 1 }}><h3>{c.name}</h3><div className="sub">{c.department}</div></div>
              {open > 0 && <span className="chip brand mono" title={`${open} live tickets in this category`}>{open} live</span>}
            </div>
            <div className="rowmeta">
              <span className="chip mono"><I s={svg.layers}/> {c.subs.length} sub-categories</span>
              {hist > 0 && <span className="chip mono" title="Occurrences in the 464-ticket historic log"><I s={svg.flame}/> {hist} seen before</span>}
            </div>
            <div className="owners">
              <div className="avatars">
                <Avatar name={c.ownerMumbai} i={0} /><Avatar name={short(c.ownerBengaluru)} i={1} />
                <Avatar name={c.l1} i={2} /><Avatar name={c.l2} i={3} />
              </div>
              <div className="who"><b>{short(c.ownerMumbai)}</b>
                <span className="mut">{short(c.ownerBengaluru)} · then {short(c.l1)} → {short(c.l2)}</span></div>
            </div>
          </article>;
        })}
      </div>
    </div>;
  };

  /* The intake’s context column. It does not sit under the form any more — it *is* the right-hand
     rail while a ticket is being written, which is what lets the field grid use the whole width. */
  const intakeAside = () => (
    <aside className="side in-rail">
          <div className="sidecard momcard">
            <h5>Where this goes</h5>
            <div className="kv"><span className="k">Studio</span><span className="v">{studio || <i className="mut">pick one</i>}</span></div>
            <div className="kv"><span className="k">Department</span><span className="v">{sub.department}</span></div>
            <div className="kv"><span className="k">Priority</span><span className="v"><Pill p={livePriority} /></span></div>
            {raised && <div className="hint" style={{ color: 'var(--high)', fontSize: 11.5, marginTop: 7 }}>
              <I s={svg.up}/> raised from “{sub.priority}” by what you’ve told us</div>}
            <div className="routechain">
              {previewChain.map((c, i) => <div className={cx('rstep', 'done')} key={i}>
                <span className="rd"><i /></span><span className="rl">{c.note}</span>
                <span className="rw">{short(c.who)}</span></div>)}
            </div>
          </div>
          <div className="sidecard">
            <h5>Linked directory</h5>
            <div className="between" style={{ marginBottom: 9 }}>
              <span className="chip"><i className="pulse-dot" style={{ background: 'var(--high)' }} /> demo records · read-only</span>
              <button className="btn sm ghost" onClick={testMomence}><I s={svg.bolt}/> probe</button>
            </div>
            <div className="kv"><span className="k">Members</span>
              <span className="v mono">{hasLookup(data.member_name)
                ? <button className="chip lkbtn" onClick={() => setRecord({ module: 'members', id: decodeLookup(data.member_name).id })}><I s={svg.expand}/> {decodeLookup(data.member_name).label}</button>
                : <i className="mut">not linked — pick one if a member was affected</i>}</span></div>
            <div className="kv"><span className="k">Class</span>
              <span className="v mono">{hasLookup(data.class_date)
                ? <button className="chip lkbtn" onClick={() => setRecord({ module: 'sessions', id: decodeLookup(data.class_date).id })}><I s={svg.expand}/> {decodeLookup(data.class_date).label}</button>
                : <i className="mut">not linked</i>}</span></div>
            <div className="kv"><span className="k">Also on file</span>
              {(() => { const same = tickets.filter(x => x.subCategory === sub.name && (!data.studio || x.studio === data.studio)).length;
                return <span className="v mono">{same ? <b>{same} other {same === 1 ? 'ticket' : 'tickets'}</b> : <i className="mut">none</i>} for “{sub.name}”{data.studio ? ` at ${data.studio}` : ''}</span>; })()}</div>
            <div className="hint" style={{ marginTop: 9 }}>Lookups read a dataset shaped exactly like Momence’s API — members, sessions, memberships, bookings and notes — so the same call sites can be pointed at the live endpoint without touching a field.</div>
          </div>
          <div className="sidecard">
            <h5>SLA clock</h5>
            <div className="chip mono" style={{ marginBottom: 9 }}>{sub.slaLabel}</div>
            <div className="kv"><span className="k">First reply</span><span className="v mono">{sub.hours.first < 1 ? `${Math.round(sub.hours.first * 60)} min` : `${sub.hours.first} hr`}</span></div>
            <div className="kv"><span className="k">Resolution</span><span className="v mono">{sub.hours.res} hr</span></div>
            <div className="slabar"><i style={{ width: '2%' }} /></div>
            <div className="hint" style={{ fontSize: 11.5, marginTop: 9 }}>
              {studio ? `Filing at ${short(studio)} → ` : ''}the {DATA.categories.find(c => c.name === sub.category)?.name} desk owns the response, and evidence fields can only raise priority — never lower it.</div>
          </div>
          {sub.hist > 0 && <div className="sidecard">
            <h5>Before you send</h5>
            <div style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}>
              <b className="mono" style={{ fontSize: 26, fontFamily: 'var(--serif)' }}>{sub.hist}</b>
              <span className="mut sm">tickets of this exact type in your 464-ticket history.</span></div>
            <div className="hr" style={{ margin: '12px 0' }} />
            <div className="checklist">
              {[['Attach a photo or a 10-second clip — the single biggest time-saver on facility faults.', !!data.attachments],
                ['Name the member and their Momence ID if anyone was affected.', !!data.member_impact],
                ['If this has happened before, link the earlier ticket so one clock runs, not two.', !!data.linked_ticket],
                ['State what you already tried — it stops IT starting from zero.', !!(data.last_restart || data.workaround)]].map(([txt, ok], i) =>
                <label className="checkrow" key={i}><input type="checkbox" readOnly checked={ok} />{txt}</label>)}
            </div>
          </div>}
      <FormHost id="vendor-callout" overrides={formIds} tight title="Vendor &amp; AMC callout" />
    </aside>
  );

  const intake = () => {
    if (!sub) return null;
    const auto = `${sub.name} — ${studio ? short(studio).split(',')[0] : 'studio'}${data.area ? ' · ' + data.area : ''}`;
    const titleVal = data.title ?? auto;
    const d2 = { ...data, title: data.title === undefined ? auto : data.title };
    const raised = livePriority !== sub.priority;
    return <div>
      <div className="phead">
        <div><div className="eyebrow">{sub.category}</div>
          <button className="back" onClick={() => { setSub(null); setView('triage'); }}><I s={svg.back}/> change sub-category</button>
          <h1 style={{ marginTop: 7 }}>{sub.name}</h1>
          <p>{visible.filter(f => f.required).length} required of {visible.length} shown · {missing.length + gating.length} outstanding ·
            clock starts the moment you send.</p></div>
        <div className="right">
          <label className="chip" style={{ cursor: 'pointer' }}>
            <input type="checkbox" style={{ accentColor: 'var(--brand)' }} checked={requiredOnly}
              onChange={e => setRequiredOnly(e.target.checked)} /> required only</label>
          <span className={cx('chip mono', hasLookup(data.member_name) && 'ok')}><I s={svg.user}/> {hasLookup(data.member_name) ? decodeLookup(data.member_name).label : 'no member linked'}</span>
          <span className="chip mono">{DATA.universal.length + (DATA.subFields[`${sub.category}|||${sub.name}`] || []).length} fields in this form</span>
          <label className="chip deskid" data-tip="Who the reporter block is prefilled with. Everything it writes stays editable on the form."
            title="The desk identity remembered on this device">
            <I s={svg.user} />
            <select value={DESK_PERSONAS.find(p => p.name === (desk?.name || data.reporter_name))?.id || ''}
              onChange={e => {
                const p = DESK_PERSONAS.find(x => x.id === e.target.value); if (!p) return;
                setDesk({ persona: p.id, name: p.name, contact: deskEmail(p.name), channel: p.channel });
              }}>
              <option value="">{short(data.reporter_name || 'pick who is reporting')}</option>
              {DESK_PERSONAS.map(p => <option key={p.id} value={p.id}>{p.name} · {p.type}</option>)}
            </select></label>
        </div>
      </div>
      <div className="intake">
        <div className="formcard">
          <FormEngine fields={fields.map(f => {
              const g = f.id === 'title' ? { ...f, value: titleVal } : f;
              return g.type === 'lookup' && g.module === 'ticket' ? { ...g, tickets: all } : g;
            })}
            data={d2} setData={setData} errors={errors} requiredOnly={requiredOnly}
            autoFill={autoFill} studio={studio} tickets={all}
            onOpenRecord={rec => setRecord(rec)}
            onFindTicket={() => setPendingLink({ at: Date.now(), fromIntake: true })}
            collapsed={collapsed} toggle={s => setCollapsed(c => { const n = new Set(c); n.has(s) ? n.delete(s) : n.add(s); return n; })} />
          <div className={cx('writeup', aiBusy && 'busy', aiErr && 'err')} data-tip="Everything the model writes comes from the answers already on this form — read it before you file it.">
            <div className="wu-head">
              <span className="eyebrow"><I s={svg.wand} /> The write-up</span>
              <b className="xxs">{aiReady(aiKey) ? `OpenAI · ${aiModel}` : 'no key on this device'}</b>
              <span className="spacer" />
              <button className="btn xs" onClick={runWriteup} disabled={!!aiBusy}>
                <I s={aiBusy === 'write' ? svg.clock : svg.wand} /> {aiBusy === 'write' ? 'writing…' : aiText ? 'Write it again' : 'Write it up'}</button>
              <button className="btn xs ghost" onClick={runAdvice} disabled={!!aiBusy}>
                <I s={svg.chart} /> Second opinion</button>
            </div>
            {aiText
              ? <textarea className="wu-body" rows={5} value={aiText}
                  onChange={e => setAiText(e.target.value)} placeholder="The paragraph will land here." />
              : <p className="wu-empty">{aiBusy === 'write'
                  ? 'Reading ' + (missing.length ? 'the answers so far' : 'every answer') + ' and writing the record…'
                  : 'Nothing written yet. The hub will turn ' + (Object.keys(data).filter(k => String(data[k] || '').length > 1).length)
                    + ' answered field(s) into a paragraph the next shift can read, and it only ever uses what is on this form.'}</p>}
            {aiAdvice && <div className="wu-advice">
              <span className="eyebrow">Second opinion</span>
              {aiAdvice.lines.map((l, i) => <p key={i} className={cx('wa-line', i === 0 && 'p')}>{l}</p>)}
            </div>}
            <div className="wu-acts">
              {!!aiText && <button className="btn sm pri" onClick={applyWriteup}><I s={svg.check} /> Use it on the form</button>}
              {!!aiText && <button className="btn sm ghost" onClick={() => { setAiText(''); setAiMeta(null); }}>Discard</button>}
              <span className="xs mut">{aiMeta ? `${aiMeta.words} words · ${aiMeta.model} · ${(aiMeta.ms / 1000).toFixed(1)}s${aiMeta.usage ? ' · ' + aiMeta.usage : ''}` : ''}
                {aiErr ? <em className="wu-err"><I s={svg.warn} /> {aiErr}</em> : ''}</span>
            </div>
          </div>
          <div className="formfoot">
            <div style={{ flex: 1 }}>
              {missing.length
                ? <span className="errcount"><I s={svg.warn}/> {missing.length} required field{missing.length > 1 ? 's' : ''}: {missing.map(m => m.label).slice(0, 3).join(', ')}{missing.length > 3 ? '…' : ''}</span>
                : <span className="st resolved"><i /> Ready to route to {short(previewChain[0]?.who)}</span>}
              {gating.length > 0 && <span className="errcount"><I s={svg.user}/> {gating.map(g => g.label).join(' + ')} must be linked from the directory</span>}
            </div>
            <button className="btn" onClick={() => { setSub(null); setView('triage'); }}>Cancel</button>
            <button className="btn" onClick={() => setCycleModal(true)}><I s={svg.whistle}/> Guided cycle report</button>
            <button className="btn pri" onClick={reviewThenFile}><I s={svg.bolt}/> Review &amp; create ticket</button>
          </div>
        </div>
      </div>
    </div>;
  };

  const classDesk = () => (
    <div>
      <div className="phead">
        <div><div className="eyebrow">Hosted classes · Momence sessions</div>
          <h1>Class desk</h1>
          <p>Start from the class, not from a form. Pick the session and the roll, capacity, waitlist, coach and
            what each member pays with arrive with it — then note what each attendee said.</p></div>
        <div className="right">
          <span className={cx('chip mono', classDeskId && 'ok')}><I s={svg.calendar}/> {classDeskId ? `session #${classDeskId}` : 'no class chosen'}</span>
          <span className={cx('chip mono', flaggedAttendees && 'warn')}>{flaggedAttendees} attendee note{flaggedAttendees === 1 ? '' : 's'}</span>
          <button className="btn text" onClick={() => { setCaptured({}); setClassEntries({}); }}>Start over</button>
        </div>
      </div>
      <ClassDesk
        sessionId={classDeskId}
        captured={captured} setCaptured={setCaptured}
        entries={Object.fromEntries(Object.entries(classEntries).map(([k, v]) => [k, { ...v, name: v.name || attendeeName(k), memberId: v.memberId || attendeeMember(k) }]))}
        setEntries={setClassEntries}
        tickets={all}
        subOptions={CLASS_SUB_CANDIDATES.map(k => { const [c, n] = k.split('|||'); return { key: k, label: `${c} › ${n}` }; })}
        onOpenRecord={rec => setRecord(rec)}
        onPickSession={pickClassSession}
        autofill={() => { const f = firstClassSub(); setCaptured(c => ({ ...c, _subKey: f, class_disruption: 'None', class_experience_effect: 'None — ran as designed', class_attendance_match: 'Matches the roll', class_rebooking_intent: 'Not asked', reporter_type: 'Front desk / associate', occurred_relative: 'Just now' })); toast('Filled from Momence', 'The class answers are already on it — add what the room said, then build the ticket.', 'ok'); }}
        onFile={fileFromClassDesk} />
      {classDeskId && <FormHost id="member-feedback" overrides={formIds} tight title="Send the class feedback form" />}
    </div>
  );
  const attendeeName = id => { const b = classBooking(id); return b ? (b.member ? `${b.member.firstName} ${b.member.lastName}` : String(b.guestName || 'Guest')) : `Attendee ${id}`; };
  const attendeeMember = id => { const b = classBooking(id); return b?.member?.id || null; };
  const classBooking = id => { if (!classDeskId) return null;
    const rows = listSessionBookings(classDeskId, { pageSize: 400 });
    return (rows.payload || []).find(x => String(x.id) === String(id)); };
  const trainers = () => (
    <div>
      <div className="phead">
        <div><div className="eyebrow">Coach reviews · {trainerDir.length} trainers · 14-day window</div>
          <h1>Trainer feedback &amp; reviews</h1>
          <p>Attendance against Momence, class fill, what the desk filed against each coach and the ratings captured
            on class tickets — one page per person, before the 1:1.</p></div>
      </div>
      <TrainerDesk directory={trainerDir} tickets={all} selected={trainerSel} onSelect={setTrainerSel}
        onOpenRecord={rec => setRecord(rec)}
        onRaise={t => { setView('triage'); const [c, n] = 'Scheduling|||Studio Operations / Class Feedback (grid review)'.split('|||');
          const cat = DATA.categories.find(x => x.name === c); const sub = cat && { ...cat.subs.find(s => s.name === n), category: c };
          if (!sub) { toast('Feedback desk', `No feedback sub-category on this build — ${t.name}’s notes stay on the class desk.`, 'warn'); return; }
          openSub(cat, sub); setData(d => ({ ...d, trainer: t.name, trainer_under_review: 'Yes — coaching note attached' }));
          toast('Feedback started', `Filed against ${t.name} · it lands on the training desk.`, 'ok'); }} />
      {trainerSel && (() => {
        const rep = trainerReport(trainerSel, all, (trainerDir || []).find(d => d.name === trainerSel));
        return <TrainerReport rep={rep} overrides={formIds} now={now}
          onOpen={id => { setSheet(id); setView('queue'); }}
          onRaise={name => { setView('triage'); setCat('Trainer Feedback'); setSub(null);
            /* the one answer the report already knows — the form asks for the rest */
            setData(d => ({ ...d, trainer_under_review: name }));
            toast('Trainer filled in', `${name} is set on the form. Pick the sub-category and the behaviour you saw.`, 'ok'); }} />;
      })()}
    </div>
  );
  const classLog = () => (
    <div>
      <div className="phead">
        <div><div className="eyebrow">Hosted-class tickets · {classTickets.length}</div>
          <h1>Class log</h1>
          <p>Every ticket that carries a session, with its roll call attached — the record a coach or a
            studio manager can read without opening five tabs.</p></div>
        <div className="right">
          <button className="btn pri" onClick={() => setView('class')}><I s={svg.calendar}/> Open the class desk</button>
        </div>
      </div>
      {!classTickets.length && <div className="card empty"><div className="big">✓</div><h3>No class tickets yet</h3>
        <p>File one from the class desk and its attendee notes appear here.</p></div>}
      <div className="loggrid">
        {classTickets.map(t => { const st = t.class?.sessionId ? sessionStats(t.class.sessionId) : null;
          return <article className="card logcard" key={t.id} style={{ '--pc': PC[t.priority] }}>
            <div className="between"><span className="chip mono">{t.number}</span><span className="row-gap"><Pill p={t.priority} /><StatusPill s={t.status} /></span></div>
            <b className="logtitle">{t.label || t.title}</b>
            <p className="mut xs">{t.class?.name || t.subCategory} · {t.studio}{t.class?.startsAt ? ' · ' + fmtAt(new Date(t.class.startsAt).getTime()) : ''}</p>
            {st && <div className="cd-stats sm">{[['booked', st.booked], ['attended', st.attended], ['no-shows', st.absent ?? '—'],
              ['guests', st.guests], ['over book', st.overbook], ['not compatible', st.incompatible]].map(([k, v]) =>
              <div key={k} className={cx('cds', /over book|not compatible/.test(k) && Number(v) > 0 && 'warn')}><b className="mono">{v}</b><span>{k}</span></div>)}</div>}
            {!!(t.class?.attendees || []).length && <details className="logatt"><summary>{t.class.attendees.length} attendee note{t.class.attendees.length > 1 ? 's' : ''}</summary>
              {t.class.attendees.map((a, i) => <div key={i} className="logatt-row"><b>{a.name}</b>
                <span>{a.status || '—'}</span>{(a.actions || []).length > 0 && <em>{a.actions.join(', ')}</em>}
                {a.note && <p>{a.note}</p>}</div>)}</details>}
            <div className="actions">
              <button className="btn sm" onClick={() => { setOpenId(t.id); setView('queue'); }}><I s={svg.inbox}/> open in queue</button>
              {t.class?.sessionId && <button className="btn sm ghost" onClick={() => setRecord({ module: 'sessions', id: String(t.class.sessionId) })}><I s={svg.expand}/> class record</button>}
              <span className="mut xs mono" style={{ marginLeft: 'auto' }}><Countdown t={t} now={now} /></span>
            </div>
          </article>; })}
      </div>
    </div>
  );

  const queue = () => (
    <div>
      <div className="phead">
        <div><div className="eyebrow">Centralised tracking · {live.length} in view</div>
          <h1>Live queue</h1>
          <p>One clock per ticket: first response is the commitment, resolution is the promise. Red means somebody is
            waiting past it — handle those top-down.</p></div>
        <div className="right">
          <div className="seg">
            {['sla', 'priority', 'newest'].map(s => <button key={s} aria-pressed={sort === s} onClick={() => setSort(s)}>{s === 'sla' ? 'Soonest breach' : s === 'priority' ? 'Priority' : 'Newest'}</button>)}
          </div>
          <button className="btn" onClick={() => {
            download(`p57-queue-${new Date().toISOString().slice(0, 10)}.md`,
              ['# Physique 57 — queue export', '', ...live.map(t => `### ${t.number} · ${t.priority.toUpperCase()} · ${t.status}\n${t.title}\n${t.category} › ${t.subCategory} · ${t.studio} · owner ${short(t.assignee)} · SLA ${t.slaLabel}`)].join('\n\n'), 'text/markdown');
            toast('Exported', `${live.length} tickets written to a markdown file.`, 'ok');
          }}><I s={svg.down}/> Export</button>
          <button className="btn pri" onClick={() => { setView('triage'); setCat(null); setSub(null); }}><I s={svg.plus}/> New ticket</button>
        </div>
      </div>
      <Stats items={[
        { value: live.length, label: 'Open on the board', acc: 'var(--med)' },
        { value: breaches, label: 'SLA breached', acc: 'var(--crit)', tag: breaches ? 'act now' : 'clear' },
        { value: atRisk, label: 'Within 25% of breach', acc: 'var(--high)' },
        { value: due2, label: 'First reply due < 2 hr', acc: 'var(--brand2)' },
        { value: live.filter(t => !t.firstResponseAt).length, label: 'No reply sent yet', acc: 'var(--mut)' },
        { value: tickets.filter(t => t.escalation > 0).length, label: 'Escalated to L1/L2', acc: 'var(--brand)' }]} />
      <div className="presetbar">
        <span className="mut xs">saved views</span>
        {presets.map(p => <button key={p.id} className={cx('chip', 'preset', !!p.q.onlyClass === onlyClass && p.q.statusFilter === statusFilter
          && (p.q.prioFilter || '') === prioFilter && 'on')}
          onClick={() => { setStatusFilter(p.q.statusFilter); setPrioFilter(p.q.prioFilter || ''); setSort(p.q.sort || 'sla'); setOnlyClass(!!p.q.onlyClass); }}>{p.label}</button>)}
        <button className="btn sm ghost" onClick={() => { setPresets([...(presetsRaw || presets), { id: 'u' + Date.now(),
          label: `${statusFilter}${onlyClass ? ' · class' : ''} · ${prioFilter || 'any'}`, q: { statusFilter, prioFilter, sort, onlyClass } }]);
          toast('View saved', 'It is in the strip above, and it survives a reload.', 'ok'); }}><I s={svg.plus}/> save this</button>
      </div>
      <div className="toolbar">
        <select id="qinput" className="sel" value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ minWidth: 168 }}>
          <option value="live">Live (not closed)</option><option value="all">Everything</option>
          {Object.keys(STATUS).map(s => <option key={s} value={s}>{STATUS[s]}</option>)}
        </select>
        <select className="sel" value={prioFilter} onChange={e => setPrioFilter(e.target.value)}>
          <option value="">All priorities</option>{['critical', 'high', 'medium', 'low'].map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <select className="sel" value={deptFilter} onChange={e => setDeptFilter(e.target.value)}>
          <option value="">All departments</option>{[...new Set(all.map(t => t.department))].sort().map(d => <option key={d}>{d}</option>)}
        </select>
        <select className="sel" value={ownerFilter} onChange={e => setOwnerFilter(e.target.value)}>
          <option value="">All owners</option>{[...new Set(all.map(t => short(t.chain[Math.min(t.escalation, t.chain.length - 1)]?.who || t.assignee)))].sort().map(o => <option key={o}>{o}</option>)}
        </select>
        <select className="sel" value={studioFilter} onChange={e => setStudioFilter(e.target.value)}>
          <option value="">All studios</option>{DATA.studios.map(s => <option key={s.name}>{s.name}</option>)}
        </select>
        <div style={{ flex: 1, minWidth: 190, maxWidth: 380 }}><Search value={q} onChange={setQ} placeholder="Search title, member, number…  ( / )" /></div>
      </div>
      <div className="tklist">
        {live.map(t => {
          const isOpen = openId === t.id;
          const th = themeCache(t.category, t.subCategory);
          return <article className={cx('tk', isOpen && 'open')} style={{ '--pc': PC[t.priority], ...themeVars(th) }} key={t.id}>
            <div className="tkrow" onClick={() => setOpenId(isOpen ? null : t.id)}>
              <div className="c-num">{t.number}<small>{fmtAt(t.createdAt)}</small></div>
              <div className="c-title">
                <span className="tk-em" aria-hidden="true" data-tip={`${t.subCategory} files under its own colour, so the queue reads by kind`}><I s={glyphSvg(th.emblem, 15, 1.9)} /></span>
                <b>{t.title}</b>
                {(stories[t.id] || t.narrative || t.label) && (stories[t.id] || t.narrative || t.label) !== t.title
                  && <p className="tklabel" data-tip="Auto-labelled from the answers on this ticket — click to open the full record"
                    onClick={e => { e.stopPropagation(); setSheet(t.id); }}>{stories[t.id] || t.narrative || t.label}</p>}
                <div className="path"><span className="chip">{t.category} › {t.subCategory}</span>
                  {t.class?.sessionId && <span className="chip brand"><I s={svg.calendar}/> {t.class.name} · {t.class.booked ?? 0}/{t.class.capacity ?? '—'} seats</span>}
                  {t.class?.attendees?.length > 0 && <span className="chip warn"><I s={svg.user}/> {t.class.attendees.length} attendee note{t.class.attendees.length > 1 ? 's' : ''}</span>}
                  {(t.recurrenceCount || 1) > 1 && <span className="chip mono">report #{t.recurrenceCount}</span>}
                  <Pill p={t.priority} />
                  {t.data.member_name && <span className="chip mono"><I s={svg.user}/> {t.data.member_name}</span>}
                  {t.escalation > 0 && <span className="chip brand">L{t.escalation}</span>}
                  {!t.firstResponseAt && <span className="chip" style={{ color: 'var(--crit)' }}>awaiting first reply</span>}
                </div></div>
              <div className="col-sla"><Countdown t={t} now={now} />
                <div className="sla-second"><Countdown t={t} now={now} mode="res" compact /></div></div>
              <div className="c-dept col-dept">{t.studio}{t.area ? ' · ' + t.area : ''}</div>
              <div className="col-own"><OwnerCell t={t} /></div>
              <div className="c-act">
                <span className="tick"><I s={svg.chev}/></span>
              </div>
            </div>
            {isOpen && <div className="detail" onClick={e => e.stopPropagation()}>
              <div>
                <div style={{ display: 'flex', gap: 9, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
                  <StatusPill s={t.status} /><span className="chip mono">{t.slaLabel}</span>
                  {(t.recurrenceCount > 1) && <span className="chip warn" title="Reports of this same fault"><I s={svg.flame}/> report #{t.recurrenceCount}</span>}
                  {t.linkedTicketId && <span className="chip brand"><I s={svg.link}/> linked</span>}
                  {t.data.member_name && <button className="chip lkbtn" onClick={() => setRecord({ module: 'members', id: decodeLookup(t.data.member_name)?.id || String(t.data.member_name) })}>
                    <I s={svg.user}/> {decodeLookup(t.data.member_name)?.label || t.data.member_name}</button>}
                  {t.data.class_date && <button className="chip lkbtn" onClick={() => setRecord({ module: 'sessions', id: decodeLookup(t.data.class_date)?.id || String(t.data.class_date) })}>
                    <I s={svg.calendar}/> {decodeLookup(t.data.class_date)?.label || 'class'}</button>}
                  {t.data.linked_ticket && <button className="chip lkbtn" title="Open the ticket this repeats"
                    onClick={() => { const id = decodeLookup(t.data.linked_ticket)?.id; const hit = tickets.find(x => x.number === id || x.id === id);
                      if (hit) { setRecord({ module: 'tickets', id: hit.id, ticket: hit }); } else toast('Not on this board', `${id} isn’t a ticket here — it may live in the historic log.`, 'warn'); }}>
                    <I s={svg.link}/> {decodeLookup(t.data.linked_ticket)?.label || t.data.linked_ticket}</button>}
                  <span className="mut xs mono">v{t.version || 1} · updated {fmtAt(t.updatedAt)}</span>
                </div>
                <p style={{ margin: '0 0 13px', fontSize: 13.5, lineHeight: 1.6, maxWidth: '78ch' }}>{t.summary}</p>
                {t.class?.sessionId && <div className="tkclass">
                  <div className="between"><h5>{"Class & roll call"}</h5>
                    <button className="btn sm ghost" onClick={() => setRecord({ module: 'sessions', id: String(t.class.sessionId) })}><I s={svg.expand}/> session record</button></div>
                  <div className="cd-stats sm">{[['booked', t.class.booked], ['attended', t.class.attended], ['absent', t.class.absent ?? '—'],
                    ['capacity', t.class.capacity], ['guests', t.class.guests], ['first-timers', t.class.firstTimers],
                    ['over book', t.class.overbook], ['waitlist', t.class.waitlist], ['not compatible', t.class.incompatible]]
                    .filter(([, v]) => v != null && v !== 0).map(([k, v]) => <div key={k} className={cx('cds', /over book|not compatible/.test(k) && 'warn')}><b className="mono">{v}</b><span>{k}</span></div>)}</div>
                  <p className="mut xs">{t.class.name} · {t.class.studio || t.studio}{t.class.startsAt ? ' · ' + fmtAt(new Date(t.class.startsAt).getTime()) : ''}
                    {' '}· coached by {t.class.trainer || '—'} · {t.class.hostSituation || 'as scheduled'} · snapshot from {t.class.source || 'demo'}</p>
                  {!!(t.class.attendees || []).length && <AttendeeRoster sessionId={t.class.sessionId} readOnly
                    entries={Object.fromEntries(t.class.attendees.map(a => [a.bookingId, { ...a, note: a.note || '' }]))} />}
                </div>}
                <div className="fieldgrid">
                  {Object.entries(t.data).filter(([k]) => !['title', 'summary'].includes(k)).map(([k, v]) => (
                    <div className="fg" key={k}><span className="fk">{LABELS[k] || k}</span>
                      <span className="fv">{Array.isArray(v) ? v.join(' · ') : String(v)}</span></div>))}
                </div>
                <div className="actions">
                  {!t.firstResponseAt && <button className="btn sm pri" onClick={() => markFR(t.id)}><I s={svg.check}/> Log first response</button>}
                  {t.escalation < t.chain.length - 1 && <button className="btn sm" onClick={() => escalate(t.id)}><I s={svg.up}/> Escalate to {short(t.chain[t.escalation + 1]?.who)}</button>}
                  <select className="sel" value={t.status} onChange={e => setStatus(t.id, e.target.value)} style={{ fontSize: 12 }}>
                    {Object.keys(STATUS).filter(s => !['resolved', 'closed'].includes(s)).map(s => <option key={s} value={s}>{STATUS[s]}</option>)}
                  </select>
                  <button className="btn sm" onClick={async () => { await copy(handover(t, LABELS)); toast('Copied', 'Handover summary is on your clipboard.', 'ok'); }}><I s={svg.copy}/> Copy handover</button>
                  <button className="btn sm" onClick={() => setLinkFromQueue(t)}><I s={svg.link}/> Report against this</button>
                  <button className="btn sm pri" onClick={() => setResolving(t)}><I s={svg.check}/> Resolve</button>
                </div>
              </div>
              <div>
                <h5 style={{ margin: '0 0 9px', font: '600 10.5px/1 var(--mono)', letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--mut)' }}>Routing &amp; clock</h5>
                <div className="sidecard" style={{ boxShadow: 'none', padding: 12 }}>
                  <div className="routechain">
                    {t.chain.map((c, i) => <div className={cx('rstep', i <= t.escalation && 'done')} key={i}>
                      <span className="rd"><i /></span><span className="rl">{i === t.escalation ? 'current' : c.note}</span>
                      <span className="rw">{short(c.who)}</span></div>)}
                  </div>
                  <div className="hr" style={{ margin: '12px 0' }} />
                  <div className="clockpair">
                    <div className={cx('clockbox', !t.firstResponseAt && t.frDueAt <= now && 'bad')}><span className="mut xxs">first response · live</span>
                      <Countdown t={t} now={now} mode="fr" />
                      <em className="mut xxs mono">due {fmtAt(t.frDueAt)} · {t.firstResponseAt ? 'answered ' + fmtAt(t.firstResponseAt) : 'not answered'}</em></div>
                    <div className="clockbox"><span className="mut xxs">resolution · live</span><Countdown t={t} now={now} mode="res" /></div>
                  </div>
                </div>
                <h5 style={{ margin: '16px 0 6px', font: '600 10.5px/1 var(--mono)', letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--mut)' }}>Timeline</h5>
                <div className="tl">{t.timeline.slice(0, 7).map((e, i) => (
                  <div className="ev" key={i}><time>{new Date(e.at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false })}</time><span>{e.text}</span></div>))}</div>
              </div>
            </div>}
          </article>;
        })}
        {!live.length && <div className="card empty"><div className="big">✓</div>
          <h3>{tickets.length ? 'Nothing matches these filters' : 'Queue is clear'}</h3>
          <p>{tickets.length ? 'Widen the status or priority filter to see the rest.' : 'Raise a ticket from the triage grid, or load a demo batch to see the board working.'}</p>
          <div style={{ display: 'flex', gap: 9, justifyContent: 'center', marginTop: 16 }}>
            <button className="btn" onClick={() => { setStatusFilter('all'); setPrioFilter(''); setDeptFilter(''); setOwnerFilter(''); setStudioFilter(''); setQ(''); }}>Clear filters</button>
            {!tickets.length && <button className="btn pri" onClick={() => { const t = seed(DATA, 16); setTickets(t); setArchived(t.filter(x => x.status === 'resolved')); }}><I s={svg.wand}/> Load 16 demo tickets</button>}
          </div></div>}
      </div>
    </div>);

  const insights = () => {
    const DEPTS = [...new Set(DATA.categories.flatMap(c => c.subs).map(x => x.department))].sort();
    const STUDIOS = DATA.studios.map(x => x.name || x);
    const axSet = X.applyFilter(all, axF);
    const axOn = X.activeFilters(axF);
    const cats = X.categoryStats(axSet);
    const owners2 = X.ownerStats(axSet, org);
    const chronic = X.chronicStats(axSet);
    const quality = X.closureQuality(axSet);
    const money = X.goodwillStats(axSet);
    const trend = X.weekTrend(axSet);
    const rhythm = X.clockGrid(axSet);
    const report = X.weeklyReport({ list: axSet, cats, owners: owners2, quality, chronic, money, trend, grid: rhythm });

    const counts = (key) => axSet.reduce((m, t) => (m[t[key]] = (m[t[key]] || 0) + 1, m), {});
    const bar = (obj, total, color) => Object.entries(obj).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
      <div className="bar" key={k}><span className="lbl" title={k}>{k}</span>
        <span className="bt"><i style={{ width: (100 * v / (total || 1)) + '%', background: color || undefined }} /></span>
        <span className="n">{v}</span></div>));
    const prio = counts('priority');
    const closedAll = axSet.filter(t => t.resolvedAt);
    const hit = closedAll.filter(t => (t.firstResponseAt || t.resolvedAt) <= t.frDueAt).length;
    const med = arr => { if (!arr.length) return '—'; const s = [...arr].sort((a, b) => a - b); return fmtDur(s[Math.floor(s.length / 2)]); };
    const res = closedAll.map(t => t.resolvedAt - t.createdAt);
    const fr = closedAll.map(t => (t.firstResponseAt || t.resolvedAt) - t.createdAt);
    const owners = axSet.reduce((m, t) => { const k = short(t.assignee); m[k] = (m[k] || 0) + 1; return m; }, {});
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const heat = DATA.studios.map(st => ({ st: st.name, n: days.map(d => axSet.filter(t => t.studio === st.name && dayKey(t.createdAt) === d).length) }));
    const hm = Math.max(1, ...heat.flatMap(h => h.n));
    /* ---- class + roster rollup, from the snapshots the class desk stored ---- */
    const withClass = axSet.filter(t => t.class?.sessionId);
    const sum = (list, k) => list.reduce((n, t) => n + (Number(t.class?.[k]) || 0), 0);
    const clsBooked = sum(withClass, 'booked'), clsAttended = sum(withClass, 'attended'),
      clsAbsent = sum(withClass, 'absent'), clsGuests = sum(withClass, 'guests'),
      clsOver = sum(withClass, 'overbook'), clsInc = sum(withClass, 'incompatible'), clsWl = sum(withClass, 'waitlist');
    const attNotes = withClass.reduce((n, t) => n + (t.class?.attendees?.length || 0), 0);
    const hourHist = Array.from({ length: 24 }, (_, h) => axSet.filter(t => new Date(t.createdAt).getHours() === h).length);
    const hourMax = Math.max(1, ...hourHist);
    const causes = axSet.map(t => t.resolution?.causeCategory).filter(Boolean).reduce((m, k) => (m[k] = (m[k] || 0) + 1, m), {});
    const outcomes = axSet.map(t => t.resolution?.outcome).filter(Boolean).reduce((m, k) => (m[k] = (m[k] || 1) + 1 || m[k], m), {});
    const goodwill = axSet.filter(t => t.resolution?.goodwill && t.resolution.goodwill !== 'None');
    const reopened = axSet.filter(t => (t.timeline || []).some(e => e.kind === 'reopen'));
    const capturedPct = axSet.length ? Math.round(100 * axSet.filter(t => t.resolution?.closureNote).length / (closedAll.length || 1)) : 0;
    return <div>
      <div className="phead"><div><div className="eyebrow">Analytics · {axSet.length} tickets tracked · {withClass.length} with a class attached</div>
        <h1>Where the load sits</h1>
        <p>Counting the live board and the archive together, so a category that looks quiet may in fact be closing everything, and one that looks busy may never be getting a reply.</p></div>
        <div className="right"><span className="chip mono"><I s={svg.pin}/> {new Date(now).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false })} IST</span></div></div>
      <section className={cx('ax-tools', axOpen && 'open')}>
        <div className="ax-head">
          <button type="button" className="ax-toggle" onClick={() => setAxOpen(o => !o)} aria-expanded={!!axOpen}
            data-tip="Nothing here changes the queue — the numbers on this page narrow on their own.">
            <span className="ax-ic"><I s={svg.filter} /></span><b>Filter &amp; export</b>
            <span className={cx('ax-count', axOn.length && 'on')}>{axOn.length
              ? `${axOn.length} filter${axOn.length === 1 ? '' : 's'} on · ${axSet.length} of ${all.length}`
              : `all ${all.length} tickets`}</span>
            <span className="ax-chev"><I s={svg.chev} /></span>
          </button>
          <div className="ax-quick">
            {axOn.length > 0 && <button className="btn xs ghost" onClick={() => setAxF(X.emptyFilter())}><I s={svg.x} /> clear</button>}
            <button className="btn xs" onClick={() => axCsv(`p57-tickets-${new Date().toISOString().slice(0, 10)}.csv`, X.ticketRows(axSet))}><I s={svg.down} /> Tickets CSV</button>
            <button className="btn xs" onClick={() => { if (navigator.clipboard?.writeText) navigator.clipboard.writeText(report); setAxOpen(true);
              toast('Weekly note ready', 'Eight lines of plain text, also printed at the bottom of the panel.', 'ok'); }}><I s={svg.copy} /> Copy the weekly note</button>
          </div>
        </div>
        {axOpen && <div className="ax-panel">
          <div className="ax-grp"><span className="eyebrow">Window</span>
            <div className="ax-dates">
              <label><span className="xxs mut">from</span><input type="date" value={axF.from} onChange={e => axSetF('from', e.target.value)} /></label>
              <label><span className="xxs mut">to</span><input type="date" value={axF.to} onChange={e => axSetF('to', e.target.value)} /></label>
            </div>
            <div className="ax-row">{[['Last 7 days', 7], ['Last 30 days', 30], ['Last quarter', 90]].map(([lab, d]) => {
              const from = new Date(Date.now() - d * 864e5).toISOString().slice(0, 10);
              return <button key={lab} className={cx('opt xs', axF.from === from && 'on')} onClick={() => setAxF(f => ({ ...f, from, to: '' }))}>{lab}</button>; })}
              <button className={cx('opt xs', !axF.from && !axF.to && 'on')} onClick={() => setAxF(f => ({ ...f, from: '', to: '' }))}>everything</button></div>
          </div>
          <div className="ax-grp"><span className="eyebrow">Taxonomy</span>
            <Picker f={{ id: 'ax-cat', label: 'Category', options: DATA.categories.map(c => c.name) }} value={axF.cat} list={DATA.categories.map(c => c.name)}
              onChange={v => axSetF('cat', v)} placeholder="Every category" />
            <Picker f={{ id: 'ax-dept', label: 'Department', options: DEPTS }} value={axF.dept} list={DEPTS}
              onChange={v => axSetF('dept', v)} placeholder="Every department" />
            <Picker f={{ id: 'ax-studio', label: 'Studio', options: STUDIOS }} value={axF.studio} list={STUDIOS}
              onChange={v => axSetF('studio', v)} placeholder="Every studio" />
          </div>
          <div className="ax-grp"><span className="eyebrow">Board state</span>
            <Picker f={{ id: 'ax-prio', label: 'Priority', options: ['critical', 'high', 'medium', 'low'] }} value={axF.prio} list={['critical', 'high', 'medium', 'low']}
              onChange={v => axSetF('prio', v)} placeholder="Any priority" />
            <div className="ax-row">{[['all', 'everything'], ['live', 'still open'], ['closed', 'filed']].map(([v, l]) =>
              <button key={v} className={cx('opt xs', axF.status === v && 'on')} onClick={() => setAxF(f => ({ ...f, status: v }))}>{l}</button>)}</div>
            {[['onlyClass', 'attached to a class'], ['onlyBreach', 'past a clock'], ['onlyRepeat', 'reported more than once'], ['onlyClosure', 'with a closure note']].map(([k, lab]) =>
              <label className="rcheck" key={k}><input type="checkbox" checked={!!axF[k]} onChange={e => setAxF(f => ({ ...f, [k]: e.target.checked }))} />{lab}</label>)}
          </div>
          <div className="ax-grp"><span className="eyebrow">Words</span>
            <Search value={axF.q} onChange={v => setAxF(f => ({ ...f, q: v }))} placeholder="number, title, member, owner…" />
            <p className="xs mut">Matches the ticket’s own text — including the write-up, so a paragraph the model wrote is searchable too.</p>
          </div>
          <div className="ax-grp"><span className="eyebrow">Export</span>
            <div className="ax-exports">
              <button className="btn sm" onClick={() => axCsv('p57-attainment-by-category.csv', cats)}><I s={svg.chart} /> Attainment by category</button>
              <button className="btn sm" onClick={() => axCsv('p57-owner-load.csv', owners2.map(o => ({ owner: o.owner, manager: o.manager, open: o.open, filed: o.closed, breach: o.breach, median_first_response_min: Math.round(o.medFr / 60000), goodwill_inr: o.goodwill })))}><I s={svg.user} /> Owner load &amp; line</button>
              <button className="btn sm" onClick={() => axCsv('p57-chronic-repeats.csv', chronic)}><I s={svg.flame} /> Chronic repeats</button>
              <button className="btn sm" onClick={() => { download(`p57-slice-${axSet.length}.json`, JSON.stringify(axSet, null, 2)); toast('Written out', `${axSet.length} tickets, exactly as stored, in JSON.`, 'ok'); }}><I s={svg.card} /> The whole slice (JSON)</button>
            </div>
            <pre className="ax-report">{report}</pre>
          </div>
        </div>}
      </section>
      <Stats items={[
        { value: axSet.length, label: 'Raised since install', acc: 'var(--med)' },
        { value: `${axSet.length ? Math.round(100 * hit / (closedAll.length || 1)) : 0}%`, label: 'First-response SLA hit', acc: 'var(--ok)', tag: `${hit}/${closedAll.length || 0}` },
        { value: med(fr), label: 'Median first response', acc: 'var(--brand2)' },
        { value: med(res), label: 'Median resolution', acc: 'var(--brand)' },
        { value: tickets.filter(t => !['resolved', 'closed'].includes(t.status) && t.frDueAt <= now).length, label: 'Breaches live now', acc: 'var(--crit)' },
        { value: Object.keys(owners).length, label: 'Owners carrying work', acc: 'var(--mut)' },
        { value: withClass.length, label: 'Hosted-class tickets', acc: 'var(--brand2)', tag: attNotes ? `${attNotes} attendee notes` : 'no roster notes' },
        { value: clsBooked ? `${Math.round(100 * clsAttended / clsBooked)}%` : '—', label: 'Class attendance on those sessions', acc: 'var(--ok)' }]} />
      <div className="panels">
        <div className="panel"><h4>By category</h4><div className="p-sub">Where tickets are actually coming from</div>{bar(counts('category'), axSet.length)}</div>
        <div className="panel"><h4>By priority</h4><div className="p-sub">Inferred from the taxonomy plus what reporters told us</div>
          {bar(prio, axSet.length)}
          <div className="hr" style={{ margin: '13px 0' }} />
          <h4 style={{ fontSize: 14 }}>By department</h4><div className="p-sub">Queue load per owning team</div>{bar(counts('department'), axSet.length, 'linear-gradient(90deg,var(--med),var(--brand2))')}</div>
        <div className="panel"><h4>Owner workload</h4><div className="p-sub">Who the desk is routing to first</div>{bar(owners, axSet.length, 'linear-gradient(90deg,var(--brand),var(--brand2))')}</div>
        <div className="panel"><h4>Studio × weekday</h4><div className="p-sub">Volume by site — the pattern that tells you which room needs an AMC</div>
          <div className="heat"><div /><div className="hh">Mon</div><div className="hh">Tue</div><div className="hh">Wed</div><div className="hh">Thu</div><div className="hh">Fri</div><div className="hh">Sat</div><div className="hh">Sun</div>
            {heat.map(h => <React.Fragment key={h.st}>
              <div className="hl" title={h.st}>{short(h.st)}</div>
              {h.n.map((n, i) => <div key={i} className="cell" title={`${n} ticket${n === 1 ? '' : 's'}`}
                style={{ background: n ? `color-mix(in oklab, var(--brand) ${18 + 62 * (n / hm)}%, var(--bg2))` : undefined, opacity: n ? 1 : .55 }} />)}
            </React.Fragment>)}</div></div>
        <div className="panel"><h4>Class &amp; roster pressure</h4>
          <div className="p-sub">Aggregated from the Momence roll attached to each class ticket</div>
          <div className="numgrid sm">
            {[['sessions covered', withClass.length], ['seats booked', clsBooked], ['attended', clsAttended],
              ['absent', clsAbsent], ['guests', clsGuests], ['over capacity', clsOver], ['on the waitlist', clsWl],
              ['blocked by compatibility', clsInc], ['attendee notes', attNotes], ['tickets with a class', withClass.length]]
              .filter(([, v]) => v).map(([k, v]) => <div key={k}><b className="mono">{v}</b><span>{k}</span></div>)}</div>
          <div className="hr" style={{ margin: '13px 0' }} />
          <h4 style={{ fontSize: 14 }}>Filing by hour</h4><div className="p-sub">When the floor actually raises things</div>
          <div className="hours">{hourHist.map((n, h) => <div key={h} className="hr-bar" title={`${n} ticket${n === 1 ? '' : 's'} filed at ${String(h).padStart(2, '0')}:00`}>
            <i style={{ height: `${6 + 94 * (n / hourMax)}%` }} /><span className="mut xxs mono">{h % 6 === 0 ? String(h).padStart(2, '0') : ''}</span></div>)}</div></div>
        <div className="panel"><h4>Resolution capture</h4>
          <div className="p-sub">How complete the close-out is, and what it blamed</div>
          <div className="kv"><span className="k">Full closure notes</span><span className="v mono">{capturedPct}% of {closedAll.length} closed</span></div>
          <div className="kv"><span className="k">Goodwill granted</span><span className="v mono">{goodwill.length} ticket{goodwill.length === 1 ? '' : 's'}
            {goodwill.length ? ` · ₹${goodwill.reduce((n, t) => n + (Number(t.resolution.amountINR) || 0), 0).toLocaleString('en-IN')}` : ''}</span></div>
          <div className="kv"><span className="k">Reopened after resolution</span><span className="v mono">{reopened.length}</span></div>
          <div className="hr" style={{ margin: '11px 0' }} />
          <h4 style={{ fontSize: 14 }}>Root causes named</h4>{bar(causes, closedAll.length || 1, 'linear-gradient(90deg,var(--crit),var(--high))')}</div>
        <div className="panel"><h4>Outcomes</h4><div className="p-sub">How these tickets actually finished</div>{bar(outcomes, closedAll.length || 1)}</div>
        <div className="panel"><h4>SLA tiers in use</h4><div className="p-sub">Distribution of the four clocks across the taxonomy</div>
          {bar(DATA.categories.flatMap(c => c.subs).reduce((m, s) => { const k = s.slaLabel.split('—')[0].trim(); m[k] = (m[k] || 0) + 1; return m; }, {}), DATA.counts.subcategories, 'linear-gradient(90deg,var(--high),color-mix(in oklab,var(--high) 45%,var(--brand2)))')}</div>
        <div className="panel"><h4>Top sub-categories ever raised</h4><div className="p-sub">From the 464-ticket historic log — the taxonomy is weighted by these</div>
          {bar(DATA.categories.flatMap(c => c.subs.map(s => ({ ...s, c: c.name }))).filter(s => s.hist > 3)
            .sort((a, b) => b.hist - a.hist).slice(0, 10).reduce((m, s) => (m[`${s.c} › ${s.name}`] = s.hist, m), {}),
            156)}</div>
        <div className="panel wide"><h4>Attainment by category</h4>
          <div className="p-sub">Raised, answered and closed inside the window above — a quiet category is only good news if it is also fast</div>
          <table className="ax-tbl"><thead><tr><th>Category</th><th className="n">Raised</th><th className="n">Open</th>
            <th className="n">Past clock</th><th className="n">Median FR</th><th className="n">Median close</th>
            <th className="n">p90 close</th><th className="n">SLA hit</th><th className="n">Record quality</th></tr></thead>
            <tbody>{cats.slice(0, 12).map((c, i) => { const cat = DATA.categories.find(x => x.name === c.category);
              const th = cat ? themeCache(c.category, null, i) : null;
              return <tr key={c.category}>
                <td><span className="ax-key" style={th ? { background: `hsl(${th.h} ${th.s}% ${th.l}%)` } : undefined}>{c.category}</span>
                  <em className="xxs mut">{c.depts} · {c.subs} sub-categories</em></td>
                <td className="n mono">{c.raised}</td><td className="n mono">{c.open}</td>
                <td className={cx('n mono', c.breach > 0 && 'bad')}>{c.breach}</td>
                <td className="n mono">{c.frLabel}</td><td className="n mono">{c.resLabel}</td><td className="n mono">{c.p90Label}</td>
                <td className="n"><span className="ax-meter"><i style={{ width: `${c.frHitPct}%` }} /><b className="mono">{c.frHitPct}%</b></span></td>
                <td className="n"><span className="ax-meter q"><i style={{ width: `${c.closureQuality}%` }} /><b className="mono">{c.closureQuality ? c.closureQuality + '%' : '—'}</b></span></td>
              </tr>; })}</tbody></table>
          {cats.length === 0 && <p className="empty">Nothing in this window to measure.</p>}</div>
        <div className="panel"><h4>Repeats that are really one fault</h4>
          <div className="p-sub">Anything reported twice, and what it cost. The hub escalates at the third report — this is the list to act on before then</div>
          {chronic.length ? <ul className="ax-list">{chronic.slice(0, 8).map(r => { const cat = DATA.categories.find(x => x.name === r.category);
            const th = cat ? themeCache(r.category, r.sub, 0) : null;
            return <li key={r.key}><span className="ax-key" style={th ? { background: `hsl(${th.h} ${th.s}% ${th.l}%)` } : undefined}>{r.sub}</span>
              <em className="xxs mut">{r.studios.join(', ')}</em>
              <span className="ax-n mono">×{r.reports}</span>
              <span className="ax-tag">{r.escalations ? `${r.escalations} escalated` : 'not escalated'}</span>
              {r.goodwill > 0 && <span className="ax-tag inr">₹{r.goodwill.toLocaleString('en-IN')}</span>}
              <span className="ax-tag mut">{r.lastAgo}</span></li>; })}</ul>
            : <p className="empty">No fault has been reported twice inside this window.</p>}</div>
        <div className="panel"><h4>How complete a close-out is</h4>
          <div className="p-sub">The same eight points the resolution rail asks for, counted over {quality.of} filed record{quality.of === 1 ? '' : 's'}</div>
          {quality.of ? <ul className="ax-q">{quality.rows.map(r => <li key={r.id}>
            <span>{r.label}</span><span className="ax-meter"><i style={{ width: `${r.pct}%` }} /></span>
            <b className="mono">{r.pct}%</b></li>)}</ul>
            : <p className="empty">Nothing has been filed with a resolution record yet.</p>}
          {quality.of > 0 && <div className="ax-foot"><span className="chip mono">{quality.full} of {quality.of} pass all eight</span>
            <span className="xs mut">A record that misses “prevention” is a fix that will come back.</span></div>}</div>
        <div className="panel"><h4>What the goodwill actually cost</h4>
          <div className="p-sub">Credits, refunds and passes, attributed to the cause that triggered them</div>
          <div className="ax-money"><b className="serif">₹{money.total.toLocaleString('en-IN')}</b>
            <span className="xs mut">across {money.count} ticket{money.count === 1 ? '' : 's'}
              {money.count ? ` · average ₹${money.avg.toLocaleString('en-IN')}` : ''}</span></div>
          {money.byCause.length ? bar(money.byCause.reduce((m, r) => (m[r.cause] = r.inr, m), {}), money.total || 1,
            'linear-gradient(90deg,var(--high),color-mix(in oklab,var(--high) 40%,var(--brand)))')
            : <p className="empty">No credit or refund was given in this window.</p>}</div>
        <div className="panel wide"><h4>Filing rhythm</h4>
          <div className="p-sub">Every ticket in the window, by hour and weekday — {rhythm.peakDay} at {String(rhythm.peakHour).padStart(2, '0')}:00 is the busiest corner of the week</div>
          <div className="ax-heat">{rhythm.grid.map(row => <div key={row.day} className="hr">
            <span className="hl" title={row.day}>{row.day}</span>
            {row.hours.map((n, h) => <i key={h} className={cx('hc', n > 0 && 'on')} title={`${row.day} ${String(h).padStart(2, '0')}:00 — ${n} ticket${n === 1 ? '' : 's'} filed`}
              style={{ opacity: n ? 0.28 + 0.72 * (n / rhythm.max) : undefined }} />)}
            <b className="mono rown">{row.total}</b></div>)}</div>
          <div className="ax-hrs">{rhythm.byHour.map((n, h) => <span key={h} className="xxs mono">{h % 3 === 0 ? String(h).padStart(2, '0') : '·'}</span>)}</div></div>
        <div className="panel"><h4>Week by week</h4>
          <div className="p-sub">Raised against closed, with the median first response under each bar</div>
          {trend.length ? <div className="ax-spark">{trend.slice(-14).map(w => { const mx = Math.max(1, ...trend.map(x => Math.max(x.raised, x.closed)));
            return <div key={w.week} className="ax-sp" title={`${w.label} · ${w.raised} raised · ${w.closed} closed · ${w.breach} past clock · FR ${w.medFrLabel}`}>
              <span className="bars"><i style={{ height: `${8 + 88 * (w.raised / mx)}%` }} /><u style={{ height: `${8 + 88 * (w.closed / mx)}%` }} /></span>
              {w.breach > 0 && <b className="bd mono">{w.breach}</b>}
              <em className="xxs">{w.label}</em></div>; })}</div>
            : <p className="empty">One ticket is not a trend. File a few more.</p>}</div>
        <div className="panel"><h4>Who holds it, and who they answer to</h4>
          <div className="p-sub">Straight off the escalation ladder in the taxonomy — the same lines the resolution rail enforces</div>
          <ul className="ax-own">{owners2.slice(0, 10).map(o => <li key={o.owner}>
            <Avatar name={o.owner} size={22} />
            <span className="ow-n"><b>{o.owner}</b><em className="xxs mut">{o.manager ? `reports to ${o.manager}` : 'top of this line'} · {o.categories} categor{o.categories === 1 ? 'y' : 'ies'}</em></span>
            <span className="ow-k mono">{o.open} open</span>
            <span className="ow-k mono">{o.closed} filed</span>
            <span className={cx('ow-k mono', o.breach > 0 && 'bad')}>{o.breach ? `${o.breach} late` : 'on time'}</span>
            <span className="ow-k mono xs mut">FR {o.frLabel}</span>
            {o.goodwill > 0 && <span className="ow-k mono xs">₹{o.goodwill.toLocaleString('en-IN')}</span>}</li>)}</ul>
          {owners2.length === 0 && <p className="empty">Nobody holds anything in this window.</p>}</div>
      </div>
    </div>;
  };

  /* ============================== the two rails ==============================
     Left: who you are on this board and what that narrows the queue to. Right: the ticket’s
     resolution record, or the intake’s routing preview while a report is still being written.
     Both are chrome, not content — the page underneath never has to scroll sideways for them. */
  const railWork = () => {
    const live = tickets.filter(t => !['resolved', 'closed'].includes(t.status));
    const held = viewer ? live.filter(t => short(t.assignee) === viewer.name) : [];
    const breach = live.filter(t => t._breach || (t.frDueAt && t.frDueAt < now));
    const myLine = viewer ? upline(org, viewer.name, 3) : [];
    const reports = viewer ? directReports(org, viewer.name) : [];
    const load = n => live.filter(t => short(t.assignee) === n && !['resolved', 'closed'].includes(t.status)).length;
    return <div className="railstack">
      <section className="rcard idcard">
        <span className="eyebrow">At the desk as</span>
        <div className="idrow">
          <Avatar name={viewer?.name || 'guest'} size={40} />
          <div className="idwho">
            <b>{viewer?.name || 'Nobody yet'}</b>
            <em className="xs mut">{viewer?.role || 'pick a name to sign in'}
              {viewer ? ` · ${viewer.kind}` : ''}</em>
          </div>
        </div>
        <label className="idswitch" title="Who the hub treats you as — it decides whether the resolution rail is a pen or a window.">
          <span className="xxs mut">switch identity</span>
          <select value={viewer?.name || ''} onChange={e => setViewerName(e.target.value)}>
            <option value="">choose a name…</option>
            {people.map(p => <option key={p.name} value={p.name}>{p.name} · {p.role || p.kind}</option>)}
          </select>
        </label>
        {viewer && <p className="xs mut idnote">
          {viewer.owns ? `${viewer.owns} desk${viewer.owns > 1 ? 's' : ''}` : 'no desk of their own'}
          · {viewer.manages ? `manages ${viewer.manages}` : 'reports up'}
          {viewer.reportsTo ? ` to ${viewer.reportsTo}` : ''}
          {viewer.breach ? ` · ${viewer.breach} past clock` : ''}
        </p>}
      </section>

      <section className="rcard counts">
        {[[live.length, 'open on the board'], [breach.length, 'past first response'],
          [held.length, 'on my board'], [archived.length, 'filed']].map(([n, l], i) =>
          <button type="button" key={l} className={cx('rc', i === 1 && n > 0 && 'bad')} onClick={() => {
            setView('queue');
            if (i === 1) { setStatusFilter('live'); setPrioFilter(''); }
            if (i === 2) { setMineOn(true); setStatusFilter('all'); }
            if (i === 3) { setMineOn(false); setStatusFilter('resolved'); }
          }}><b className="mono">{n}</b><span className="xxs">{l}</span></button>)}
      </section>

      <section className="rcard filters">
        <div className="rcard-head"><span className="eyebrow">Narrow the board</span>
          <button className="btn xs ghost" onClick={() => { setStatusFilter('live'); setPrioFilter(''); setDeptFilter(''); setOwnerFilter('');
            setStudioFilter(''); setQ(''); setMineOn(false); setOnlyClass(false); }}>reset</button></div>
        <Search value={q} onChange={setQ} placeholder="number, title, member, machine…" />
        <div className="rf-row">{['', 'critical', 'high', 'medium', 'low'].map(p =>
          <button key={p || 'any'} className={cx('opt xs', prioFilter === p && 'on')} onClick={() => setPrioFilter(p)}>{p || 'any priority'}</button>)}</div>
        <div className="rf-row">{[['live', 'live'], ['all', 'everything'], ['resolved', 'filed']].map(([v, l]) =>
          <button key={v} className={cx('opt xs', statusFilter === v && 'on')} onClick={() => setStatusFilter(v)}>{l}</button>)}</div>
        <label className="rcheck"><input type="checkbox" checked={mineOn} onChange={e => { setMineOn(e.target.checked); if (e.target.checked) setStatusFilter('all'); }} />
          only what I own</label>
        <label className="rcheck"><input type="checkbox" checked={onlyClass} onChange={e => setOnlyClass(e.target.checked)} />
          hosted-class impact only</label>
        <div className="rf-row">{DATA.studios.map(st => { const nm = st.name || st; return <button key={nm}
          className={cx('opt xs', studioFilter === nm && 'on')} onClick={() => setStudioFilter(x => x === nm ? '' : nm)}>{nm}</button>; })}</div>
      </section>

      {held.length > 0 && <section className="rcard mine">
        <div className="rcard-head"><span className="eyebrow">Next off my queue</span><b className="mono xs">{held.length}</b></div>
        <ul>{held.slice(0, 4).map(t => <li key={t.id}>
          <button onClick={() => { setView('queue'); setSheet(t.id); }}>
            <span className="mono xxs">{t.number}</span>
            <span className="mtitle">{t.title || t.subCategory}</span>
            <Pill p={t.priority} />
          </button></li>)}</ul>
      </section>}

      <section className="rcard line">
        <div className="rcard-head"><span className="eyebrow">Reporting line</span></div>
        {myLine.length ? <div className="org-up">{myLine.map((p, i) => <span key={p.name} className="org-node"
          title={p.role}>{p.name}<em>{i === 0 ? 'directly above' : 'further up'}</em></span>)}</div>
          : <p className="xs mut">This name sits at the top of the escalation ladder — nothing above it.</p>}
        {reports.length > 0 && <ul className="org-down">{reports.slice(0, 6).map(p =>
          <li key={p.name}><Avatar name={p.name} size={20} /><span>{p.name}</span>
            <em className="mono xxs">{load(p.name)} open</em></li>)}</ul>}
      </section>
    </div>;
  };

  const railFocus = () => {
    if (view === 'intake' && sub) return intakeAside();
    const t = focus;
    /* one pen per record: while the wide close-out form is open the rail stands down rather
       than holding a second, unsynchronised draft of the same eighteen fields */
    if (t && resolving && resolving.id === t.id) return <div className="railstack">
      <section className="rcard rail-empty">
        <span className="eyebrow">Resolution rail</span>
        <div className="re-mark"><I s={svg.clip} /></div>
        <h5>Being written in the wide form</h5>
        <p className="xs mut">The close-out for {t.number} is open on the modal, so this rail is waiting for it.
          Finish it there — cause, action, what the member was told — and the record lands here as the filed trail.</p>
      </section>
    </div>;
    if (!t) return <div className="railstack">
      <section className="rcard rail-empty">
        <span className="eyebrow">Resolution rail</span>
        <div className="re-mark"><I s={svg.clip} /></div>
        <h5>Nothing open on the rail</h5>
        <p className="xs mut">Pick a card in the queue — or raise a report — and the close-out record for it
          appears here: cause, action, what the member was told, evidence, and whether you are the person
          allowed to write any of it.</p>
        <button className="btn sm" onClick={() => { const x = tickets.find(y => !['resolved', 'closed'].includes(y.status)); if (x) { setView('queue'); setSheet(x.id); } }}>
          <I s={svg.inbox} /> Open the oldest live ticket
        </button>
      </section>
    </div>;
    return <div className="railstack">
      <ResolutionRail t={t} viewer={viewer} org={org} now={now}
        onSubmit={f => {
          if (!resolutionRights(t, viewer, org).ok) { toast('Read-only', ownershipLine(t, org), 'warn'); return; }
          recordResolution(t.id, f); setSheet(null);
        }}
        onSaveDraft={f => { patch(t.id, x => ({ ...x, resolutionDraft: f }));
          toast('Draft kept', 'Saved on the ticket — it is here when you come back to this rail.', 'ok'); }}
        onOpenWide={() => (['resolved', 'closed'].includes(t.status) ? setSheet(t.id) : setResolving(t))}
        onEscalate={id => { escalate(id); }}
        onRespond={x => { markFR(x.id); toast('Nudge sent', `Marked first response for ${x.number} so ${short(x.assignee)} sees it at the top of their board.`, 'ok'); }}
        onViewer={p => setViewerName(p.name)}
        onCopyReply={x => { const txt = memberReplyDraft(x); copy(txt);
          toast('Reply copied', `${txt.split(/\s+/).length} words built from the resolution record — paste it into WhatsApp or the reply email.`, 'ok'); }} />
    </div>;
  };

  /* ============================ chrome ============================ */
  return <div className="app">
    {/* the desk sits on a hairline canvas, not on a flat fill */}
    <div className="canvas-grid" aria-hidden="true" />
    <div className="topbar">
      <div className="mark">
        <div className="glyph"><img src={theme === 'dark' ? brandDark : brandLight}
          alt="Physique 57" width="34" height="34" /></div>
        <div className="who"><b>Physique 57 India</b><em>Support &amp; Ticket Hub</em></div>
      </div>
      <nav className="tabs">{TABS.map(t => (
        <button key={t.id} aria-current={view === t.id} onClick={() => setView(t.id)}>
          <span dangerouslySetInnerHTML={{ __html: t.icon }} />{t.label}
          {t.badge != null && <span className={cx('dot', t.alert && 'alert')}>{t.badge}</span>}
        </button>))}</nav>
      <div className="spacer" />
      <div className="tools">
        <div className="now"><span className="pulse-dot" /> {new Date(now).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })} <b>IST</b></div>
        <button className="cmdk" onClick={() => setPalette(true)} title="Jump to anything (⌘K)"><kbd>⌘K</kbd> search everything</button>
        <IconBtn title="Guided powerCycle report" onClick={() => setCycleModal(true)}><span dangerouslySetInnerHTML={{ __html: svg.whistle }} /></IconBtn>
        <IconBtn title="Integrations & settings" className={cx(settings && 'on')} onClick={() => setSettings(true)}><span dangerouslySetInnerHTML={{ __html: svg.sliders }} /></IconBtn>
        <IconBtn title="Shortcuts (?)" onClick={() => setShowHelp(true)}>?</IconBtn>
        <IconBtn title={theme === 'dark' ? 'Light theme' : 'Dark theme'} onClick={() => setTheme(x => x === 'dark' ? 'light' : 'dark')}>
          <span dangerouslySetInnerHTML={{ __html: theme === 'dark' ? svg.sun : svg.moon }} /></IconBtn>
      </div>
    </div>
    <div className="shell">
      <aside className="rail rail-l" id="rail-work" aria-label="Desk, filters and reporting line">{railWork()}</aside>
      <main>{view === 'queue' ? queue() : view === 'insights' ? insights() : view === 'class' ? classDesk()
        : view === 'trainers' ? trainers() : view === 'log' ? classLog() : (view === 'triage' && !sub) ? triage() : intake()}</main>
      <aside className="rail rail-r" id="rail-focus" aria-label="Resolution record for the ticket in focus">{railFocus()}</aside>
    </div>
    <footer className="legal">
      <span><b>{DATA.counts.categories}</b> categories · <b>{DATA.counts.subcategories}</b> sub-categories · <b>{DATA.counts.fields.toLocaleString()}</b> intake field plans</span>
      <span>SLA model <b>P1 30m/4h · P2 2h/12h · P3 8h/48h · P4 24h/5d</b></span>
      <span>Taxonomy derived from <b>iris-ai-v2/constants.ts</b> + <b>464 historic tickets</b> · {DATA.generatedAt}</span>
      <span><b>{DATA.counts.lookupFields}</b> linked lookup fields over a demo dataset of
        <b> {listMomence('members', { pageSize: 1 }).total}</b> members · <b>{listMomence('sessions', { pageSize: 1 }).total}</b> classes ·
        <b>{CONSTANTS.counts.memberships}</b> packages</span>
      <span>Everything stays in this browser (localStorage) — nothing is posted anywhere.</span>
      <button className="btn sm text" onClick={() => setWipe(true)}><I s={svg.wand}/> Reset demo</button>
    </footer>
    {wipe && <Modal title="Reset the demo board?" tone="danger" onClose={() => setWipe(false)}
      description="Everything on this device is demo data — but it is the data the board is currently counted on."
      footer={<>
        <button className="btn ghost" onClick={() => setWipe(false)}>Keep the board</button>
        <button className="btn danger" onClick={() => { localStorage.removeItem('p57.hub.v1.tickets'); localStorage.removeItem('p57.hub.v1.archived');
          const t = seed(DATA, 16); setTickets(t); setArchived(t.filter(x => x.status === 'resolved')); setWipe(false);
          toast('Demo data reloaded', 'Board reset to 16 seeded tickets.', 'ok'); }}><I s={svg.wand} /> Reset to 16 demo tickets</button>
      </>}>
      <p className="hint">Tickets you filed, the resolution records written against them, saved views and the drafted Momence
        actions all go. The taxonomy, the SLA model and the settings on this device stay as they are.</p>
      <div className="numgrid" style={{ marginTop: 12 }}>
        {[['on the board', tickets.length], ['in the archive', archived.length], ['after the reset', 16],
          ['kept', 'settings + views']].map(([kk, v]) => <div className="num" key={kk}><b>{v}</b><span>{kk}</span></div>)}
      </div>
    </Modal>}
    <Toasts items={toasts} kill={id => setToasts(t => t.filter(x => x.id !== id))} />
    {done && <Modal title="Ticket routed" icon={<span dangerouslySetInnerHTML={{ __html: svg.check }} />}
      onClose={() => setDone(null)} footer={<>
        <button className="btn" onClick={() => { copy(handover(done, LABELS)); toast('Copied', 'The full handover note is on your clipboard.', 'ok'); }}><I s={svg.copy}/> Copy handover</button>
        <button className="btn lg" onClick={() => { setDone(null); setView('triage'); setCat(null); }}>Raise another</button>
        <button className="btn pri" onClick={() => { setOpenId(done.id); setDone(null); setView('queue'); }}>Open in queue</button></>}>
      <div className="success">
        <div className="seal"><span style={{ transform: 'scale(1.7)' }} dangerouslySetInnerHTML={{ __html: svg.check }} /></div>
        <h3>{short(done.assignee)} owns this</h3>
        <div className="tno">{done.number} · {done.category} › {done.subCategory}</div>
        <div className="nextdue">
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <span className="mut xs mono" style={{ letterSpacing: '.12em', textTransform: 'uppercase' }}>first response by</span>
            <span className="t">{fmtAt(done.frDueAt)}</span>
            <Pill p={done.priority} /></div>
          <div className="hr" style={{ margin: '11px 0' }} />
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <span className="mut xs mono" style={{ letterSpacing: '.12em', textTransform: 'uppercase' }}>resolution by</span>
            <span className="t">{fmtAt(done.resDueAt)}</span>
            <span className="chip mono">{done.slaLabel}</span></div>
          <div className="hint" style={{ marginTop: 11 }}>
            Escalation path {done.chain.map(c => short(c.who)).join(' → ')} · {Object.keys(done.data).length} fields captured</div>
        </div>
      </div></Modal>}
    {review && sub && (
      <ReviewModal sub={sub} fields={fields} data={{ ...data, ...(review.patch || {}) }}
        cls={review.cls}
        visibleFields={visible} missing={[]} gating={gating} chain={previewChain} priority={livePriority}
        hours={{ first: sub.hours.first, res: sub.hours.res }} studio={studio}
        onCancel={() => { setReview(null); setPendingLink(null); }}
        onFix={id => { setReview(null); const el = document.querySelector('[data-fid="' + (id || 'reporter_name') + '"]'); el?.scrollIntoView({ behavior: 'smooth', block: 'center' }); el?.querySelector('input,select,textarea')?.focus(); }}
        onConfirm={() => fileTicket(review.patch || {})} />)}
    {pendingLink && !linkFromQueue && (
      <LinkTicketModal tickets={tickets} data={{ ...data, _subName: sub?.name || linkFromQueue?.subCategory }}
        onCancel={() => setPendingLink(null)}
        onCreateSeparate={() => { setPendingLink(null); fileTicket({}); }}
        onLink={t => setPendingLink({ at: Date.now(), ticket: t })} />)}
    {resolving && <ResolutionModal t={resolving} onCancel={() => setResolving(null)} onConfirm={f => recordResolution(resolving.id, f)} />}
    {sheet && (() => { const t = all.find(x => x.id === sheet); return t && <TicketSheet t={t} story={t.writeup || stories[t.id] || t.narrative} now={now}
      fields={buildFields(t.data, `${t.category}|||${t.subCategory}`, DATA, t.studio)}
      all={all} onClose={() => setSheet(null)}
      onRespond={() => markFR(t.id)} onEscalate={() => escalate(t.id)} onStatus={v => setStatus(t.id, v)}
      onResolve={() => setResolving(t)} onOpenRecord={rec => setRecord(rec)}
      onHandover={async () => { await copy(handover(t, LABELS)); setSheet(null);
        toast('Copied', 'The handover summary for ' + t.number + ' is on your clipboard.', 'ok'); }}
      onExport={() => { download(`${t.number}.json`, JSON.stringify(t, null, 2)); setSheet(null); }}
      theme={themeCache(t.category, t.subCategory)}
      extra={<MomenceActions t={t} now={now} onApply={r => applyAction(t.id, r)}
        onCopy={r => { copy(receiptText(r)); toast('Receipt copied', 'The payload, the endpoint and the reference — ready to paste into the ops thread.', 'ok'); }} />} />; })()}
    {linkFromQueue && (
      <LinkTicketModal tickets={tickets.filter(x => x.id !== linkFromQueue.id)}
        data={{ _subName: linkFromQueue.subCategory }}
        onCancel={() => setLinkFromQueue(null)}
        onCreateSeparate={() => { setLinkFromQueue(null); toast('Filed separately', 'That ticket was already resolved — a new one is on the board instead.', 'ok'); }}
        onLink={async target => {
          const rec = target.recurrenceCount || 1;
          const merged = { ...target, recurrenceCount: rec + 1, linkedTicketId: linkFromQueue.id, updatedAt: Date.now(),
            timeline: [{ at: Date.now(), kind: 'repeat', text: `Report #${rec + 1} logged against ${target.number} from ${linkFromQueue.number}` }, ...target.timeline] };
          setTickets(list => list.map(x => x.id === merged.id ? merged : x));
          setLinkFromQueue(null);
          toast(`Linked ${linkFromQueue.number} → ${target.number}`, `Report #${rec + 1} on the older ticket; its clock now covers both.`, 'ok');
        }} />)}
    {record && <RecordModal module={record.module} id={record.id} record={record.raw} ticket={record.ticket} onClose={() => setRecord(null)} />}
    {settings && <SettingsModal onClose={() => setSettings(false)} prefs={prefs} setPrefs={setPrefs}
      momenceStatus={momenceStatus} onTestMomence={testMomence}
      ai={{ key: aiKey, setKey: setAiKey, model: aiModel, setModel: setAiModel, auto: aiAuto, setAuto: setAiAuto,
        mask: maskKey(aiKey), ready: aiReady(aiKey),
        forms: formIds, setForm: (id, patchForm) => setFormIds(f => ({ ...f, [id]: { ...(f[id] || {}), ...patchForm } })), formDefs: FORMS,
        test: async () => { const t = all[0] || draftTicket(); if (!t) return 'nothing to test against';
          const r = await narrateTicket(t, { key: aiKey, model: aiModel, maxTokens: 90 });
          return r.ok ? `${r.model} answered ${r.words} words in ${(r.ms / 1000).toFixed(1)}s` : (r.error || 'no answer'); } }} />}
    {cycleModal && <CycleTemplateModal onClose={() => setCycleModal(false)} data={data}
      onApply={patch => {
        /* Guided answers land on whichever fields this sub-category actually shows. A field the
           conditions have not revealed yet still takes its answer — the studio the desk picks next
           uncovers it — but an answer that would live only on a field that is not on the form is
           folded into the summary too, so nothing the desk typed goes invisible on the ticket. */
        const have = new Set(fields.map(f => f.id));
        const onForm = new Set(visible.map(f => f.id));
        const labelOf = id => (fields.find(f => f.id === id) || {}).label || fieldLabels[id] || id;
        const pick = (...ids) => ids.find(i => have.has(i));
        const routes = {
          bike_number: ['bike_number', 'asset_id'],
          cycle_issue: ['cycle_issue', 'cycle_symptom', 'summary'],
          cycle_part: ['cycle_part', 'cycle_notes', 'summary'],
          cycle_recurrence: ['cycle_recurrence', 'is_repeat'],
          cycle_desk_action: ['cycle_desk_action', 'last_restart'],
          cycle_notes: ['cycle_notes', 'summary'],
        };
        const applied = {}; const fold = [];
        for (const [k, v] of Object.entries(patch)) {
          if (v == null || !String(v).trim()) continue;
          const target = pick(...(routes[k] || [k]));
          if (!target) { fold.push(`${fieldLabels[k] || k}: ${v}`); continue; }
          const wrote = target === 'is_repeat'
            ? (/recurring/i.test(v) ? 'Yes, same issue recurred' : 'No, first time') : v;
          applied[target] = target === 'summary' && applied.summary ? `${applied.summary} · ${wrote}` : wrote;
          if (!onForm.has(target) && target !== 'summary') fold.push(`${labelOf(target)}: ${v}`);
        }
        if (patch.bike_number && have.has('asset_id') && !applied.asset_id) applied.asset_id = patch.bike_number;
        if (patch.bike_number && have.has('asset_type') && !applied.asset_type) applied.asset_type = 'PowerCycle bike';
        if (fold.length && onForm.has('summary'))
          applied.summary = [applied.summary, ...fold].filter(Boolean).join(' · ');
        setData(d => ({ ...d, ...applied }));
        setCycleModal(false);
        if (!sub) { setCat(null); }
        toast('Guided answers added', `${Object.keys(applied).length} fields filled from the powerCycle intake questions`
          + (fold.length ? ` · ${fold.length} held in the summary until their field is on the form` : '')
          + (sub ? ' — they are on your form now' : '. Pick a sub-category to file.'), 'ok');
      }} />}
    {palette && <CommandPalette items={paletteItems()} onClose={() => setPalette(false)} onRun={r => r.run && r.run()} />}
    {showHelp && <Modal title="Keyboard" icon={<span dangerouslySetInnerHTML={{ __html: svg.wand }} />} onClose={() => setShowHelp(false)}>
      <div className="kbdhelp">{[['Focus search', '/'], ['Raise a new ticket', 'n'], ['Live queue', 'q'], ['Insights', 'i'], ['Toggle theme', 't'], ['Close / back', 'Esc'], ['This panel', '?']]
        .map(([a, b]) => <div key={a}><span className="mut">{a}</span><span><span className="kbd">{b}</span></span></div>)}</div>
    </Modal>}
  </div>;
}

/* Mounted only in the browser; the test harness imports App without a DOM root. */
const rootEl = typeof document !== 'undefined' && document.getElementById('root');
if (rootEl) createRoot(rootEl).render(<App />);

export default App;
