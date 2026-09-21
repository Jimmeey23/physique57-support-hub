import svg, { I } from './icons.jsx';
import React from 'react';

export const cx = (...a) => a.filter(Boolean).join(' ');

/* ------------------------------ SLA countdown ------------------------------ */
/* `mode` picks which of the two clocks to show: 'fr' (the default, the one a desk acts on),
   'res' (the resolution promise) or 'auto' (resolution once the ticket is closed). */
export function Countdown({ t, now, compact, mode = 'fr' }) {
  const closed = t.status === 'resolved' || t.status === 'closed';
  const hrs = (t.hours) || { first: 8, res: 48 };
  const created = t.createdAt ?? now;
  const frDue = t.frDueAt ?? (created + hrs.first * 36e5);
  const resDue = t.resDueAt ?? (created + hrs.res * 36e5);
  const which = mode === 'res' ? 'res' : mode === 'auto' ? (closed ? 'res' : 'fr') : 'fr';
  const due = which === 'res' ? resDue : (closed ? resDue : frDue);
  const left = due - now;
  const met = which === 'res'
    ? (closed ? (t.resolvedAt || now) <= resDue : left > 0)
    : (closed ? (t.firstResponseAt || t.resolvedAt || 0) <= frDue : left > 0);
  /* “at risk” is proportional to the window: an hour of an 8 h SLA is already tight,
     but an hour of a 48 h SLA is not. Floor of ten minutes keeps sub-hour tiers honest. */
  const warnAt = Math.max(10 * 6e4, (due - created) * 0.15);
  const state = closed ? (met ? 'met' : 'breach') : left <= 0 ? 'breach' : left < warnAt ? 'risk' : 'ok';
  /* “met” is a claim about a finished SLA — never show it while the clock is still running. */
  const cls = closed ? (state === 'breach' ? 'breach' : 'met') : state;
  const span = Math.max(1, due - created);
  const pct = Math.max(0, Math.min(1, 1 - (due - now) / span));
  return (
    <div className={cx('c-sla', which === 'res' && 'res')}>
      <div className={cx('t', cls, state === 'breach' && !closed && 'blink')}>
        {closed
          ? <>{met ? <I s={svg.check}/> : <I s={svg.warn}/>} {which === 'res' ? (met ? 'closed in SLA' : 'resolution breached') : (met ? 'SLA met' : 'was breached')}</>
          : left <= 0 ? <><I s={svg.bolt}/> breach {fmt(left)}</> : <><I s={svg.clock}/> {fmt(-left)}</>}
      </div>
      {!compact && <div className={cx('slabar', state === 'risk' && 'warn', state === 'breach' && 'bad')}>
        <i style={{ width: (state === 'breach' ? 100 : Math.max(2, pct * 100)) + '%' }} /></div>}
      {!compact && <div className="xs mut mono" style={{ marginTop: 3 }}>
        {which === 'res'
          ? (closed ? `resolved in ${t.resolvedAt ? dur(t.resolvedAt - t.createdAt) : '—'} · due ${at(resDue)}` : `resolution due ${at(resDue)}`)
          : closed ? 'resolution ' + (t.resolvedAt ? `in ${dur(t.resolvedAt - t.createdAt)}` : '—')
            : `FR due ${at(frDue)} · res ${at(resDue)}`}
      </div>}
    </div>
  );
}
/* Units are always explicit: “10:00” next to a breach would read as ten hours, not ten minutes. */
const fmt = ms => { const a = Math.abs(ms); const d = Math.floor(a / 864e5), h = Math.floor(a % 864e5 / 36e5),
  m = Math.floor(a % 36e5 / 6e4), s = Math.floor(a % 6e4 / 1000);
  if (a < 6e4) return ms < 0 ? 'under a minute late' : 'under a minute';
  if (d > 0) return `${d}d ${String(h).padStart(2, '0')}h`;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`;
  return `${m}m ${String(s).padStart(2, '0')}s`; };
const dur = fmt;
const at = ts => new Date(ts).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
export { fmt as fmtDur, at as fmtTime };
export const fmtAt = ts => new Date(ts).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true });

/* ------------------------------ small pieces ------------------------------ */
export const Pill = ({ p }) => <span className={cx('prio', p)}><i />{p}</span>;
export const StatusPill = ({ s }) => <span className={cx('st', s)}><i />{STATUS[s]}</span>;
export const STATUS = { new: 'New', triaged: 'Triaged', in_progress: 'In progress', waiting_on_member: 'Waiting on member',
  waiting_on_vendor: 'Waiting on vendor', resolved: 'Resolved', closed: 'Closed', awaiting_response: 'Awaiting your reply' };
export const AV_COLORS = ['g1', 'g2', 'g3', 'g4'];
export const Avatar = ({ name, size = 26, i = 0 }) => (
  <div className={cx('av', AV_COLORS[i % 4])} style={{ width: size, height: size, fontSize: size * .37 }}
    title={name}>{String(name || '?').replace(/\(.*?\)/g, '').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase()}</div>
);
export const OwnerCell = ({ t }) => {
  const step = t.chain[Math.min(t.escalation, t.chain.length - 1)] || { who: t.assignee };
  return <div className="c-own"><Avatar name={step.who} i={t.escalation} />
    <div className="nm"><b>{String(step.who).replace(/\s*\(.*?\)\s*/, '')}</b>
      <span>{t.escalation > 0 ? 'escalated · ' : ''}{t.department}</span></div></div>;
};
export const IconBtn = ({ title, onClick, children, className }) => (
  <button className={cx('icobtn', className)} title={title} onClick={onClick} type="button">{children}</button>
);

/* ------------------------------ modal ------------------------------ */
export function Modal({ title, icon, onClose, children, footer, wide, size, description, tag, tone }) {
  React.useEffect(() => {
    const h = e => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  /* Esc must not reach the global handler behind us and bounce the desk out of intake. */
  /* Two shapes, honestly named: a panel that docks on the right for the things a desk configures, and
     the centred sheet for everything it decides on. The scrim has to know which one it carries. */
  return <div className={cx('scrim', size === 'drawer' && 'scrim-drawer')} onMouseDown={e => { if (e.target === e.currentTarget) { e.stopPropagation(); onClose?.(); } }}
    onKeyDown={e => e.key === 'Escape' && (e.stopPropagation(), onClose?.())}>
    <div className={cx('modal', size || (wide ? 'wide' : ''), 'enter', tone === 'danger' && 'tone-danger', tone === 'quiet' && 'tone-quiet')} style={size === 'xl' ? { width: 'min(1120px,100%)' } : undefined}
      role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined}>
      <header>{icon}<div className="mh"><h3>{title}</h3>{description && <p>{description}</p>}</div>
        {tag && <span className="chip">{tag}</span>}
        <IconBtn title="Close (Esc)" onClick={onClose}><I s={svg.x}/></IconBtn></header>
      <div className="mbody">{children}</div>
      {footer && <div className="mfoot">{footer}</div>}
    </div></div>;
}

/* Count-up for the stat strip — a number that lands reads as a live board. Falls back to the
   finished value wherever rAF is unavailable (SSR, harnesses) or motion is turned off. */
const reduceOrUnavailable = () => typeof performance === 'undefined' || typeof requestAnimationFrame !== 'function';
export function useCount(target, ms = 620) {
  const [v, setV] = React.useState(0);
  const calm = (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
    || (typeof document !== 'undefined' && document.documentElement?.dataset?.motion === 'calm');
  React.useEffect(() => {
    if (calm || reduceOrUnavailable()) { setV(target); return; }
    let raf, t0 = performance.now();
    const step = t => { const k = Math.min(1, (t - t0) / ms); setV(Math.round(target * (1 - Math.pow(1 - k, 3)))); if (k < 1) raf = requestAnimationFrame(step); };
    raf = requestAnimationFrame(step); return () => cancelAnimationFrame(raf);
  }, [target, ms, calm]);
  return v;
}

/* ------------------------------ tooltips ------------------------------ */
/* Attribute-driven so they work inside scroll containers and modals without a portal: the CSS
   paints [data-tip] on hover/focus. `tabIndex` keeps them reachable from the keyboard. */
export function Tip({ label, children, side = 'b', className, as = 'span', ...rest }) {
  if (!label) return children;
  const Tag = as;
  return <Tag className={cx('tip', className)} data-tip={label} data-side={side} tabIndex={0} {...rest}>{children}</Tag>;
}

/* ------------------------------ switch ------------------------------ */
/* Boolean answers as a real switch. The two radios stay in the tree — they are what a form
   serialises and what the harnesses drive — the switch is the visible affordance for the desk. */
export function Switch({ value, options = ['Yes', 'No'], onChange, name, id, onLabel, offLabel }) {
  const [yes, no] = options;
  const on = value === yes;
  const set = v => onChange(v === value ? '' : v);
  return <div className="sw" id={id}>
    <button type="button" role="switch" aria-checked={on} className={cx('sw-btn', on && 'on')}
      aria-label={value ? `${value}` : 'not answered'} onClick={() => set(on ? no : yes)}>
      <i /></button>
    <span className="sw-lab">
      <b className={cx(!value && 'mut')}>{value ? (on ? (onLabel || yes) : (offLabel || no)) : 'not answered'}</b>
      <span className="sw-opts"><em>{yes}</em><em>{no}</em></span></span>
    <span className="sr">{[yes, no].map(o => <label key={o} className={cx('radio', value === o && 'on')}>
      <input type="radio" name={name || id} value={o} checked={value === o}
        onChange={() => onChange(o)} /><span>{o}</span></label>)}</span>
  </div>;
}

/* ------------------------------ progress ring ------------------------------ */
export function Ring({ done = 0, total = 0, size = 24, tone }) {
  const pct = total ? Math.round(100 * Math.min(1, done / total)) : 100;
  return <span className="ring" style={{ '--p': pct + '%', width: size, height: size, '--tone': tone || '' }}
    aria-hidden="true"><b>{pct === 100 ? '' : pct}</b></span>;
}

/* ------------------------------ toasts ------------------------------ */
export function Toasts({ items, kill }) {
  return <div className="toasts">{items.map(x => (
    <div className="toast" key={x.id} onClick={() => kill(x.id)} role="status">
      {/* icon strings are raw markup — they must go through <I>, or the toast prints the SVG source */}
      <div className="tico" style={{ color: x.tone === 'bad' ? 'var(--breach)' : 'var(--ok)' }}>
        <I s={x.tone === 'bad' ? svg.warn : svg.check} /></div>
      <div style={{ flex: 1 }}><b>{x.title}</b>{x.body}</div>
    </div>))}</div>;
}

/* ------------------------------ search input ------------------------------ */
export function Search({ value, onChange, placeholder, autoFocus, idRef }) {
  return <div className="searchbar"><I s={svg.search}/>
    <input ref={idRef} value={value} placeholder={placeholder} autoFocus={autoFocus}
      onChange={e => onChange(e.target.value)} aria-label="Search" />
    {value && <button className="btn sm ghost" onClick={() => onChange('')} type="button">clear</button>}
  </div>;
}

/* ------------------------------ stat strip ------------------------------ */
export function Stats({ items }) {
  return <div className="stats">{items.map((s, i) => <Stat key={i} s={s} />)}</div>;
}
/* Numbers that land rather than pop: a live board should feel like it is counting. */
function Stat({ s }) {
  const numeric = typeof s.value === 'number';
  const n = useCount(numeric ? s.value : 0);
  return <div className="stat" style={s.acc ? { '--acc': s.acc } : undefined}>
    {s.tag && <small>{s.tag}</small>}<b>{numeric ? n : s.value}</b><span>{s.label}</span>
  </div>;
}
