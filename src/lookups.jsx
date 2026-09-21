/* Linked lookups: Momence-backed member/session pickers with record modals, and a ticket
   search for linking instead of typing a number. The control mirrors the reference
   `MultiSelect` (search → chips → source line) and the record modals mirror `EntityDialog`
   (overview / related records / raw payload). */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import svg, { I } from './icons.jsx';
import { cx, Modal, Avatar, Pill, StatusPill, fmtAt, Search, STATUS } from './ui.jsx';
import { listMomence, detailMomence, normalise, DEMO_SOURCE, readOnlyNotice, obj,
  listSessionBookings, sessionStats, memberBrief, membershipBrief, ENDPOINTS, INCOMPATIBILITY } from './momence.js';
import { ATT_STATUS, ATT_TAGS, ATT_ACTION } from './vocab.js';

const FREEZE_HINT = 'not_set | now | scheduled | before_renewal';

/* The roster of a session is the same component in three places — the class desk, the ticket
   detail (read back) and the member picker inside a form field — so it lives here once. */
export const ROSTER_FILTERS = [['all', 'everyone'], ['attended', 'attended'], ['no-show', 'no-shows'],
  ['waitlist', 'waitlist'], ['cancelled', 'cancelled'], ['first-timer', 'first-timers'],
  ['incompatible', 'not compatible'], ['with-guest', 'with a guest']];
const firstName = b => b.member ? `${b.member.firstName} ${b.member.lastName}` : String(b.guestName || 'Guest');
const initialsOf = b => b.member ? [b.member.firstName, b.member.lastName].map(x => (x || '?')[0]).join('').toUpperCase() : 'GU';

export function AttendeeRoster({ sessionId, entries = {}, onEntries, onNote, readOnly, density = 'roomy',
  onOpenMember }) {
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState([]);
  const [expanded, setExpanded] = useState(null);
  const book = useMemo(() => listSessionBookings(sessionId, { status: filter === 'all' ? 'all' : filter, query, pageSize: 400 }),
    [sessionId, filter, query]);
  const stats = useMemo(() => sessionStats(sessionId), [sessionId]);
  const rows = book.items || [];
  const flagged = Object.values(entries).filter(e => e && (e.status || (e.tags || []).length || (e.actions || []).length || (e.note || '').trim())).length;
  /* A host can tick a status and start typing a note inside one batch. Writing through the
     pending value (not the render snapshot) is what keeps the first edit from being lost. */
  const live = useRef(entries);
  live.current = entries;
  const setRow = (id, patch) => {
    const next = { ...live.current, [id]: { ...(live.current[id] || {}), ...patch } };
    live.current = next;
    if (onEntries) onEntries(next); else onNote?.(id, patch);
  };
  const togglePick = id => setPicked(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);
  const bulk = patch => { rows.filter(r => picked.includes(r.id)).forEach(r => setRow(r.id, patch)); setPicked([]); };

  return (
    <div className={cx('roster', 'roster-' + density, readOnly && 'ro')}>
      <div className="roster-bar">
        <div className="roster-filters">
          {ROSTER_FILTERS.map(([k, lab]) => {
            const n = k === 'all' ? (stats?.booked || 0) + (stats?.cancelled || 0) + (stats?.waitlist || 0) : (book.stats && k === filter ? rows.length : null);
            return <button key={k} type="button" className={cx('seg xs', filter === k && 'on')} onClick={() => setFilter(k)}>{lab}
              {n != null && <b>{n}</b>}</button>;
          })}
        </div>
        <div className="roster-search"><Search value={query} onChange={setQuery} placeholder="Find an attendee by name, ID, email…" /></div>
      </div>
      <div className="roster-meta">
        <span className="chip mono">{rows.length} shown</span>
        <span className={cx('chip', flagged ? 'warn' : '')}>{flagged} with a note or action</span>
        {stats && <>
          <span className="chip mono">{stats.attended}/{stats.booked} attended</span>
          {stats.overbook > 0 && <span className="chip bad">{stats.overbook} over capacity</span>}
          {stats.waitlist > 0 && <span className="chip">{stats.waitlist} on the waitlist</span>}
          {stats.guests > 0 && <span className="chip">{stats.guests} guests</span>}
        </>}
        {!readOnly && !!picked.length && <div className="roster-bulk">
          <b>{picked.length} selected →</b>
          <select value="" onChange={e => e.target.value && bulk({ status: e.target.value })}>
            <option value="">set status…</option>{ATT_STATUS.map(o => <option key={o}>{o}</option>)}</select>
          <select value="" onChange={e => e.target.value && bulk({ actions: [...new Set([...(entries[picked[0]]?.actions || []), e.target.value])] })}>
            <option value="">offer…</option>{ATT_ACTION.map(o => <option key={o}>{o}</option>)}</select>
          <select value="" onChange={e => e.target.value && bulk({ tags: [...new Set([...(entries[picked[0]]?.tags || []), e.target.value])] })}>
            <option value="">tag…</option>{ATT_TAGS.map(o => <option key={o}>{o}</option>)}</select>
          <button type="button" className="btn sm ghost" onClick={() => setPicked([])}>clear</button>
        </div>}
      </div>
      <div className="roster-rows">
        {!rows.length && <p className="mut">No attendee on this page — try another filter.</p>}
        {rows.map((r, i) => {
          const b = r.raw, id = b.id;
          const e = entries[id] || {};
          const comp = b.compatibility || {};
          const openRow = expanded === id;
          const isGuest = !b.member;
          return <div className={cx('arow', picked.includes(id) && 'picked', (e.status || e.note) && 'flagged')} key={id}>
            <div className="arow-main">
              {!readOnly && <button type="button" className={cx('apick', picked.includes(id) && 'on')} onClick={() => togglePick(id)}
                aria-label={'Select ' + firstName(r.raw)}><I s={svg.check} /></button>}
              <span className="aface"><Avatar name={firstName(b)} size={28} i={i % 4} /></span>
              <span className="aname"><b>{firstName(b)}</b>
                <em className="mono">
                  {isGuest ? 'walk-in guest' : `#${b.member.id} · spot ${b.roomSpotId ?? '—'} · ${b.ticketsBought || 0} credit${b.ticketsBought === 1 ? '' : 's'}`}
                  {b.isRecurring ? ' · recurring' : ''}{b.waitlist ? ' · waitlist' : ''}
                </em></span>
              <span className="apay" title={comp.incompatibility ? INCOMPATIBILITY[comp.incompatibility] : 'accepted by Momence'}>
                <span className={cx('chip', b.cancelledAt ? 'bad' : b.waitlist ? '' : comp.usable ? 'ok' : 'warn')}>
                  {b.cancelledAt ? 'cancelled' : b.waitlist ? 'waitlist' : comp.usable ? 'pays with pack' : 'not compatible'}
                </span>
                <em>{[b.paidWith, comp.incompatibility && (INCOMPATIBILITY[comp.incompatibility] || comp.incompatibility)].filter(Boolean).join(' — ') || 'no payment record on the booking'}</em>
              </span>
              {readOnly
                ? <span className="astat"><b>{e.status || '—'}</b>{(e.tags || []).map(t => <span className="chip" key={t}>{t}</span>)}</span>
                : <span className="astat"><select value={e.status || ''} onChange={ev => setRow(id, { status: ev.target.value })}>
                  <option value="">status…</option>{ATT_STATUS.map(o => <option key={o}>{o}</option>)}</select></span>}
              <button type="button" className="aexpand" onClick={() => setExpanded(openRow ? null : id)}
                title="Tags, note and what was offered"><I s={svg.chev} />{(e.note || (e.tags || []).length || (e.actions || []).length) && <i className="dot" />}</button>
            </div>
            {openRow && <div className="arow-extra">
              {!readOnly && <div className="atags">
                <span className="mut xs">tags</span>
                {ATT_TAGS.map(t => <button type="button" key={t} className={cx('opt xs', (e.tags || []).includes(t) && 'on')}
                  onClick={() => setRow(id, { tags: (e.tags || []).includes(t) ? (e.tags || []).filter(x => x !== t) : [...(e.tags || []), t] })}>{t}</button>)}
              </div>}
              {!readOnly && <div className="atags">
                <span className="mut xs">offered</span>
                {ATT_ACTION.map(t => <button type="button" key={t} className={cx('opt xs', (e.actions || []).includes(t) && 'on')}
                  onClick={() => setRow(id, { actions: (e.actions || []).includes(t) ? (e.actions || []).filter(x => x !== t) : [...(e.actions || []), t] })}>{t}</button>)}
              </div>}
              <textarea rows={2} readOnly={readOnly} placeholder={`What ${firstName(b).split(' ')[0]} said, what the desk promised…`}
                value={e.note || ''} onChange={ev => setRow(id, { note: ev.target.value })} />
              {!isGuest && !readOnly && <div className="actions">
                <button type="button" className="btn sm ghost" onClick={() => setRow(id, { status: 'Attended', actions: [...new Set([...(e.actions || []), 'Manual check-in in Momence'])] })}>
                  <I s={svg.check}/> checked in — stamp it</button>
                <button type="button" className="btn sm ghost" onClick={() => setRow(id, { status: 'No-show', actions: [...new Set([...(e.actions || []), 'Class credit granted'])] })}>
                  <I s={svg.ghost}/> no-show → grant a credit</button>
                {onOpenMember && <button type="button" className="btn sm ghost" onClick={() => onOpenMember(b)}><I s={svg.expand}/> open member record</button>}
              </div>}
            </div>}
          </div>;
        })}
      </div>
    </div>
  );
}

import CONSTANTS from './constants.json';

export const studios = CONSTANTS.studios;

export const MODULE_META = {
  member: { module: 'members', title: 'Find the member', icon: 'user', search: 'Search by name, email, phone or Momence ID…' },
  session: { module: 'sessions', title: 'Find the class', icon: 'calendar', search: 'Search a class by name, trainer or studio…' },
  ticket: { module: 'tickets', title: 'Link another ticket', icon: 'link', search: 'Search by ticket number, title, member or studio…' },
  trainer: { module: 'trainers', title: 'Pick a trainer', icon: 'whistle', search: 'Search trainers…' },
  membership: { module: 'memberships', title: 'Pick a membership', icon: 'card', search: 'Search packages…' },
  studio: { module: 'studios', title: 'Pick a studio', icon: 'pin', search: 'Search studios…' },
};

const label = o => o.label || o.name;
const sub = o => o.sublabel || o.subtitle || '';
const asOption = r => ({ id: r.id, label: r.name, sublabel: r.subtitle, meta: r.raw });

/* ---------------------------------------------------------------- scoring */
/** Rank so an exact Momence ID or ticket number jumps to the top, then name prefixes,
    then anything the free text touches. Same intent as the reference's substring filter,
    but ordered, because a desk typing "481102" must see one row. */
export function scoreList(items, q, getLabel, getSub, getId) {
  const s = String(q || '').trim().toLowerCase();
  if (!s) return items.map(it => ({ it, score: 0 }));
  const toks = s.split(/\s+/);
  const out = [];
  for (const it of items) {
    const name = String(getLabel(it) || '').toLowerCase();
    const sid = String(getId(it) || '').toLowerCase();
    const sublabel = String(getSub(it) || '').toLowerCase();
    const blob = JSON.stringify(it).toLowerCase();
    let score = -1;
    if (sid === s || name === s) score = 100;
    else if (name.startsWith(s)) score = 70;
    else if (sid.startsWith(s.replace(/[^0-9]/g, '')) && /[0-9]/.test(s)) score = 66;
    else if (name.includes(s)) score = 50;
    else if (sublabel.includes(s)) score = 34;
    else if (toks.every(tk => blob.includes(tk))) score = 16;
    if (score >= 0) out.push({ it, score: score + (name.split(' ')[0] === s ? 6 : 0) });
  }
  return out.sort((a, b) => b.score - a.score || a.it.label?.localeCompare(b.it.label));
}

/* ---------------------------------------------------------------- control */
/** Field values stay plain strings so every existing consumer — validation, handover text,
    the ticket payload, exports — keeps working unchanged. "Priya Mehta [#481102]" is the whole
    record reference; `decodeLookup` puts it back into an object for the chip and the modal. */
/* The id sits immediately before the closing bracket so `decodeLookup` can always find it,
   whether or not there is a sublabel to show. */
export const encodeLookup = o => `${o.id && o.id !== o.label ? `${o.label} [#${o.id}]` : o.label}${o.sublabel ? ` · ${o.sublabel}` : ''}`;
/** A multi-select field keeps working as plain text: references joined by " | ". Readable in a
    handover, and `decodeLookup` puts it back into records for the chips. */
export const encodeLookups = arr => (arr || []).map(o => typeof o === 'string' ? o : encodeLookup(o)).filter(Boolean).join(' | ');
export const decodeLookups = v => {
  if (Array.isArray(v)) return v.map(decodeLookup).filter(Boolean);
  const t = String(v || '').trim(); if (!t) return [];
  return t.split(/\s*\|\s*/).map(part => decodeLookup(part)).filter(Boolean);
};
export const decodeLookup = v => {
  if (v && typeof v === 'object') return Array.isArray(v) ? v.map(decodeLookup).filter(Boolean) : v;
  const m = /^(.+?) ?\[#([^\]]+)\](?: · (.*))?$/.exec(String(v || ''));
  if (!m) return String(v || '').trim() ? { id: String(v).trim(), label: String(v).trim() } : null;
  return { id: m[2], label: m[1].trim(), sublabel: m[3] || '' };
};
export const hasLookup = v => decodeLookups(v).length > 0;

export function LookupControl({ module, value, onChange, multi, placeholder, studio, sessionTypes, upcoming,
  emptyHint, onOpenRecord, hint, tickets, label: lab, className }) {
  const meta = MODULE_META[module] || MODULE_META.member;
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(0);
  const [modal, setModal] = useState(false);
  const box = useRef(null);
  const sel = decodeLookups(value);

  useEffect(() => { const t = setTimeout(() => setDebounced(q), 120); return () => clearTimeout(t); }, [q]);
  useEffect(() => {
    const onDoc = e => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const pool = useMemo(() => {
    if (module === 'ticket') {
      const rows = (tickets || []).map(t => ({ id: t.number, name: `${t.number} · ${t.title}`,
        subtitle: `${t.subCategory} · ${t.studio}`, raw: t }));
      return scoreList(rows, debounced, i => i.name, i => i.subtitle, i => i.id).map(x => x.it).slice(0, 40);
    }
    const r = listMomence(meta.module, { query: debounced, pageSize: 60, studio, sessionTypes, upcoming });
    return scoreList(r.items, debounced, i => i.name, i => i.subtitle, i => i.id).map(x => x.it).slice(0, 40);
  }, [meta.module, debounced, studio, module, sessionTypes?.join(','), upcoming, tickets?.length]);

  const checked = id => sel.some(v => String(v.id) === String(id));
  const emit = opts => onChange(multi ? encodeLookups(opts) : (opts.length ? encodeLookup(opts[0]) : ''));
  const toggle = r => {
    const opt = asOption(r);
    if (!multi) { emit([opt]); setOpen(false); setQ(''); return; }
    emit(checked(opt.id) ? sel.filter(v => String(v.id) !== String(opt.id)).map(v => ({ label: v.label, id: v.id, sublabel: v.sublabel }))
      : [...sel.map(v => ({ label: v.label, id: v.id, sublabel: v.sublabel })), opt]);
  };
  const remove = id => emit(sel.filter(v => String(v.id) !== String(id)).map(v => ({ label: v.label, id: v.id, sublabel: v.sublabel })));

  const keys = e => {
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter')) { setOpen(true); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setCursor(c => Math.min(pool.length - 1, c + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setCursor(c => Math.max(0, c - 1)); }
    else if (e.key === 'Enter' && pool[cursor]) { e.preventDefault(); toggle(pool[cursor]); }
    else if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); }
  };

  return (
    <div className={cx('lk', open && 'lk--open', sel.length && 'lk--filled', className)} ref={box}>
      {!!sel.length && (
        <div className="lk-chips">
          {sel.map(v => (
            <span className="lk-chip" key={v.id} title={lab || meta.title}>
              {module === 'member' && <Avatar name={v.label} size={20} i={0} />}
              {module === 'ticket' && <span className="lk-chip-num mono">{v.id}</span>}
              <b>{v.label}</b>
              {v.sublabel && <em>{v.sublabel}</em>}
              <span className="lk-chip-id mono">#{v.id}</span>
              {onOpenRecord && module !== 'ticket' &&
                <button type="button" title="Open the record" onClick={() => onOpenRecord(v)}><I s={svg.expand} /></button>}
              <button type="button" aria-label={'Remove ' + v.label} onClick={() => remove(v.id)}><I s={svg.x} /></button>
            </span>
          ))}
        </div>
      )}
      <div className="lk-bar">
        <I s={svg.search} />
        <input value={q} aria-label={meta.title} placeholder={sel.length && !multi ? 'Change selection…' : (placeholder || meta.search)}
          onChange={e => { setQ(e.target.value); setOpen(true); setCursor(0); }}
          onFocus={() => setOpen(true)} onKeyDown={keys} />
        <button type="button" className="lk-search" onClick={() => setModal(true)}>
          <I s={svg.grid} /> {meta.title}
        </button>
      </div>
      {open && (
        <div className="lk-pop">
          {!pool.length && <div className="lk-empty">{emptyHint || 'No match — keep typing, or open the full search.'}</div>}
          {pool.map((r, i) => (
            <button type="button" key={r.id} className={cx('lk-row', i === cursor && 'cur', checked(r.id) && 'on')}
              onMouseEnter={() => setCursor(i)} onClick={() => toggle(r)}>
              {module === 'member'
                ? <Avatar name={r.name} size={26} i={i % 4} />
                : <span className="lk-mark"><I s={svg[meta.icon] || svg.layers} /></span>}
              <span className="lk-txt"><b>{r.name}</b>{r.subtitle && <em>{r.subtitle}</em>}</span>
              <span className="lk-id mono">#{r.id}</span>
              {multi && <span className="lk-tick">{checked(r.id) && <I s={svg.check} />}</span>}
            </button>
          ))}
          <div className="lk-foot">
            <span className="lk-src"><i />{module === 'ticket' ? `${(tickets || []).length} tickets on the board` : 'demo data · connect Momence for live records'}</span>
            <span>{pool.length} shown · ↑↓ to move, Enter to pick</span>
          </div>
        </div>
      )}
      {hint && <div className="hint">{hint}</div>}
      {modal && (
        <LookupModal module={module} multi={!!multi} studio={studio} tickets={tickets} onClose={() => setModal(false)}
          onPick={opts => { emit(opts); setModal(false); }} onOpenRecord={onOpenRecord} />
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- picker modal */
export function LookupModal({ module, multi, studio, onClose, onPick, onOpenRecord, tickets, scope }) {
  const meta = MODULE_META[module];
  const [q, setQ] = useState('');
  const [when, setWhen] = useState(scope?.when || 'any');
  const [picked, setPicked] = useState([]);
  const [rec, setRec] = useState(null);
  const isTicket = module === 'ticket';

  const rows = useMemo(() => {
    if (isTicket) {
      const list = (tickets || []).map(t => ({
        id: t.number, label: `${t.number} · ${t.title}`, subtitle: `${t.subCategory} · ${t.studio} · ${shortName(t.assignee)}`,
        raw: t, number: t.number,
      }));
      /* live first, then archive, so the desk finds a live clock before a closed one */
      const rank = x => (['resolved', 'closed'].includes(x.raw.status) ? 1 : 0);
      return scoreList(list, q, r => r.label, r => r.subtitle, r => r.id).map(x => x.it)
        .sort((a, b) => rank(a) - rank(b));
    }
    const win = WHEN_WINDOW[when];
    const r = listMomence(meta.module, { query: q, pageSize: 160, studio,
      ...(meta.module === 'sessions' ? { includeCancelled: true, sortBy: 'startsAt', sortOrder: when === 'past' ? 'DESC' : 'ASC',
        ...(win ? { startAfter: win.after, startBefore: win.before } : {}) } : {}) });
    let rows = scoreList(r.items, q, i => i.name, i => i.subtitle, i => i.id).slice(0, 160).map(x => ({ ...asOption(x.it), raw: x.it.raw }));
    if (meta.module === 'sessions' && when === 'next') { const n = Date.now(); rows = rows.filter(x => new Date(x.raw.startsAt).getTime() > n).slice(0, 40); }
    return rows;
  }, [isTicket, meta.module, q, studio, tickets, when]);

  const toggle = r => setPicked(p => p.some(x => String(x.id) === String(r.id))
    ? p.filter(x => String(x.id) !== String(r.id)) : [...p, { id: r.id, label: r.label || r.name, sublabel: r.sublabel || r.subtitle, meta: r.raw }]);

  return (
    <Modal size="wide" onClose={onClose} title={meta.title}
      description={isTicket ? 'Search the board — link an open ticket instead of retyping its number.'
        : `Studio directory · ${listMomence(meta.module, { pageSize: 1 }).total} records loaded locally`}
      footer={<div className="modal-foot">
        <span className="mut xs">{DEMO_SOURCE === 'demo' ? readOnlyNotice : ''}</span>
        <div className="row-gap">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn pri" disabled={!picked.length} onClick={() => onPick(multi ? picked : picked.slice(0, 1))}>
            <I s={svg.check} /> {multi ? `Attach ${picked.length}` : 'Use this'}
          </button>
        </div>
      </div>}>
      <div className="picker-q"><Search value={q} onChange={setQ} placeholder={meta.search} autoFocus /></div>
      {meta.module === 'sessions' && <div className="scopebar">
        <span className="mut xs">window</span>
        {Object.keys(WHEN_WINDOW).map(w => <button key={w} type="button" className={cx('seg xs', when === w && 'on')} onClick={() => setWhen(w)}>{w}</button>)}
        <span className="mut xs mono">startAfter / startBefore · locationId {studio ? `(${listMomence('sessions', { studio, pageSize: 1 }).total} rows at this studio)` : '(unfiltered)'}</span>
      </div>}
      <div className="picker-list">
        {!rows.length && <div className="lk-empty">Nothing matches “{q}”.</div>}
        {rows.map((r, i) => (
          <div key={r.id} className={cx('picker-row', picked.some(p => String(p.id) === String(r.id)) && 'on')}>
            <button className="picker-main" onClick={() => (multi ? toggle(r) : onPick([{ id: r.id, label: r.label || r.name, sublabel: r.sublabel || r.subtitle, meta: r.raw }]))}>
              {module === 'member' ? <Avatar name={r.label || r.name} size={30} i={i % 4} />
                : isTicket ? <span className="picker-num mono">{r.id}</span>
                  : <span className="lk-mark"><I s={svg[meta.icon] || svg.layers} /></span>}
              <span className="lk-txt">
                <b>{r.label || r.name}</b>
                <em>{r.subtitle || r.sublabel || ''}</em>
              </span>
              {isTicket && <span className="picker-tags">
                <Pill p={r.raw.priority} /><StatusPill s={r.raw.status} />
                <span className="chip mono">{fmtAt(r.raw.createdAt)}</span>
                {(r.raw.recurrenceCount > 1) && <span className="chip warn">report #{r.raw.recurrenceCount}</span>}
              </span>}
            </button>
            {!isTicket && (
              <button className="iconbtn" title="Open record" onClick={() => setRec({ module: meta.module, id: r.id, raw: r.raw })}><I s={svg.expand} /></button>
            )}
            {multi && <button className={cx('picker-check', picked.some(p => String(p.id) === String(r.id)) && 'on')}
              onClick={() => toggle(r)}><I s={svg.check} /></button>}
          </div>
        ))}
      </div>
      {rec && <RecordModal module={rec.module} id={rec.id} record={rec.raw} onClose={() => setRec(null)} />}
    </Modal>
  );
}

const shortName = w => String(w || '').replace(/\s*\(.*?\)\s*/g, '');
const isoDayOffset = n => new Date(Date.now() + n * 864e5).toISOString();
const WHEN_WINDOW = { today: { after: isoDayOffset(0).slice(0, 11) + '00:00:00.000Z', before: isoDayOffset(0).slice(0, 11) + '23:59:59.999Z' },
  week: { after: isoDayOffset(-7), before: isoDayOffset(7) }, past: { before: isoDayOffset(0) },
  next: { after: isoDayOffset(0) }, any: null };

/* ---------------------------------------------------------------- record modal */
/** Mirrors the reference EntityDialog: overview, related records, raw payload. */
export function RecordModal({ module: moduleIn, id, record, ticket, onClose }) {
  const [tab, setTab] = useState('overview');
  /* accept either the short name (form field module) or the API one */
  const module = moduleIn === 'member' ? 'members' : moduleIn === 'session' ? 'sessions' : moduleIn;
  /* resolved synchronously — the dataset is local, so there is no loading state to wait
     for, and the panel is complete on first paint instead of flashing empty */
  const [detail, setDetail] = useState(() => detailMomence(module, String(id)));
  useEffect(() => { setDetail(detailMomence(module, String(id))); }, [module, id]);
  const d = detail || (record ? { item: normalise(module, record), related: {}, source: DEMO_SOURCE, errors: [] } : null);
  /* a board ticket is our own record, not Momence’s — show it in the same shell */
  if (ticket) {
    const pairs = Object.entries(ticket.data).filter(([, v]) => v !== '' && v !== null && v !== undefined);
    return (
      <Modal onClose={onClose} size="wide" title={ticket.title || ticket.number} tag={ticket.number}
        description={`${ticket.category} · ${ticket.subCategory}`}
        footer={<div className="modal-foot"><span className="mut xs">{ticket.chain.map(c => c.who.split(' (')[0]).join(' → ')}</span>
          <button className="btn" onClick={onClose}>Close (Esc)</button></div>}>
        <div className="tabs">{['overview', 'answers', 'raw'].map(x => <button key={x} className={cx('seg', tab === x && 'on')} onClick={() => setTab(x)}>
          {x === 'raw' ? 'Raw record' : x[0].toUpperCase() + x.slice(1)}</button>)}</div>
        {tab !== 'overview' && <p className="mut xs">{ticket.summary}</p>}
        {tab === 'overview' && <div className="fieldgrid">
          <div className="fg"><span className="fk">Status</span><span className="fv"><StatusPill s={ticket.status} /></span></div>
          <div className="fg"><span className="fk">Priority</span><span className="fv"><Pill p={ticket.priority} /></span></div>
          <div className="fg"><span className="fk">Studio</span><span className="fv">{ticket.studio}</span></div>
          <div className="fg"><span className="fk">Area</span><span className="fv">{ticket.area || '—'}</span></div>
          <div className="fg"><span className="fk">Raised</span><span className="fv mono">{fmtAt(ticket.createdAt)}</span></div>
          <div className="fg"><span className="fk">SLA tier</span><span className="fv mono">{ticket.slaLabel}</span></div>
          <div className="fg"><span className="fk">Reports</span><span className="fv mono">×{ticket.recurrenceCount || 1}</span></div>
          <div className="fg"><span className="fk">Owner</span><span className="fv">{ticket.chain[ticket.escalation]?.who || ticket.chain[0].who}</span></div>
          <div className="fg"><span className="fk">Timeline</span><span className="fv">{(ticket.timeline || []).length} events</span></div>
          {(ticket.resolution?.cause || ticket.resolution?.action) && <div className="fg" style={{ gridColumn: '1 / -1' }}>
            <span className="fk">Resolution</span><span className="fv">{[ticket.resolution.cause, ticket.resolution.action].filter(Boolean).join(' — ')}</span></div>}
        </div>}
        {tab === 'answers' && <div className="fieldgrid">{pairs.map(([k, v]) => (
          <div className="fg" key={k}><span className="fk">{k.replace(/_/g, ' ')}</span>
            <span className="fv">{Array.isArray(v) ? v.join(' · ') : String(v)}</span></div>))}</div>}
        {tab === 'raw' && <DataTree data={{ ...ticket, data: ticket.data }} />}
      </Modal>
    );
  }
  if (!detail) return <Modal onClose={onClose} title="Loading record…" size="wide">{" "}</Modal>;
  if (d.error) return <Modal onClose={onClose} title="Record unavailable" size="wide"><p className="mut">{d.error}</p></Modal>;
  const r = obj(d.item.raw);
  const isMember = module === 'members', isSession = module === 'sessions';
  const brief = memberBrief(r);
  const related = d.related || {};
  const tabs = ['overview', ...(isMember ? ['memberships', 'bookings', 'notes'] : isSession ? ['sign-ups', 'cancellations', 'check-ins'] : []), 'raw'];
  const bookings = related.bookings || [];
  const cancelled = bookings.filter(b => b.cancelledAt), checkedIn = bookings.filter(b => b.checkedIn && !b.cancelledAt);
  const rowsFor = t => t === 'cancellations' ? cancelled : t === 'check-ins' ? checkedIn
    : t === 'sign-ups' ? bookings.filter(b => !b.cancelledAt) : bookings;

  return (
    <Modal onClose={onClose} size="wide"
      title={d.item.name || 'Record'}
      description={`Demo record · ${module} · ID ${id}`}
      footer={<div className="modal-foot"><span className="mut xs">{readOnlyNotice}</span>
        <button className="btn" onClick={onClose}>Close</button></div>}>
      <div className="segbar">
        {tabs.map(t => <button key={t} className={cx('seg', tab === t && 'on')} onClick={() => setTab(t)}>
          {TAB_LABEL[t] || niceKey(t)}{t === 'sign-ups' && <b>{rowsFor(t).length}</b>}
          {t === 'cancellations' && !!cancelled.length && <b className="warn">{cancelled.length}</b>}
          {t === 'check-ins' && <b>{checkedIn.length}</b>}
        </button>)}
      </div>
      {tab === 'overview' && isMember && (
        <div className="rec">
          <div className="rec-hero">
            <Avatar name={d.item.name} size={46} i={1} />
            <div><h3>{d.item.name}</h3><p className="mut">{String(r.email || '—')}</p></div>
            <span className="chip mono">{obj(r.visits).totalVisits ?? '—'} visits</span>
            <span className="chip mono">{obj(r.visits).bookings ?? '—'} bookings</span>
          </div>
          <div className="rec-grid">
            {[['Phone', r.phoneNumber], ['Home studio', r.homeLocation],
              ['First seen', r.firstSeen && fmtAt(new Date(r.firstSeen).getTime())], ['Last seen', r.lastSeen && fmtAt(new Date(r.lastSeen).getTime())],
              ['Member ID', r.id], ['Attendance', brief.attendancePct != null ? `${brief.attendancePct}% of ${brief.bookings} bookings` : null]]
              .map(([k, v]) => <div key={k}><span>{k}</span><b>{v ?? '—'}</b></div>)}
          </div>
          <div className="rec-tags">{(r.customerTags || []).map(t =>
            <span className="chip" key={t.id} style={t.isCustomerBadge ? { borderColor: t.badgeColor, color: t.badgeColor } : undefined}>{t.name}</span>)}
            <span className="chip mono">{obj(r.visits).total ?? 0} bookings + appts</span>
            <span className="chip mono">{obj(r.visits).totalVisits ?? 0} visits</span></div>
          {(r.customerFields || []).filter(f => String(f.value || '').trim()).length > 0 && <div className="rec-fields">
            <h5>Host fields <span className="mut xs">(customerFields on the member record)</span></h5>
            {(r.customerFields || []).map(f => <div className="rec-field" key={f.id}>
              <span>{f.label}</span><b>{Array.isArray(f.value) ? f.value.join(', ') : String(f.value)}</b></div>)}
          </div>}
        </div>
      )}
      {tab === 'overview' && isSession && (
        <div className="rec">
          <div className="rec-hero"><span className="lk-mark lg"><I s={svg.calendar} /></span>
            <div><h3>{d.item.name}</h3><p className="mut">{String(r.description || '')}</p></div>
            <span className={cx('chip', r.isCancelled ? 'bad' : 'ok')}>{r.isCancelled ? 'Cancelled' : 'Scheduled'}</span></div>
          <div className="rec-grid">
            {[['Instructor', [obj(r.teacher).firstName, obj(r.teacher).lastName].filter(Boolean).join(' ')],
              ['Studio', obj(r.inPersonLocation).name], ['Starts', r.startsAt && fmtAt(new Date(r.startsAt).getTime())],
              ['Duration', `${r.durationInMinutes ?? '—'} min`], ['Bookings / capacity', `${r.bookingCount ?? 0} / ${r.capacity ?? '—'}`],
              ['Waitlist', `${r.waitlistBookingCount ?? 0} of ${r.waitlistCapacity ?? 0}`],
              ['Tags', (r.tags || []).map(t => t.name).join(', ')],
              ['Format', r.type], ['Session ID', r.id]].map(([k, v]) => <div key={k}><span>{k}</span><b>{v ?? '—'}</b></div>)}
          {(() => { const st = detailMomence('sessions', String(id)).related.stats || {}; return (
            <div className="rec-stats">
              {[['attended', st.attended], ['absent', st.absent == null ? (st.started ? 0 : '—') : st.absent], ['cancelled', st.cancelled],
                ['guests', st.guests], ['first-timers', st.firstTimers], ['over book', st.overbook],
                ['not compatible', st.incompatible], ['fill', st.fillPct != null ? st.fillPct + '%' : null]].map(([k, v]) =>
                <span key={k} className={cx('chip', /not compatible|over book|absent/.test(k) && v > 0 ? 'warn' : '')}>{v ?? '—'} <em>{k}</em></span>)}
            </div>); })()}
          </div>
        </div>
      )}
      {tab === 'overview' && !isMember && !isSession && <DataTree data={r} />}
      {tab === 'memberships' && <div className="rec-cards">
        {(related.memberships || []).map(raw => { const m = membershipBrief(raw); return (
          <div className="card rec-card" key={m.id}>
            <div className="between"><b>{m.plan}</b>
              <span className={cx('chip', m.frozen ? 'warn' : m.declinedRenewal ? 'bad' : 'ok')}>{m.frozen ? 'Frozen' : m.declinedRenewal ? 'Renewal declined' : 'Active'}</span></div>
            <div className="rec-grid sm">
              {[['Type', m.type], ['Class credits', m.creditsTotal != null ? `${m.creditsLeft ?? 0} of ${m.creditsTotal} left` : 'unlimited'],
                ['Money credits', m.moneyLeft != null ? `₹${m.moneyLeft.toLocaleString('en-IN')} left` : null],
                ['Starts', raw.startDate && fmtAt(new Date(raw.startDate).getTime())],
                ['Expires', m.expiresAt ? fmtAt(new Date(m.expiresAt).getTime()) : null],
                ['Usage limit', m.usageLimit != null ? `${m.usedThisCycle ?? 0} / ${m.usageLimit} sessions this cycle` : null],
                ['Price', m.priceINR ? `₹${m.priceINR.toLocaleString('en-IN')}${raw.membership?.priceIncludesTax ? ' incl. tax' : ''}` : null],
                ['Scheduled unfreeze', m.scheduledUnfreezeAt ? fmtAt(new Date(m.scheduledUnfreezeAt).getTime()) : null]]
                .filter(([, v]) => v != null && v !== '').map(([k, v]) => <div key={k}><span>{k}</span><b>{v}</b></div>)}
            </div>
            <p className="hint mono xs">PUT …/bought-memberships/{m.id}/credits · {'{eventCreditsLeft, moneyCreditsLeft}'} · freeze → {FREEZE_HINT}</p>
          </div>); })}
        {!(related.memberships || []).length && <p className="mut">No active memberships on this record.</p>}
      </div>}
      {tab === 'notes' && <div className="rec-cards">
        {(related.notes || []).map(n => <div className="card rec-card" key={n.id}>
          <div className="between"><span className="chip">{n.type}</span><small className="mut mono">{fmtAt(new Date(n.createdAt).getTime())}</small></div>
          <p>{n.note}</p></div>)}
        <p className="hint">Momence publishes member notes read-only; care-team notes belong on the ticket.</p>
      </div>}
      {['bookings', 'sign-ups', 'cancellations', 'check-ins'].includes(tab) && <div className="rec-cards">
        {rowsFor(tab).map(b => {
          const linked = isSession ? obj(b.member) : obj(b.session);
          const name = isSession ? [linked.firstName, linked.lastName].filter(Boolean).join(' ') : obj(linked.inPersonLocation).name || linked.name;
          return <div className="card rec-card row" key={b.id}>
            <div><b>{name || 'Booking ' + b.id}</b><p className="mut xs mono">#{b.id} · {fmtAt(new Date(b.cancelledAt || b.createdAt).getTime())}</p></div>
            <span className={cx('chip', b.cancelledAt ? 'bad' : b.checkedIn ? 'ok' : '')}>{b.cancelledAt ? 'Cancelled' : b.checkedIn ? 'Checked in' : 'Booked'}</span>
          </div>;
        })}
        {!rowsFor(tab).length && <p className="mut">No entries on this page.</p>}
      </div>}
      {tab === 'raw' && <DataTree data={r} />}
    </Modal>
  );
}

const TAB_LABEL = { overview: 'Overview', memberships: 'Memberships', bookings: 'Bookings', notes: 'Notes',
  'sign-ups': 'Sign-ups', cancellations: 'Cancellations', 'check-ins': 'Check-ins', raw: 'Raw payload' };

/* ---------------------------------------------------------------- raw payload */
export function DataTree({ data, depth = 0 }) {
  if (depth > 4) return <span className="mono xs">{JSON.stringify(data)}</span>;
  if (Array.isArray(data)) return data.length
    ? <div className="dt-list">{data.map((v, i) => <div className="dt-nest" key={i}><DataTree data={v} depth={depth + 1} /></div>)}</div>
    : <span className="mut">No entries</span>;
  if (data !== null && typeof data === 'object') {
    const entries = Object.entries(data).filter(([k]) => !/password|token|secret/i.test(k));
    return <div className={cx('dt', depth === 0 && 'dt--root')}>{entries.map(([k, v]) => (
      <div className="dt-item" key={k}><span>{niceKey(k)}</span>
        {v !== null && typeof v === 'object'
          ? <details open={depth === 0}><summary>{Array.isArray(v) ? `${v.length} entries` : 'details'}</summary><DataTree data={v} depth={depth + 1} /></details>
          : <b>{String(/At$|Date$|Seen$/.test(k) && v ? fmtAt(new Date(v).getTime()) : v)}</b>}
      </div>))}</div>;
  }
  return <span>{String(data)}</span>;
}

const niceKey = s => String(s).replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').replace(/^./, c => c.toUpperCase());
