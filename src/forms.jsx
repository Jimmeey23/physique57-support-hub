import React, { useMemo, useState } from 'react';
import svg, { I } from './icons.jsx';
import { cx, Tip, Switch, Ring } from './ui.jsx';
import { LookupControl, decodeLookup } from './lookups.jsx';
import { isVisible as visible, withDeps, filled as isFilled } from './conditions.js';
export { isVisible as _isVisibleImpl } from './conditions.js';

/* Sections give the long universal block a readable spine. */
const SEC = {
  reporter_type: 'Reporter', reporter_name: 'Reporter', reporter_contact: 'Reporter', preferred_contact: 'Reporter',
  studio: 'Where & when', area: 'Where & when', occurred_at: 'Where & when', occurred_relative: 'Where & when',
  class_format: 'Class context', class_date: 'Class context', trainer: 'Class context',
  member_name: 'Who this is about', member_named: 'Who this is about', member_email: 'Who this is about',
  member_id: 'Who this is about', membership: 'Who this is about', notified_members: 'Who this is about',
  valet_ticket: 'Evidence', ticket_vendor: 'Evidence', asset_link: 'Evidence',
  affected_count: 'Impact & triage', is_repeat: 'Impact & triage', linked_ticket: 'Impact & triage',
  member_impact: 'Impact & triage', class_impacted: 'Impact & triage', immediate_danger: 'Impact & triage',
  sentiment: 'Impact & triage', churn_risk: 'Impact & triage',
  title: 'Description & ask', summary: 'Description & ask', requested_outcome: 'Description & ask',
  attachments: 'Evidence',
};
const ORDER = ['Reporter', 'Who this is about', 'Where & when', 'Class context', 'Impact & triage', 'Sub-category specifics', 'Description & ask', 'Evidence'];
export const sectionOf = f => SEC[f.id] || (f.id === 'title' || f.id === 'summary' ? 'Description & ask' : 'Sub-category specifics');
const filled = isFilled;
/* A conditional field stays hidden until the field its condition names has an answer. */
export function isVisible(f, data, index) { return visible(f, data, index); }
export function buildFields(data0, subKey, D, studio) {
  const sub = subKey ? D.subFields[subKey] || [] : [];
  const all = [...D.universal.map(f => ({ ...f, _u: true })), ...sub];
  return all.map(f => {
    if (f.id === 'area') {
      const sid = (D.studios.find(s => s.name === studio) || {}).id;
      const plan = (D.roomsByStudio[sid] || []);
      const common = ['Main studio floor', 'Reception / lobby', 'Locker room', 'Showers / washroom',
        'Member lounge', 'Boutique', 'Parking / valet', 'Back office', 'Staircase / corridor'];
      const opts = plan.length ? [...new Set([...plan, ...common])] : (f.options || D.allAreas);
      return { ...f, options: opts };
    }
    if (f.id === 'studio') return { ...f, options: D.studios.map(s => s.name) };
    return f;
  });
}

/* A two-way answer is a decision, not a list — the desk flips a switch instead of hunting for the
   right entry. The native radios stay in the DOM (see Switch), so the value is still serialised
   exactly like a radio answer and every existing consumer is untouched. */
export const isBooleanField = f => (f.type === 'radio' || f.type === 'select')
  && Array.isArray(f.options) && f.options.length === 2;
const isBoolean = f => isBooleanField(f);
const timeVal = d => {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

function Options({ f, value, onChange, multi, studio }) {
  const list = f.options || [];
  const [q, setQ] = useState('');
  if (!multi) {
    if (isBoolean(f)) {
      return <Switch value={value} options={list} name={f.id} id={f.id}
        onLabel={list[0]} offLabel={list[1]} onChange={onChange} />;
    }
    if (list.length <= 5 && (f.type === 'radio' || list.length <= 4)) {
      return <div className="radios">{list.map(o => {
        const on = value === o;
        return <label key={o} className={cx('radio', on && 'on')} data-tip={'Answer: ' + o}>
          <span className="box" />
          <input type="radio" checked={on} onChange={() => onChange(o)} />
          <span>{o}</span></label>;
      })}</div>;
    }
    return <div className="selwrap">
      <select id={f.id} value={value || ''} onChange={e => onChange(e.target.value)}>
        <option value="">Select…</option>
        {list.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
      <span className="selmeta mono">{list.length}</span>
    </div>;
  }
  const arr = Array.isArray(value) ? value : [];
  const shown = q.trim() ? list.filter(o => o.toLowerCase().includes(q.trim().toLowerCase())) : list;
  const toggle = o => onChange(arr.includes(o) ? arr.filter(x => x !== o) : [...arr, o]);
  return <div className="mux">
    <div className="mux-bar">
      <span className={cx('mux-n mono', arr.length && 'on')}>{arr.length} of {list.length} picked</span>
      {list.length > 7 && <span className="mux-q"><I s={svg.search} />
        <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Filter options…"
          aria-label={'Filter the options for ' + f.label} /></span>}
      <span className="mux-act">
        <button type="button" className="btn xs ghost" data-tip="Pick every option in this list"
          onClick={() => onChange([...list])}>all</button>
        <button type="button" className="btn xs ghost" data-tip="Clear this answer"
          onClick={() => onChange([])} disabled={!arr.length}>clear</button>
      </span>
    </div>
    <div className="optlist">{shown.map(o => {
      const on = arr.includes(o);
      return <button type="button" key={o} className={cx('opt', on && 'on')} data-tip={on ? 'Remove “' + o + '”' : 'Add “' + o + '”'}
        onClick={() => toggle(o)}><span className="ot">{o}</span></button>;
    })}</div>
    {!shown.length && <span className="mux-none">Nothing matches “{q}” in this list of {list.length}.</span>}
  </div>;
}

function Field({ f, value, onChange, error, onFocus, studio, tickets, onOpenRecord, onFindTicket, auto }) {
  const big = f.type === 'textarea' || f.type === 'file' || (f.options && f.options.length > 14) || f.type === 'multiselect' || f.type === 'lookup';
  const wide = f.id === 'title' || f.id === 'summary' || f.id === 'requested_outcome' || f.type === 'textarea' || f.type === 'file';
  const done = filled(value);
  const isAuto = auto !== undefined && String(auto) === String(value) && value !== '' && value != null;
  const [open, setOpen] = useState(false);
  const step = (d, max) => {
    const n = Number(value || 0) + d;
    if (n < 0) return;
    if (max != null && n > max) return;
    onChange(String(n));
  };
  return (
    <div className={cx('f', (big || wide) && 'span2', error && 'err', done && 'done', isAuto && 'isauto')}
      data-fid={f.id} data-dep={f._dep || undefined}>
      <div className="ftop">
        <label htmlFor={f.id}>{f.label}</label>
        <span className="fbadges">
          {isAuto && <Tip label="Prefilled from the desk signed in on this device. Edit it and the badge clears.">
            <span className="fchip auto"><I s={svg.wand} /> auto</span></Tip>}
          {f.conditional && <Tip label={f.dependsOn ? `Appears once “${f.dependsOn}” is answered` : 'Shown for this sub-category only'}>
            <span className="fchip cond">conditional</span></Tip>}
          {f.required
            ? <Tip label="Required — the desk cannot file without it"><span className="fchip req">required</span></Tip>
            : <Tip label="Optional — skip it and this ticket stays clean"><span className="fchip opt">optional</span></Tip>}
          <span className="fdone" aria-hidden="true"><I s={svg.check} /></span>
        </span>
      </div>
      <div className="fctl">
      {f.type === 'text' && <input id={f.id} type="text" value={value || ''} onFocus={onFocus}
        placeholder={f.placeholder && f.placeholder !== '—' ? f.placeholder : ''}
        data-placeholder={f.placeholder || ''} onChange={e => onChange(e.target.value)} />}
      {f.type === 'url' && <div className="urow"><input id={f.id} type="url" value={value || ''} onFocus={onFocus}
        placeholder={f.placeholder || 'https://…'} onChange={e => onChange(e.target.value)} />
        {value && /^https?:\/\//i.test(value) && <span className="chip mono host" data-tip="Host parsed from what you typed">{(() => { try { return new URL(value).host; } catch { return '—'; } })()}</span>}</div>}
      {f.type === 'number' && <div className="stepper">
        <button type="button" className="stp" aria-label={'Decrease ' + f.label} data-tip="One less"
          onClick={() => step(-1)}><I s={svg.minus} /></button>
        <input id={f.id} type="number" inputMode="numeric" value={value ?? ''} onFocus={onFocus}
          placeholder={f.placeholder || '0'} onChange={e => onChange(e.target.value)} />
        <button type="button" className="stp" aria-label={'Increase ' + f.label} data-tip="One more"
          onClick={() => step(1, f.max)}><I s={svg.plus} /></button>
      </div>}
      {f.type === 'datetime' && <div className="datet">
        <input id={f.id} type="datetime-local" value={value || ''} onFocus={onFocus}
          onChange={e => onChange(e.target.value)} />
        <span className="dt-presets">
          {[['now', () => new Date()], ['-1d', () => new Date(Date.now() - 864e5)], ['-2d', () => new Date(Date.now() - 1728e5)]]
            .map(([lab, make]) => <button type="button" key={lab} className="btn xs ghost"
              data-tip={lab === 'now' ? 'Stamp this exact minute' : `Backdate by ${lab.slice(1)} day${lab === '-2d' ? 's' : ''}`}
              onClick={() => onChange(timeVal(make()))}>{lab === 'now' ? 'just now' : lab === '-1d' ? 'yesterday' : '2 days ago'}</button>)}
        </span>
        {value && <em className="dt-read mono">{new Date(value).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</em>}
      </div>}
      {f.type === 'textarea' && <div className={cx('ta', open && 'open')}>
        <textarea id={f.id} rows={open ? 9 : 3} value={value || ''} onFocus={onFocus}
          placeholder={f.placeholder || ''} onChange={e => onChange(e.target.value)} />
        <span className="ta-foot"><span className="ta-count mono">{(value || '').trim().length} chars
          {' · '}{(value || '').trim() ? (value || '').trim().split(/\s+/).length : 0} words</span>
          <button type="button" className="btn xs ghost" onClick={() => setOpen(o => !o)}
            data-tip={open ? 'Tuck this box away' : 'Give this answer more room'}>{open ? 'collapse' : 'expand'}</button></span>
      </div>}
      {f.type === 'rating' && <Options f={{ ...f, options: f.options || ['1', '2', '3', '4', '5'] }} value={value} onChange={onChange} />}
      {(f.type === 'select') && <Options f={f} value={value} onChange={onChange} />}
      {f.type === 'radio' && <Options f={f} value={value} onChange={onChange} />}
      {f.type === 'multiselect' && <Options f={f} value={value} onChange={onChange} multi studio={studio} />}
      {f.type === 'lookup' && (f.module === 'ticket'
        ? <TicketRef value={value} onChange={onChange} tickets={tickets} onFind={onFindTicket} />
        : <LookupControl module={f.module} value={value} onChange={onChange} studio={studio}
            multi={!!f.multi} label={f.label} tickets={tickets}
            onOpenRecord={v => onOpenRecord && onOpenRecord({ module: f.module === 'member' ? 'members' : f.module === 'session' ? 'sessions' : f.module, id: v.id, label: v.label, raw: v.meta })}
            emptyHint={f.module === 'member' ? 'Nobody by that name in the directory — use the full search, or file it without a member.' : undefined}
            hint={f.module === 'member' ? 'Picking a member fills their name, email and Momence ID on the ticket.' : undefined} />)}
      {f.type === 'file' && <div>
        <label className={cx('drop')} onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add('hot'); }}
          onDragLeave={e => e.currentTarget.classList.remove('hot')}
          onDrop={e => { e.preventDefault(); e.currentTarget.classList.remove('hot');
            onChange([...(Array.isArray(value) ? value : []), ...[...e.dataTransfer.files].map(x => x.name)]); }}>
          <b><I s={svg.clip}/> Drop evidence here or browse</b>
          <span className="drop-sub">Nothing leaves this browser — only the file name is logged on the ticket, so a
            clip of the A/C rattling is named, not uploaded</span>
          <input type="file" multiple style={{ display: 'none' }}
            onChange={e => onChange([...(Array.isArray(value) ? value : []), ...[...e.target.files].map(x => x.name)])} />
        </label>
        {Array.isArray(value) && value.length > 0 && <div className="filechips">
          {value.map((v, i) => <span className="chip mono" key={i}><I s={svg.clip}/> {v}
            <button type="button" className="btn sm ghost" style={{ padding: 0, border: 0 }} data-tip="Remove this file name from the ticket"
              onClick={() => onChange(value.filter((_, j) => j !== i))}><I s={svg.x}/></button></span>)}
        </div>}
      </div>}
      </div>
      {f.hint !== false && f.desc && <div className="hint">{f.desc}</div>}
      {error && <div className="hint errtxt"><I s={svg.warn}/> {error}</div>}
    </div>
  );
}

/* A ticket reference is the one lookup we let people type: staff quote numbers out loud. */
function TicketRef({ value, onChange, tickets, onFind }) {
  const d = decodeLookup(value);
  const found = d && (tickets || []).find(t => t.number === String(d.id) || t.number === String(d.label));
  return (
    <div className="tref">
      <div className="tref-in">
        <input type="text" value={String(value || '')} placeholder="P57-2026-0042, or search the board" onChange={e => onChange(e.target.value)} />
        <button type="button" className="lk-search" onClick={onFind}><I s={svg.link} /> find a ticket</button>
      </div>
      {d && (
        <div className="tref-hit">
          {found
            ? <><span className="chip ok"><I s={svg.link}/> matched</span><b>{found.title}</b>
                <span className="mut xs">{found.subCategory} · {found.studio} · {found.priority}</span></>
            : <><span className="chip warn"><I s={svg.warn}/> not on this board</span>
                <span className="mut xs">Nothing here carries that reference — it may be a desk ticket from another system.</span></>}
        </div>
      )}
    </div>
  );
}

export default function FormEngine({ fields, data, setData, errors, requiredOnly, collapsed, toggle,
  studio, tickets, onOpenRecord, onFindTicket, autoFill = {} }) {
  const { fields: withD, index } = useMemo(() => withDeps(fields), [fields]);
  const vis = withD.filter(f => isVisible(f, data, index))
    .filter(f => !requiredOnly || f.required);
  const groups = new Map();
  for (const f of vis) {
    const s = sectionOf(f);
    if (!groups.has(s)) groups.set(s, []);
    groups.get(s).push(f);
  }
  const secs = [...groups.keys()].sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));
  const allReq = vis.filter(f => f.required);
  const allDone = allReq.filter(f => filled(data[f.id])).length;
  return <div className="fwrap">
    <div className="fprogress">
      <Ring done={allDone} total={allReq.length} size={30} />
      <div className="fp-txt"><b className="mono">{allDone}<span className="mut">/{allReq.length || 0}</span></b>
        <span>required answers in — the two clocks start when you file</span></div>
      <span className="fp-bar"><i style={{ '--w': (allReq.length ? Math.round(100 * allDone / allReq.length) : 100) + '%' }} /></span>
    </div>
    <div className="fsections">
    {secs.map((s, si) => {
      const fs = groups.get(s);
      const req = fs.filter(f => f.required);
      const done = req.filter(f => filled(data[f.id])).length;
      const all = req.length === 0 || done === req.length;
      const open = !collapsed.has(s);
      return <section className={cx('fsec', !open && 'collapsed', all && 'clear')} key={s} style={{ '--si': si }}>
        <div className="fh" onClick={() => toggle(s)}>
          <span className="n" aria-hidden="true">{String(si + 1).padStart(2, '0')}</span>
          <Ring done={done} total={req.length} size={22} />
          <h4>{s}</h4>
          <span className="fh-meta mono">{done}/{req.length || fs.length} · {fs.length} field{fs.length > 1 ? 's' : ''}</span>
          <span className="chev" dangerouslySetInnerHTML={{ __html: svg.chev }} />
        </div>
        {open && <div className="fbody">
          {fs.map(f => <Field key={f.id} f={f} value={data[f.id]} error={errors[f.id]} auto={autoFill[f.id]}
            studio={studio} tickets={tickets} onOpenRecord={onOpenRecord} onFindTicket={onFindTicket}
            onFocus={e => { e.currentTarget.closest('.tk')?.classList.remove('bump'); }}
            onChange={v => setData(d => ({ ...d, [f.id]: v }))} />)}
        </div>}
      </section>;
    })}
    {!secs.length && <div className="empty"><h3>No fields match</h3><p>Turn off “required only” to see the full form.</p></div>}
    </div>
  </div>;
}
