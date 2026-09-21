/* ───────────────────────────────────────────────────────────────────────────────
   One control for every choice a field can offer.

   The form used to mix three looks — a native select for long lists, a row of radio cards for
   short ones, a strip of chips for multi-picks. On a two-column grid that reads as three
   different heights and three different alignments, which is exactly what makes a form look
   handmade. Every choice now answers through the same 39px control and opens the same popover:
   searchable, keyboard-driven, single or multi, with the same geometry as a text box.

   The native <select> stays mounted (mirrored, inert to the pointer) so the value is a real
   form value, labels keep their `for`, and anything reading the DOM sees the same thing it
   always did.
   ─────────────────────────────────────────────────────────────────────────────── */
import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import svg, { I } from './icons.jsx';
import { cx } from './ui.jsx';

const same = (a, b) => String(a ?? '') === String(b ?? '');

export function Picker({ f, value, onChange, list, multi = false, disabled, placeholder, error, studio }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [cur, setCur] = useState(-1);
  const box = useRef(null);
  const panelId = useId ? useId() : `pk-${f.id}`;
  const opts = list || [];
  const chosen = useMemo(() => (multi ? (Array.isArray(value) ? value : []) : (value ? [value] : [])), [value, multi]);

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return opts.map((o, i) => ({ o, i }));
    return opts.map((o, i) => ({ o, i })).filter(({ o }) => String(o).toLowerCase().includes(t)
      || (f.optionNotes && String(f.optionNotes[o] || '').toLowerCase().includes(t)));
  }, [opts, q, f.optionNotes]);

  useEffect(() => {
    if (!open) return;
    const down = e => {
      if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); return; }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        /* the keys belong to the list while it is open: the workspace shortcut must not see them */
        e.preventDefault(); e.stopPropagation();
        setCur(c => {
          const n = shown.length || 1;
          let k = (c < 0 ? (e.key === 'ArrowDown' ? -1 : 0) : c) + (e.key === 'ArrowDown' ? 1 : -1);
          k = ((k % n) + n) % n;
          requestAnimationFrame(() => {
          const row = box.current?.querySelector(`[data-pk="${k}"]`);
          row?.scrollIntoView && row.scrollIntoView({ block: 'nearest' });
        });
          return k;
        });
        return;
      }
      if (e.key === 'Home' || e.key === 'End') {
        e.preventDefault(); e.stopPropagation();
        setCur(e.key === 'Home' ? 0 : Math.max(0, shown.length - 1));
        return;
      }
      if (e.key === 'Enter' || e.key === ' ') {
        e.stopPropagation();
        if (cur >= 0 && shown[cur]) { e.preventDefault(); pick(shown[cur].o); }
      }
    };
    const el = box.current;
    const away = e => { if (el && !el.contains(e.target)) setOpen(false); };
    el?.addEventListener('keydown', down);
    document.addEventListener('mousedown', away);
    return () => { el?.removeEventListener('keydown', down); document.removeEventListener('mousedown', away); };
  }, [open, cur, shown]);                                     // eslint-disable-line react-hooks/exhaustive-deps

  function pick(o) {
    if (disabled) return;
    if (!multi) { onChange(same(value, o) ? '' : o); setOpen(false); setQ(''); return; }
    const arr = Array.isArray(value) ? value : [];
    onChange(arr.includes(o) ? arr.filter(x => x !== o) : [...arr, o]);
  }
  const setAll = () => !disabled && onChange([...opts]);
  const clear = () => !disabled && onChange(multi ? [] : '');
  const label = multi ? (chosen.length ? `${chosen.length} selected` : (placeholder || 'Select…'))
    : (chosen[0] || placeholder || 'Select…');
  const searchable = opts.length > 8;
  const note = f.optionNotes && chosen[0] ? f.optionNotes[chosen[0]] : '';

  /* open downwards unless the field sits near the bottom of the window — a popover you have to
     scroll to reach is worse than one that grows up into the space you are already looking at */
  const [up, setUp] = useState(false);
  useEffect(() => {
    if (!open) { setUp(false); return; }
    const el = box.current;
    if (!el || typeof window === 'undefined' || typeof el.getBoundingClientRect !== 'function') return;
    const r = el.getBoundingClientRect();
    const want = Math.min(340, 96 + opts.length * 34);
    const below = window.innerHeight - r.bottom;
    setUp(below < want && r.top > below + 24);
  }, [open, opts.length]);

  return <div className={cx('pk', open && 'open', up && 'pk-up', multi && 'multi', disabled && 'off')} ref={box}>
    <button type="button" className="pk-btn" id={`${f.id}-pk`} disabled={disabled} aria-haspopup="listbox"
      aria-expanded={open} aria-controls={panelId} aria-invalid={!!error || undefined}
      data-tip={multi ? `${opts.length} options — pick as many as apply` : `${opts.length} options, searchable`}
      onClick={() => { if (!disabled) { setOpen(o => !o); setCur(c => (c < 0 ? Math.max(0, opts.findIndex(o => same(o, value))) : c)); } }}>
      <span className={cx('pk-val', !chosen.length && 'mut')}>{label}</span>
      {note && <span className="pk-note mono">{String(note).slice(0, 26)}</span>}
      {multi && !!chosen.length && <span className="pk-n mono">{chosen.length}/{opts.length}</span>}
      <span className="pk-chev" aria-hidden="true"><I s={svg.chev} /></span>
    </button>

    {/* chips for what is picked: the popover is where you choose, the field is where you read */}
    {multi && !!chosen.length && <div className="pk-chips">
      {chosen.map(o => <span className="pk-chip" key={String(o)}>
        <b>{o}</b>
        <button type="button" aria-label={'Remove ' + o} data-tip={'Drop “' + o + '”'}
          onClick={() => onChange((Array.isArray(value) ? value : []).filter(x => x !== o))}><I s={svg.x} /></button>
      </span>)}
    </div>}

    <div className="pk-pop" id={panelId} role="presentation" hidden={!open}>
      {searchable && <div className="pk-search"><I s={svg.search} />
        <input type="search" value={q} placeholder="Filter the list…" aria-label={'Filter the options for ' + f.label}
          onChange={e => { setQ(e.target.value); setCur(0); }} autoFocus /></div>}
      <div className="pk-bar">
        <span className="pk-count mono">{shown.length === opts.length ? `${opts.length} options` : `${shown.length} of ${opts.length}`}</span>
        {multi && <span className="pk-acts">
          <button type="button" className="btn xs ghost" onClick={setAll} data-tip="Pick every option in this list">all</button>
          <button type="button" className="btn xs ghost" onClick={clear} disabled={!chosen.length}>clear</button>
        </span>}
        {!multi && !!chosen.length && <button type="button" className="btn xs ghost pk-acts" onClick={clear}
          data-tip="Leave this blank">reset</button>}
      </div>
      <div className="pk-list" role="listbox" tabIndex={open ? 0 : -1}
        aria-multiselectable={multi || undefined} aria-label={f.label}>
        {shown.map(({ o, i }, k) => {
          const on = multi ? chosen.includes(o) : same(value, o);
          return <div className={cx('pk-opt', on && 'on', k === cur && 'cur')} key={String(o)} data-pk={k}
            role="option" aria-selected={on} onClick={() => { setCur(k); pick(o); }}>
            <span className="pk-mark" aria-hidden="true">{multi || f.type === 'multiselect'
              ? <span className={cx('bx', on && 'on')}>{on && <I s={svg.check} />}</span> : <i className={cx('dot', on && 'on')} />}</span>
            <span className="pk-txt">{o}{studio && String(o).startsWith(String(studio).split(',')[0]) && <em className="pk-you">your studio</em>}</span>
            {f.optionNotes && f.optionNotes[o] && <span className="pk-hint">{f.optionNotes[o]}</span>}
          </div>;
        })}
        {!shown.length && <div className="pk-none mono">Nothing in this list matches “{q}”.</div>}
      </div>
    </div>

    {/* the mirror: a real form control, kept in step, so labels, tests and any future native
        submit see the same value the popover shows */}
    <select id={f.id} className="pk-mirror" tabIndex={-1} aria-hidden="true" disabled multiple={multi || undefined} value={multi ? (Array.isArray(value) ? value : []) : (value || '')}
      onChange={e => { const v = e.target.value; if (multi) { onChange(v ? [...(Array.isArray(value) ? value : []), v].filter((x, n, a) => a.indexOf(x) === n) : []); } else onChange(v); }}>
      <option value="">{multi ? 'None selected' : 'Select…'}</option>
      {opts.map(o => <option key={String(o)} value={String(o)}>{String(o)}</option>)}
    </select>
    {multi && <input type="hidden" name={f.id} value={(Array.isArray(value) ? value : []).join(',')} />}
  </div>;
}

export default Picker;
