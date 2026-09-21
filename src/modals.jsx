/* The modal layer: review-before-file, resolution capture, repeat-report linking,
   appearance/integrations settings and the guided powerCycle template. Each mirrors a screen
   in the reference product (review card, resolution panel, "same fault?" confirmation,
   settings → integrations, cycle intake questions). */
import React, { useMemo, useState } from 'react';
import DATA from './data.json';
import svg, { I } from './icons.jsx';
import { cx, Modal, Pill, StatusPill, Avatar, Countdown, fmtAt, fmtDur, Search } from './ui.jsx';
import { themeVars, glyphSvg } from './themes.js';
import { sectionOf } from './forms.jsx';
import { RecordModal, LookupControl, AttendeeRoster, decodeLookup } from './lookups.jsx';
import { studios, systems, memberships, trainers, equipmentTypes, equipmentCategories,
  prioritySlaHours, statusLabels, counts as ccounts } from './constants.json';
import { TIERS, handover, fieldLabels, describeTicket, narrativeOf } from './core.js';
import { AI_MODELS } from './ai.js';
import { sessionStats, detailMomence, obj as objOf, populateSession } from './momence.js';
import { RES_CAUSE, RES_OWNER, RES_OUTCOME, RES_FOLLOWUP, RES_GOODWILL, RES_PREVENTION, RES_PROOF,
  RES_REOPEN_RISK, RES_ASSET_CONDITION, RES_CLASS_FOLLOWUP, AUDIENCE, DISRUPTION, EXPERIENCE_EFFECT,
  ATTENDANCE_MATCH, CAPACITY_NEED, BOOKING_FRICTION, REBOOKING_INTENT, HOST_SITUATION, ATT_ACTION,
  COACHING, SENTIMENT, CLASS_ASPECT } from './vocab.js';

const short = s => String(s || '').replace(/\s*\(.*?\)\s*/g, '');
const RES_FIELD_COUNT = 18;

/* ------------------------------------------------------------------ review */
/** Nothing is filed until the desk has read the whole thing back — the reference does the
    same before it lets Iris create a ticket. */
export function ReviewModal({ fields, data, visibleFields, sub, chain, priority, hours, studio,
  missing, gating, onCancel, onConfirm, onFix, cls }) {
  const groups = useMemo(() => {
    const m = new Map();
    for (const f of visibleFields) {
      const s = sectionOf(f);
      if (!m.has(s)) m.set(s, []);
      m.get(s).push(f);
    }
    return m;
  }, [visibleFields]);
  const blockers = [...missing, ...gating];
  const answered = visibleFields.filter(f => {
    const v = data[f.id];
    return v !== '' && v != null && !(Array.isArray(v) && !v.length);
  });
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? answered : answered.filter(f => !['title', 'summary', 'requested_outcome'].includes(f.id));
  const lookups = answered.filter(f => f.type === 'lookup');
  const display = f => {
    const v = data[f.id];
    if (f.type === 'lookup') { const d = decodeLookup(v); return d ? d.label : '—'; }
    if (Array.isArray(v)) return v.join(' · ');
    if (typeof v === 'number') return String(v);
    return String(v ?? '—');
  };
  return (
    <Modal size="wide" onClose={onCancel} title="Read it back before it routes" tag={sub.name}
      description={`Once you file this, ${short(chain[0]?.who)} owns the clock and the SLA starts.`}
      footer={<div className="modal-foot">
        <span className="mut xs">{blockers.length ? <span style={{ color: 'var(--breach)' }}>{blockers.length} blocker{blockers.length > 1 ? 's' : ''} to clear</span>
          : <span><I s={svg.check} /> nothing missing — the note below is ready for the desk</span>}</span>
        <div className="row-gap">
          <button className="btn" onClick={onCancel}>Keep editing</button>
          <button className="btn" onClick={() => onFix()}><I s={svg.wand} /> Autofill demo answers</button>
          <button className="btn pri" disabled={!!blockers.length} onClick={onConfirm}><I s={svg.bolt} /> File &amp; start SLA</button>
        </div></div>}>
      <div className="review">
        <div className="rv-head">
          <div><span className="eyebrow">{sub.category}</span>
            <h3>{data.title || `${sub.name} — ${studio || 'studio'}`}</h3>
            <p className="mut">{data.summary || 'No summary written.'}</p></div>
          <div className="rv-prio"><Pill p={priority} /><StatusPill s="new" />
            <span className="chip mono">{`P${['critical', 'high', 'medium', 'low'].indexOf(priority) + 1} · FR ${hours.first < 1 ? Math.round(hours.first * 60) + ' min' : hours.first + ' hr'} · res ${hours.res} hr`}</span></div>
        </div>
        <div className="rv-route">
          {chain.map((c, i) => <div className="rv-step" key={i}>
            <Avatar name={c.who} size={28} i={i} /><div><b>{short(c.who)}</b><span>{c.note}</span></div>
            {i < chain.length - 1 && <span className="rv-arrow"><I s={svg.arrow} /></span>}</div>)}
          <div className="rv-dest"><span className="mut xs">goes to</span><b>{studio || 'studio not chosen'}</b>
            {data.area && <span> · {data.area}</span>}</div>
        </div>
        {cls && <div className="tkclass rv-class">
          <div className="between"><h5>{"Class & roll call · read back from Momence"}</h5>
            <span className="chip mono">session #{cls.sessionId}</span></div>
          <div className="cd-stats sm">{[['capacity', cls.capacity], ['booked', cls.booked], ['attended', cls.attended],
            ['absent', cls.absent], ['waitlist', cls.waitlist], ['guests', cls.guests], ['first-timers', cls.firstTimers],
            ['over book', cls.overbook], ['not compatible', cls.incompatible]]
            .filter(([, v]) => v != null && v !== 0).map(([k, v]) => <div key={k} className={cx('cds', /over book|not compatible/.test(k) && Number(v) > 0 && 'warn')}><b className="mono">{v}</b><span>{k}</span></div>)}</div>
          <p className="mut xs">{cls.name} · {cls.studio} · coached by {cls.trainer || '—'} · {cls.hostSituation || 'as scheduled'}
            {' '}{cls.fillPct != null ? `· ${cls.fillPct}% full` : ''}{cls.attendees?.length ? ` · ${cls.attendees.length} attendee note${cls.attendees.length > 1 ? 's' : ''} attached` : ''}
            {cls.booked != null ? ` · Roll ${cls.booked} booked ${cls.attended ?? 0} attended ${cls.absent ?? 0} absent of ${cls.capacity ?? '—'} places` : ''}</p>
          {(cls.attendees || []).length > 0 && <div className="rv-att">
            {cls.attendees.map((a, i) => <div className="cds-row" key={i}><b>{a.name}</b><span>{a.status || 'no status'}</span>
              {(a.actions || []).length > 0 && <em>{a.actions.join(', ')}</em>}
              {a.note && <span className="mut xs">{a.note}</span>}</div>)}</div>}
        </div>}
        {!!lookups.length && <div className="rv-links">
          <span className="eyebrow">Linked records</span>
          {lookups.map(f => <span className="lk-chip mini" key={f.id}>
            <span className="lk-mark"><I s={svg[f.type === 'lookup' && f.module === 'member' ? 'user' : f.module === 'session' ? 'calendar' : 'link']} /></span>
            <b>{display(f)}</b></span>)}
        </div>}
        <div className="rv-cols">
          {[...groups.entries()].map(([sec, fs]) => {
            const list = fs.filter(f => shown.includes(f));
            if (!list.length) return null;
            return <div className="rv-sec" key={sec}><h5>{sec}</h5>
              {list.map(f => <div className="rv-row" key={f.id}>
                <span>{f.label}</span><b>{display(f)}</b></div>)}
            </div>;
          })}
        </div>
        <div className="rv-foot">
          <button className="btn sm ghost" onClick={() => setShowAll(s => !s)}>
            {showAll ? 'Hide reporter fields' : `Show all ${answered.length} answered fields`}
          </button>
          <span className="mut xs mono">{handover({ ...previewTicket(sub, data, chain, priority, hours, studio, answered), }, fieldLabels).split('\n').length} handover lines</span>
        </div>
        {!!blockers.length && <div className="rv-block">
          <b><I s={svg.warn} /> Still needed</b>
          {blockers.map(f => <button key={f.id} onClick={() => onFix(f.id)}><span>{f.label}</span><em>{f._gate || 'required'}</em></button>)}
        </div>}
      </div>
    </Modal>
  );
}
const previewTicket = (sub, data, chain, priority, hours, studio, answered) => ({
  number: 'P57-' + new Date().getFullYear() + '-0000', title: data.title || sub.name, status: 'new',
  priority, category: sub.category, subCategory: sub.name, studio: studio || '', area: data.area || '',
  department: sub.department, assignee: chain[0]?.who || '', slaLabel: sub.slaLabel, createdAt: Date.now(),
  reporter_name: data.reporter_name, reporter_type: data.reporter_type, summary: data.summary || '',
  data: Object.fromEntries(answered.filter(f => !['title', 'summary'].includes(f.id)).map(f => [f.id, data[f.id]])),
});

/* -------------------------------------------------------------- resolution */
/** Reference: a resolution panel capturing cause, action, follow-up, prevention and whether
    the member was told — not just a "close" button. */
export function ResolutionModal({ t, onCancel, onConfirm }) {
  const hasClass = !!(t.class?.sessionId || t.data.class_date || t.linked?.session);
  const st = hasClass && t.class?.sessionId ? sessionStats(t.class.sessionId) : null;
  const d0 = {
    causeCategory: '', cause: '', responsible: 'Studio team', action: '',
    outcome: t.resolution?.outcome || (hasClass ? 'Fixed at the studio' : 'Fixed at the studio'),
    followUp: 'Not needed', goodwill: 'None', amountINR: '',
    prevention: 'Nothing to change', ownerNotes: '', assetCondition: '',
    vendorRef: '', classFollowUp: hasClass ? 'Missed members credited' : 'No class impact to report',
    memberNotified: t.data.member_email ? 'Yes — reply to the reporter' : 'No follow-up needed',
    reopenRisk: 'Low', proof: 'Nothing attached', verifiedBy: String(t.assignee || '').replace(/\s*\(.*?\)\s*/g, ''),
    closureNote: '',
  };
  const [f, setF] = useState(() => ({ ...d0, ...(t.resolution || {}), action: t.resolution?.action || '' }));
  const set = (k, v) => setF(x => ({ ...x, [k]: v }));
  const pick = (kind, v) => set(kind, v);
  const missing = [['causeCategory', 'cause category'], ['cause', 'root cause'], ['action', 'what you did'], ['closureNote', 'a line the next shift can read']]
    .filter(([k]) => !String(f[k] || '').trim());
  const ok = missing.length === 0;
  const attendeeCount = Object.keys(t.class?.attendees || {}).length;
  const sel = (list, k) => <select value={f[k]} onChange={e => set(k, e.target.value)}>{list.map(o => <option key={o}>{o}</option>)}</select>;
  const chips = (list, k) => <div className="chiprow">{list.map(o => <button type="button" key={o}
    className={cx('opt xs', f[k] === o && 'on')} onClick={() => pick(k, o)}>{o}</button>)}</div>;
  return (
    <Modal onClose={onCancel} size="wide" title={`Close out ${t.number}`} tag={t.label || t.subCategory}
      description="What you write here becomes the record the next shift reads — and the evidence the owner checks."
      footer={<div className="modal-foot">
        <span className="mut xs">{ok ? <span style={{ color: 'var(--ok)' }}><I s={svg.check} /> all 18 capture fields filled</span>
          : <span style={{ color: 'var(--breach)' }}>still needed: {missing.map(m => m[1]).join(', ')}</span>}</span>
        <div className="row-gap"><button className="btn" onClick={onCancel}>Cancel</button>
          <button className="btn pri" disabled={!ok} onClick={() => onConfirm(f)}><I s={svg.check} /> Record resolution</button></div></div>}>
      <div className="res-cols">
        <div className="res-col">
          <h5>What went wrong</h5>
          <label className="res-f"><span>Category<i className="req" /></span>{chips(RES_CAUSE, 'causeCategory')}</label>
          <label className="res-f"><span>Root cause, in your words<i className="req" /></span>
            <textarea rows={2} value={f.cause} placeholder="The pedal on bike 4 was never torqued to spec — reverse-threaded on the left crank."
              onChange={e => set('cause', e.target.value)} /></label>
          <label className="res-f"><span>Whose fix it was</span>{sel(RES_OWNER, 'responsible')}</label>
          {hasClass && <label className="res-f"><span>Class follow-up</span>{sel(RES_CLASS_FOLLOWUP, 'classFollowUp')}</label>}
          {hasClass && st && <div className="res-class">
            <span className="eyebrow">Class snapshot</span>
            <div className="kv"><span className="k">Booked / attended</span><span className="v mono">{st.booked} / {st.attended}</span></div>
            <div className="kv"><span className="k">No-shows</span><span className="v mono">{st.absent ?? '—'}</span></div>
            <div className="kv"><span className="k">Attendees you noted</span><span className="v mono">{attendeeCount}</span></div>
          </div>}
          {t.asset_id && <label className="res-f"><span>Asset left in what state</span>{sel(RES_ASSET_CONDITION, 'assetCondition')}</label>}
          <label className="res-f"><span>Vendor / AMC / invoice reference</span>
            <input value={f.vendorRef} placeholder="Quote 2211 · Shree Fitness Services" onChange={e => set('vendorRef', e.target.value)} /></label>
        </div>
        <div className="res-col">
          <h5>What you did, and what the member gets</h5>
          <label className="res-f"><span>Action taken<i className="req" /></span>
            <textarea rows={2} value={f.action} placeholder="Bike 4 out of rotation, pedal re-torqued at 42 N·m, the other nine checked on the same shift."
              onChange={e => set('action', e.target.value)} /></label>
          <div className="res-two">
            <label className="res-f"><span>Outcome</span>{sel(RES_OUTCOME, 'outcome')}</label>
            <label className="res-f"><span>Member follow-up</span>{sel(RES_FOLLOWUP, 'followUp')}</label>
          </div>
          <div className="res-two">
            <label className="res-f"><span>Goodwill</span>{sel(RES_GOODWILL, 'goodwill')}</label>
            {/credit|refund|₹|passed|extended/i.test(f.goodwill)
              ? <label className="res-f"><span>Amount (₹)</span>
                <input type="number" value={f.amountINR} onChange={e => set('amountINR', e.target.value)} placeholder="0" /></label>
              : <div className="res-f ghost"><span>Amount</span><em className="mut xs">only asked for when money or credit moves</em></div>}
          </div>
          <label className="res-f"><span>Prevention / SOP change</span>{chips(RES_PREVENTION, 'prevention')}</label>
          <label className="res-f"><span>Notes for the owner</span>
            <textarea rows={2} value={f.ownerNotes} placeholder="Cost, warranty, the bit finance will ask for." onChange={e => set('ownerNotes', e.target.value)} /></label>
        </div>
        <div className="res-col">
          <h5>Before it leaves the board</h5>
          <label className="res-f"><span>Evidence attached</span>{sel(RES_PROOF, 'proof')}</label>
          <div className="res-two">
            <label className="res-f"><span>Reopen risk</span>{sel(RES_REOPEN_RISK, 'reopenRisk')}</label>
            <label className="res-f"><span>Verified by</span>
              <input value={f.verifiedBy} onChange={e => set('verifiedBy', e.target.value)} placeholder="who signed it off" /></label>
          </div>
          <label className="res-f"><span>Closure line<i className="req" /></span>
            <textarea rows={2} value={f.closureNote} placeholder="One sentence the front desk can repeat to a member without opening this ticket."
              onChange={e => set('closureNote', e.target.value)} /></label>
          <div className="res-meta tight">
            <div><span>raised</span><b className="mono">{fmtAt(t.createdAt)}</b></div>
            <div><span>first response</span><b className="mono">{t.firstResponseAt ? fmtDur(t.firstResponseAt - t.createdAt) + ' after' : 'not sent'}</b></div>
            <div><span>resolution due</span><b className="mono">{fmtAt(t.resDueAt)}</b></div>
            <div><span>escalation</span><b className="mono">step {t.escalation + 1} of {t.chain.length}</b></div>
            <div><span>reports filed</span><b className="mono">×{t.recurrenceCount || 1}</b></div>
          </div>
        </div>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------- repeat-report link */
/** Three reports of one fault is a chronic problem, not a snag: the reference appends the
    repeat to the open ticket, raises priority when a class is impacted, and escalates at #3. */
export function LinkTicketModal({ tickets, data, onCancel, onLink, onCreateSeparate }) {
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(null);
  const mine = decodeLookup(data.linked_ticket);
  const open = tickets.filter(t => !['resolved', 'closed'].includes(t.status));
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    const list = open.map(t => ({ t, blob: `${t.number} ${t.title} ${t.subCategory} ${t.category} ${t.studio} ${t.data.member_name || ''}`.toLowerCase() }));
    return (s ? list.filter(x => x.blob.includes(s)) : list).map(x => x.t);
  }, [q, open.map(t => t.id).join(',')]);
  const sameSub = rows.filter(t => t.subCategory === (data._subName || sel?.subCategory));
  return (
    <Modal size="wide" onClose={onCancel} title="Is this the same fault?" tag={data._subName || 'link a ticket'}
      description="Linking keeps one clock running and counts the repeat on the ticket that is already open."
      footer={<div className="modal-foot">
        <span className="mut xs">{open.length} open {open.length === 1 ? 'ticket' : 'tickets'} · {sameSub.length} on this sub-category</span>
        <div className="row-gap"><button className="btn" onClick={onCreateSeparate}>It’s a new problem — file separately</button>
          <button className="btn pri" disabled={!sel} onClick={() => onLink(sel)}><I s={svg.link} /> Link &amp; report again</button></div></div>}>
      {!!mine && <div className="lk-note"><I s={svg.link} /> <span>Already referenced: <b>{mine.label}</b> — pick a row to report against it instead.</span></div>}
      <div className="picker-q"><Search value={q} onChange={setQ} placeholder="Search open tickets by number, member, studio, title…" autoFocus /></div>
      <div className="picker-list">
        {rows.map(t => (
          <button key={t.id} className={cx('picker-row link', sel?.id === t.id && 'on')} onClick={() => setSel(t)}>
            <span className="picker-num mono">{t.number}</span>
            <span className="lk-txt"><b>{t.title}</b>
              <em>{t.category} › {t.subCategory} · {t.studio}{t.area ? ' · ' + t.area : ''}</em></span>
            <span className="picker-tags">
              {(t.recurrenceCount > 1) && <span className="chip warn">report #{t.recurrenceCount}</span>}
              <Pill p={t.priority} /><StatusPill s={t.status} />
              <span className="chip mono">{t.firstResponseAt ? 'FR sent' : 'FR due ' + fmtAt(t.frDueAt)}</span></span>
            <span className={cx('pick-dot', sel?.id === t.id && 'on')} />
          </button>))}
        {!rows.length && <div className="lk-empty">Nothing open matches “{q}”. File it as a new problem.</div>}
      </div>
      {sel && <div className="link-preview">
        <b>What will happen</b>
        <div className="lp-grid">
          {[['Report count', `${(sel.recurrenceCount || 1) + 1} on ${sel.number}`],
            ['Priority', (data.class_impacted || '').startsWith('Yes') ? 'raised to high' : `stays ${sel.priority}`],
            ['Escalation', (sel.recurrenceCount || 1) + 1 >= 3 ? 'auto-escalated to L1' : 'unchanged'],
            ['New clock', 'none — the open clock keeps running']].map(([k, v]) => <div key={k}><span>{k}</span><b>{v}</b></div>)}
        </div>
      </div>}
    </Modal>
  );
}

/* ------------------------------------------------------------ settings / appearance */
export function SettingsModal({ onClose, prefs, setPrefs, onTestMomence, momenceStatus, ai }) {
  const [keyDraft, setKeyDraft] = useState('');
  const [aiTest, setAiTest] = useState('');
  const aiTestRun = async () => { if (!ai) return; setAiTest('asking the model one line…');
    setAiTest(await ai.test()); };
  const TABS = [['appearance', 'Appearance'], ['sla', 'SLA model'], ['integrations', 'Integrations'], ['data', 'Data']];
  const [tab, setTab] = useState('appearance');
  const set = (k, v) => setPrefs(p => ({ ...p, [k]: v }));
  return (
    <Modal size="drawer" onClose={onClose} title="Workspace settings" icon={<span dangerouslySetInnerHTML={{ __html: svg.sliders }} />}
      description="How the hub looks, how it clocks, and what it is allowed to talk to."
      footer={<div className="modal-foot"><span className="mut xs">Saved in this browser only.</span>
        <button className="btn pri" onClick={onClose}>Done</button></div>}>
      <div className="segbar">
        {TABS.map(([id, lab]) => <button key={id} className={cx('seg', tab === id && 'on')} onClick={() => setTab(id)}>{lab}</button>)}
      </div>
      {tab === 'appearance' && <div className="set-grid">
        <div className="set-block"><h5>Theme</h5>
          <div className="seg big">{['light', 'dark', 'auto'].map(t => <button key={t} className={cx('seg', prefs.theme === t && 'on')} onClick={() => set('theme', t)}>{t}</button>)}</div>
          <p className="hint">“Auto” follows the studio iPads’ system setting.</p></div>
        <div className="set-block"><h5>Surface</h5>
          <div className="presets">{['editorial', 'glass', 'contrast'].map(p =>
            <button key={p} className={cx('preset', prefs.appearance === p && 'on')} onClick={() => set('appearance', p)}>
              <span className={cx('pv', 'pv-' + p)} /><b>{p}</b><em>{p === 'editorial' ? 'paper, hairlines, print-first' : p === 'glass' ? 'layered gradients and blur' : 'max contrast, larger type'}</em></button>)}</div></div>
        <div className="set-block"><h5>Density</h5>
          <div className="seg big">{['cosy', 'compact', 'spread'].map(d => <button key={d} className={cx('seg', prefs.density === d && 'on')} onClick={() => set('density', d)}>{d}</button>)}</div>
          <p className="hint">Compact fits roughly 40% more rows on a front-desk screen.</p></div>
        <div className="set-block"><h5>Motion</h5>
          {[['animateCounters', 'Count-up stats'], ['skeletons', 'Skeleton loaders on search'], ['pulse', 'Pulse the breach clocks']].map(([k, lab]) =>
            <label className="switchrow" key={k}><input type="checkbox" checked={!!prefs[k]} onChange={e => set(k, e.target.checked)} /><span>{lab}</span></label>)}
          <p className="hint">Anything here is skipped automatically when the device asks for reduced motion.</p></div>
      </div>}
      {tab === 'sla' && <div className="set-grid">
        <div className="set-block"><h5>This hub · response and resolution</h5>
          <div className="tiergrid">{Object.entries(TIERS).map(([k, v]) => <div key={k} className="tier">
            <Pill p={k} /><b className="mono">{v.fr < 1 ? Math.round(v.fr * 60) + ' min' : v.fr + ' hr'}</b>
            <span>first response</span><i /><b className="mono">{v.res} hr</b><span>resolution</span></div>)}</div>
          <p className="hint">Derived from the taxonomy: {DATA.counts.subcategories} sub-categories mapped onto these four tiers, with safety faults pinned to P1.</p></div>
        <div className="set-block"><h5>Reference repo · resolution-only hours</h5>
          <div className="tiergrid">{Object.entries(prioritySlaHours).map(([k, v]) => <div key={k} className="tier">
            <Pill p={k} /><b className="mono">{v >= 24 ? v / 24 + ' d' : v + ' hr'}</b><span>resolution window</span></div>)}</div>
          <p className="hint">The Momence-linked repo tracks one clock per ticket; this hub runs two, because first response is the thing members actually feel.</p></div>
        <div className="set-block span2"><h5>Status vocabulary</h5>
          <div className="chipwrap">{Object.entries(statusLabels).map(([k, v]) => <span className="chip" key={k}>{v}</span>)}</div>
          <p className="hint">Seven of these nine are used here; “assigned” is folded into triage because the desk is named at creation.</p></div>
      </div>}
      {tab === 'integrations' && <div className="set-grid">
        <div className="set-block span2"><h5>Momence · members, classes, bookings, memberships</h5>
          <div className={cx('intg', momenceStatus === 'ready' && 'on')}>
            <span className="lk-mark lg"><I s={svg.plug} /></span>
            <div className="intg-t"><b>{momenceStatus === 'ready' ? 'Connected · last sync 2 min ago' : 'Not connected'}</b>
              <p>Demo records are read-only. Credentials never live in a browser, so this build ships a dataset shaped exactly like the API — swapping in the real endpoint is one function per module.</p></div>
            <div className="intg-a">
              <button className="btn" onClick={onTestMomence}><I s={svg.bolt} /> Test the demo dataset</button>
              <button className="btn ghost" title="Copy the endpoint that would replace the local dataset">
                <I s={svg.copy} /> GET /v1/{'{'}module{'}'}</button></div>
          </div>
          <div className="fieldgrid sm">
            {[['Username / API client ID', 'studio-owner@physique57.com'], ['Password / client secret', '••••••••••••'],
              ['Region', 'ap-south-1 (Mumbai)'], ['Webhook', 'not configured']].map(([k, v]) =>
              <div className="fg" key={k}><span className="fk">{k}</span><span className="fv mono">{v}</span></div>)}
          </div>
          <p className="hint">In production the hub would exchange credentials server-side for an OAuth token, cache the expiry and refresh it — the same flow the reference uses.</p></div>
        <div className="set-block span2"><h5>OpenAI · the write-up</h5>
          <div className={cx('intg', ai?.ready && 'on')}>
            <span className="lk-mark lg"><I s={svg.wand} /></span>
            <div className="intg-t"><b>{ai?.ready ? `Key held on this device · ${ai.mask}` : 'No key on this device'}</b>
              <p>{ai?.ready
                ? 'The intake form can turn its own answers into a paragraph. The prompt carries only what is filled in, so the model phrases the record — it never supplies facts.'
                : 'Without a key the hub still writes a one-line summary of the answers locally, and nothing is sent anywhere. Paste a key to have the paragraph drafted instead.'}</p></div>
            <div className="intg-a">
              <button className="btn" onClick={aiTestRun} disabled={!ai?.ready}><I s={svg.bolt} /> Test it on the oldest ticket</button>
              <button className="btn ghost" onClick={() => { ai?.setKey(''); setKeyDraft(''); setAiTest('key forgotten — the local line is used again'); }}><I s={svg.x} /> Forget the key</button></div>
          </div>
          <div className="fieldgrid sm">
            <label className="fg fld"><span className="fk">API key</span>
              <input type="password" autoComplete="off" spellCheck="false" value={keyDraft}
                onChange={e => setKeyDraft(e.target.value)} placeholder="sk-… (kept in this browser only)" /></label>
            <div className="fg"><span className="fk">&nbsp;</span>
              <div className="row-gap"><button className="btn sm pri" onClick={() => { ai?.setKey(keyDraft); setAiTest(keyDraft.trim() ? 'key saved on this device' : 'key cleared'); }}><I s={svg.check} /> Save key</button>
                <span className="xs mut">localStorage, never the repo.</span></div></div>
          </div>
          <div className="seg big" style={{ marginTop: 10 }}>
            {AI_MODELS.map(m => <button key={m} className={cx('seg', ai?.model === m && 'on')} onClick={() => ai?.setModel(m)}>{m}</button>)}</div>
          <label className="switchrow" style={{ marginTop: 10 }}><input type="checkbox" checked={!!ai?.auto}
            onChange={e => ai?.setAuto(e.target.checked)} /><span>Offer the write-up on every intake form</span></label>
          {aiTest && <p className="hint"><b>{aiTest}</b></p>}
          <p className="hint">A static build cannot keep a secret, so this is a personal key for the desk that uses it. A hosted deployment would move the same call behind a server route, exactly as the reference app does with <span className="mono">credentials(’chatgpt’)</span>.</p></div>
        <div className="set-block span2"><h5>Fillout · the forms this hub embeds</h5>
          <p className="hint">Two runtimes: a Fillout form, or a Zite app (a flow, not a form — its own embed script). The id is what comes after <span className="mono">/f/</span> in the share link. Leave it blank and the panel says so instead of loading an empty frame.</p>
          <div className="forms-grid">{(ai?.formDefs || []).map(f => {
            const cur = (ai?.forms || {})[f.id] || {};
            const idv = cur.embedId ?? f.embedId;
            const kindv = cur.kind || f.kind;
            return <div className="form-row" key={f.id}>
              <div className="fr-l"><b>{f.label}</b><em className="xxs mut">{f.note}</em></div>
              <label><span className="xxs mut">form id</span>
                <input value={idv || ''} placeholder="e.g. dSw2VkfdGqus" spellCheck="false"
                  onChange={e => ai?.setForm(f.id, { embedId: e.target.value })} /></label>
              <div className="seg"><button className={cx('seg', kindv === 'fillout-v1' && 'on')} onClick={() => ai?.setForm(f.id, { kind: 'fillout-v1' })}>fillout</button>
                <button className={cx('seg', kindv === 'zite-v2' && 'on')} onClick={() => ai?.setForm(f.id, { kind: 'zite-v2' })}>zite</button></div>
              <span className={cx('fr-dot', idv ? 'on' : '')}>{idv ? 'embeds' : 'link only'}</span>
            </div>; })}
          </div>
        </div>
        <div className="set-block"><h5>Also on the roadmap</h5>
          <div className="intg-list">{[['Mailtrap', 'assignment email to the owner the moment a ticket is created'],
          ['Google Sheets', 'every ticket and status change appended as a row'],
          ['Slack', 'breach alerts into #studio-ops'], ['WhatsApp Business', 'template replies inside the 24-hour window'],
          ['Razorpay', 'payment lookup on billing disputes']].map(([n, d]) =>
            <div className="intg-row" key={n}><b>{n}</b><span>{d}</span><span className="chip">not connected</span></div>)}</div></div>
      </div>}
      {tab === 'data' && <div className="set-grid">
        <div className="set-block span2"><h5>What this build knows</h5>
          <div className="numgrid">
            {[['categories', DATA.counts.categories], ['sub-categories', DATA.counts.subcategories], ['intake field plans', DATA.counts.fields],
              ['historic tickets modelled', 464], ['studios', ccounts.studios], ['class formats', ccounts.classFormats],
              ['trainers', ccounts.trainers], ['memberships / packages', ccounts.memberships], ['equipment types', ccounts.equipmentTypes],
              ['systems', ccounts.systems], ['named rooms', ccounts.rooms]].map(([k, v]) =>
              <div key={k}><b className="mono">{v}</b><span>{k}</span></div>)}</div>
          <p className="hint">Everything is generated by <span className="mono">npm run data</span> from the taxonomy and the reference constants; nothing is fetched at runtime.</p></div>
        <div className="set-block"><h5>Export</h5>
          <p className="hint">Markdown handover notes, JSON backups and CSV of the queue live in the queue and detail views.</p></div>
        <div className="set-block"><h5>Danger zone</h5>
          <p className="hint">Resetting the demo replaces the board with a fresh seed of 16 tickets.</p></div>
      </div>}
    </Modal>
  );
}

/* ---------------------------------------------------- guided cycle template */
/** CYCLE_INTAKE_QUESTIONS + the SC3 part catalogue, verbatim from the reference repo, so a
    desk reporting a bike fault answers the questions the vendor actually needs. */
export function CycleTemplateModal({ onClose, onApply, data }) {
  const Q = DATA.repo?.cycleIntake || [];
  const parts = DATA.repo?.cycleParts || [];   // objects with name/tools/torque/description in the repo
  const [ans, setAns] = useState({ bikeNumber: data.bike_number || '', cycleIssueType: data.cycle_issue || '',
    cyclePart: data.cycle_part || '', cycleFirstOrRecurring: '', cycleReporterAction: '', additionalInfo: '' });
  const set = (k, v) => setAns(a => ({ ...a, [k]: v }));
  const known = (Q.find(x => x.key === 'cyclePart')?.values || []);
  const citePart = name => {
    if (known.includes(name)) set('cyclePart', name);
    else set('additionalInfo', [ans.additionalInfo, `Part: ${name}`].filter(Boolean).join(' · '));
  };
  const answered = Object.values(ans).filter(v => String(v).trim()).length;
  const mapping = { bikeNumber: 'bike_number', cycleIssueType: 'cycle_issue', cyclePart: 'cycle_part',
    cycleFirstOrRecurring: 'cycle_recurrence', cycleReporterAction: 'cycle_desk_action', additionalInfo: 'cycle_notes' };
  const preview = Object.entries(ans).filter(([, v]) => String(v).trim()).map(([k, v]) => `${fieldLabels[mapping[k]] || mapping[k]}: ${v}`).join(' · ');
  return (
    <Modal size="wide" onClose={onClose} title="Guided powerCycle report" tag={`${Q.length} questions`}
      description="The vendor’s own intake questions, plus the SC3 console parts list — answers drop straight into your form."
      footer={<div className="modal-foot"><span className="mut xs">{answered}/{Q.length + 1} answered</span>
        <div className="row-gap"><button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn pri" disabled={!answered} onClick={() => onApply(Object.fromEntries(Object.entries(ans)
            .filter(([, v]) => String(v).trim()).map(([k, v]) => [mapping[k], v])))}><I s={svg.check} /> Add to the ticket</button></div></div>}>
      <div className="guide">
        {Q.map((qq, i) => <div className="gq" key={qq.key}>
          <span className="gn mono">{String(i + 1).padStart(2, '0')}</span>
          <div><label>{qq.prompt}</label>
            {qq.type === 'select'
              ? <select value={ans[qq.key] || ''} onChange={e => set(qq.key, e.target.value)}>
                <option value="">Select…</option>{(qq.values || []).map(v => <option key={v}>{v}</option>)}</select>
              : <input value={ans[qq.key] || ''} placeholder={/bike/i.test(qq.prompt) ? 'e.g. Bike #3' : ''} onChange={e => set(qq.key, e.target.value)} />}</div>
        </div>)}
        <div className="gq"><span className="gn mono">{String(Q.length + 1).padStart(2, '0')}</span>
          <div><label>Anything else the technician should know?</label>
            <textarea rows={2} value={ans.additionalInfo} onChange={e => set('additionalInfo', e.target.value)}
              placeholder="Noise only under load, started after the deep clean, …" /></div></div>
      </div>
      <div className="guide-parts">
        <h5>SC3 parts · the vendor’s own catalogue — tap to cite one</h5>
        <div className="partgrid">
          {parts.map(p => (typeof p === 'string' ? { name: p, id: p } : p)).map(p => (
            <button type="button" key={p.id} className={cx('part', ans.cyclePart === p.name && 'on')}
              onClick={() => set('cyclePart', p.name)}>
              <b>{p.name}</b>
              {p.tools && p.tools !== 'N/A' && <span className="part-tools"><I s={svg.wand} /> {p.tools}</span>}
              {p.torque && <span className="chip mono">torque {p.torque}</span>}
              {p.description && <em>{p.description}</em>}
            </button>))}
        </div>
        <p className="hint">Citing the part fills “Which part of the bike is affected?” and, when it is not on that list, adds it to the notes for the technician.</p>
      </div>
      {preview && <div className="guide-preview"><span className="eyebrow">Will be added</span><p className="mono xs">{preview}</p></div>}
    </Modal>
  );
}

export const REPO_LOOKUPS = { studios, systems, memberships, trainers, equipmentTypes, equipmentCategories };

/* ============================================================ class desk */
/** Hosted-class tickets start from the class, never from a form: pick the session out of
    Momence, the roster and every stat around it come with it, and the desk triages the
    attendees in place. All of that drops onto the ticket as ordinary answers, so review,
    handover and export need no new code path. */
export function ClassDesk({ sessionId, captured, setCaptured, entries, setEntries, tickets,
  onOpenRecord, onPickSession, onFile, autofill, subOptions, onOpenMember }) {
  const st = sessionId ? sessionStats(sessionId) : null;
  const det = sessionId ? detailMomence('sessions', String(sessionId)) : null;
  const raw = objOf(det?.item?.raw);
  const set = (k, v) => setCaptured(c => ({ ...c, [k]: v }));
  /* toggle against the pending value, not the render snapshot: a desk can tick three boxes
     in one keystroke-flurry and all three must stick */
  const setMulti = (k, v) => setCaptured(c => {
    const cur = c[k];
    const next = Array.isArray(cur) ? (cur.includes(v) ? cur.filter(x => x !== v) : [...cur, v]) : [v];
    return { ...c, [k]: next };
  });
  /* keep the booking id on the row: the summary has to key by person, not by note text */
  const flagged = Object.entries(entries).map(([id, e]) => e && { ...e, __id: id })
    .filter(e => e && (e.status || (e.tags || []).length || (e.actions || []).length || (e.note || '').trim()));
  const offered = [...new Set(flagged.flatMap(e => e.actions || []))];
  const sel = (k, list) => <select value={captured[k] || ''} onChange={e => set(k, e.target.value)}>
    <option value="">Select…</option>{list.map(o => <option key={o}>{o}</option>)}</select>;
  const chips = (k, list) => <div className="chiprow">{list.map(o => <button type="button" key={o}
    className={cx('opt xs', (captured[k] || []).includes(o) && 'on')} onClick={() => setMulti(k, o)}>{o}</button>)}</div>;
  return (
    <div className="classdesk">
      <div className="cd-step">
        <span className="eyebrow">Step 1 · which class</span>
        <div className="cd-pick">
          <LookupControl className="cd-session" module="session" value={captured.class_date || ''} studio={captured.studio}
            label="Find the class" placeholder="Search by class name, coach, studio, date or Momence id…"
            onChange={v => onPickSession(v)}
            onOpenRecord={v => onOpenRecord({ module: 'sessions', id: v.id, label: v.label })} />
        </div>
        {!sessionId && <p className="cd-hint">Everything below fills itself from Momence: the roll, capacity, waitlist, who coached it and what each member pays with. Nothing here is typed twice.</p>}
      </div>
      {sessionId && <>
        <div className="cd-card">
          <div className="cd-head">
            <div><span className="eyebrow">Step 2 · the class as Momence sees it</span>
              <h3>{raw.name}</h3>
              <p className="mut">{raw.startsAt && new Date(raw.startsAt).toLocaleString('en-IN', { weekday: 'long', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                {' '}· {raw.durationInMinutes} min · {objOf(raw.inPersonLocation).name}</p></div>
            <div className="cd-head-a">
              <span className={cx('chip', raw.isCancelled ? 'bad' : 'ok')}>{raw.isCancelled ? 'Cancelled in Momence' : 'Scheduled'}</span>
              {raw.isDraft && <span className="chip warn">draft</span>}
              <span className="chip mono">session #{raw.id}</span>
            </div>
          </div>
          <div className="cd-stats">
            {[['capacity', raw.capacity], ['booked', st?.booked], ['attended', st?.attended], ['no-shows', st?.absent == null ? (st?.started ? 0 : 'pending') : st.absent],
              ['cancelled', st?.cancelled], ['waitlist', st?.waitlist], ['guests', st?.guests], ['first-timers', st?.firstTimers],
              ['not compatible', st?.incompatible], ['fill', st ? st.fillPct + '%' : null], ['over book', st?.overbook]]
              .filter(([, v]) => v != null).map(([k, v]) => <div key={k} className={cx('cds', /not compatible|over book|no-shows/.test(k) && Number(v) > 0 && 'warn')}>
                <b className="mono">{v}</b><span>{k}</span></div>)}
          </div>
          <div className="cd-line">
            <span className="mut xs">coached by</span><b>{[objOf(raw.teacher).firstName, objOf(raw.teacher).lastName].filter(Boolean).join(' ') || '—'}</b>
            {raw.originalTeacher && <><span className="chip warn">guest stand-in</span><span className="mut xs">for {[objOf(raw.originalTeacher).firstName, objOf(raw.originalTeacher).lastName].join(' ')}</span></>}
            {(raw.additionalTeachers || []).length > 0 && <span className="chip">+{raw.additionalTeachers.length} assistant</span>}
            <span className="mut xs">· room</span><b>{objOf(raw.inPersonLocation).name}</b>
            {(raw.tags || []).map(t => <span className="chip" key={t.id}>{t.name}</span>)}
          </div>
        </div>
        <div className="cd-grid">
          <div className="cd-block"><h5>Host &amp; room</h5>
            <label><span>Who actually ran it</span>{sel('class_host_situation', HOST_SITUATION)}</label>
            <label><span>Effect on the experience</span>{sel('class_experience_effect', EXPERIENCE_EFFECT)}</label>
            <label><span>What happened to the class</span>{sel('class_disruption', DISRUPTION)}</label>
            <label><span>Attendance vs. the roll</span>{sel('class_attendance_match', ATTENDANCE_MATCH)}</label>
            <label><span>What the class needed</span>{chips('class_capacity_need', CAPACITY_NEED)}</label></div>
          <div className="cd-block"><h5>Audience</h5>
            <label><span>Who was in the room</span>{chips('class_audience', AUDIENCE)}</label>
            <label><span>Booking friction reported</span>{chips('class_booking_friction', BOOKING_FRICTION)}</label>
            <label><span>Will they come back</span>{sel('class_rebooking_intent', REBOOKING_INTENT)}</label>
            <label><span>Notes on the audience</span><textarea rows={2} value={captured.class_audience_notes || ''}
              placeholder="Six first-timers; two were standing because the mats ran out…" onChange={e => set('class_audience_notes', e.target.value)} /></label></div>
          <div className="cd-block"><h5>Host &amp; method</h5>
            <label><span>Notes on the host / coach</span><textarea rows={3} value={captured.class_host_notes || ''}
              placeholder="Held the stretch block, explained the corrections, kept the pace for the beginners…" onChange={e => set('class_host_notes', e.target.value)} /></label>
            <label><span>Feedback is about</span>{chips('trainer_feedback_type', COACHING)}</label>
            <label><span>Sentiment that came back</span>{sel('trainer_sentiment', SENTIMENT)}</label></div>
          <div className="cd-block"><h5>Compatibility &amp; billing</h5>
            <label><span>Notes on membership compatibility</span><textarea rows={2} value={captured.class_compatibility_notes || ''}
              placeholder="Three class-pack members were blocked by the usage limit and charged single-class…" onChange={e => set('class_compatibility_notes', e.target.value)} /></label>
            {st?.incompatible > 0 && <p className="cd-warn"><I s={svg.warn}/> {st.incompatible} attendee{(st.incompatible > 1 ? 's were' : ' was')} flagged by Momence as unable to pay with an active membership — see the roster.</p>}
            <label><span>What was offered in the room</span>{chips('attendee_actions_taken', ATT_ACTION)}</label></div>
        </div>
        <div className="cd-roster">
          <div className="between"><h5>Step 3 · the roll — comments, status and notes per attendee</h5>
            <div className="row-gap">
              <button type="button" className="btn sm ghost" onClick={autofill}><I s={svg.wand}/> autofill from Momence</button>
              {flagged.length > 0 && <span className="chip warn">{flagged.length} flagged</span>}
            </div></div>
          <AttendeeRoster sessionId={sessionId} entries={entries} onEntries={setEntries}
            onOpenMember={b => onOpenRecord({ module: 'members', id: String(b.member.id), label: `${b.member.firstName} ${b.member.lastName}` })} />
          {!!flagged.length && <div className="cd-summary">
            <span className="eyebrow">Will be written on the ticket</span>
            {flagged.slice(0, 6).map(e => <div className="cds-row" key={e.__id || e.note}>
              <b>{e.name || e.note?.slice(0, 10)}</b><span>{e.status || 'no status'}</span>
              {(e.actions || []).length > 0 && <em>{e.actions.join(', ')}</em>}</div>)}
            {offered.length > 0 && <p className="mut xs">offered: {offered.join(' · ')}</p>}
          </div>}
        </div>
        <div className="cd-foot">
          <label className="cd-sub"><span className="mut xs">route this to</span>
            <select value={captured._subKey || ''} onChange={e => set('_subKey', e.target.value || undefined)}>
              {(subOptions || []).map(o => <option key={o.key} value={o.key}>{o.label}</option>)}</select></label>
          <button className="btn pri" onClick={() => onFile({ entries: flagged, offered })}><I s={svg.bolt}/> Build the ticket from this class</button>
          <span className="mut xs">{flagged.length ? `${flagged.length} attendee note${flagged.length > 1 ? 's' : ''} will ride along` : 'no attendee notes yet — the class-level answers are enough'}</span>
        </div>
      </>}
    </div>
  );
}

/* ============================================================ trainer desk */
/** A tab of its own: feedback is filed against a person, so the person needs a page — their
    classes, attendance against Momence, the tickets naming them, and the review notes. */
export function TrainerDesk({ directory, tickets, onSelect, selected, onOpenRecord, onRaise }) {
  const [q, setQ] = useState('');
  const [aspect, setAspect] = useState('');
  const [win, setWin] = useState(14);
  const rows = directory.filter(d => (!q || d.name.toLowerCase().includes(q.toLowerCase()))
    && (!aspect || (d.ratings || []).some(r => (r.aspect || []).includes(aspect))));
  const sel = selected ? rows.find(r => r.name === selected) : null;
  const theirs = tickets.filter(t => String(t.data?.trainer || '').includes(selected || '\u0000') || t.data?.trainer_under_review === selected);
  const avg = list => list.length ? Math.round(list.reduce((a, b) => a + b, 0) / list.length) : null;
  const ratings = sel ? theirs.flatMap(t => t.class?.ratings || []) : [];
  return (
    <div className="trainerdesk">
      <div className="td-bar">
        <div style={{ minWidth: 220, flex: 1 }}><Search value={q} onChange={setQ} placeholder="Find a trainer…" /></div>
        <select className="sel" value={aspect} onChange={e => setAspect(e.target.value)}>
          <option value="">Any feedback aspect</option>{COACHING.map(o => <option key={o}>{o}</option>)}</select>
        <select className="sel" value={win} onChange={e => setWin(Number(e.target.value))}>
          {[7, 14, 30, 90].map(w => <option key={w} value={w}>{w}-day window</option>)}</select>
        <span className="mut xs mono">{rows.length} of {directory.length} trainers</span>
      </div>
      <div className="td-grid">
        <div className="td-list">{rows.map((r, i) => <button type="button" key={r.name} className={cx('trow', selected === r.name && 'on')} onClick={() => onSelect(r.name === selected ? null : r.name)}>
          <Avatar name={r.name} size={30} i={i % 4} />
          <span className="td-name"><b>{r.name}</b><em>{r.classes} classes · {r.classesRun || 0} run</em></span>
          <span className="td-kpis">
            <span className={cx('chip', (r.attendancePct ?? 100) < 70 ? 'warn' : 'ok')}>{r.attendancePct ?? '—'}% show-up</span>
            <span className="chip mono">{r.fillPct ?? '—'}% full</span>
            {!!r.tickets && <span className={cx('chip', r.urgent ? 'bad' : 'brand')}>{r.tickets} ticket{r.tickets > 1 ? 's' : ''}</span>}
            {!!r.ratingAvg && <span className="chip">★ {r.ratingAvg}</span>}
          </span></button>)}</div>
        <div className="td-side">
          {!sel && <div className="card empty"><div className="big">✓</div><h3>Pick a trainer</h3>
            <p>Their classes, attendance against Momence, and everything the desk has filed against them.</p></div>}
          {sel && <>
            <div className="td-head"><Avatar name={sel.name} size={42} i={2} />
              <div><h3>{sel.name}</h3><p className="mut">{sel.classes} classes in this window · {sel.booked} booked · {sel.attended} attended</p></div>
              <button className="btn sm pri" onClick={() => onRaise(sel)}><I s={svg.plus}/> file feedback</button></div>
            <div className="cd-stats">
              {[['attendance', sel.attendancePct != null ? sel.attendancePct + '%' : 'n/a'], ['fill', sel.fillPct != null ? sel.fillPct + '%' : 'n/a'],
                ['classes run', sel.classesRun || 0], ['guest / stand-in', sel.guests], ['compatibility blocks', sel.incompatible],
                ['tickets naming them', sel.tickets || 0], ['urgent', sel.urgent || 0], ['resolved', sel.resolved || 0]]
                .map(([k, v]) => <div key={k} className={cx('cds', /urgent|blocks/.test(k) && Number(v) > 0 && 'warn')}><b className="mono">{v}</b><span>{k}</span></div>)}
            </div>
            <h5>Class ratings captured on tickets</h5>
            {ratings.length ? <div className="td-rates">{ratings.map((r, i) => <div key={i} className="td-rate">
              <b>{r.teaching}/5</b><span>{(r.aspect || []).join(', ')}</span><em>{r.note}</em></div>)}</div>
                : <p className="mut xs">No rating captured yet — the class desk files one when the desk records “what the feedback is about”.</p>}
            <h5>Feedback filed against them</h5>
            {!theirs.length && <p className="mut xs">Nothing on this board names {sel.name}.</p>}
            {theirs.map(t => <div className="td-tk" key={t.id}>
              <Pill p={t.priority} /><StatusPill s={t.status} />
              <b>{t.label || t.title}</b><span className="mut xs mono">{t.number} · {t.subCategory}</span>
              <span className="mut xs">{(t.data.trainer_feedback_type || []).join(', ') || t.data.class_experience_effect || 'no aspect recorded'}</span>
              <button className="btn sm ghost" onClick={() => onOpenRecord({ module: 'tickets', id: t.id, ticket: t })}>open</button></div>)}
            {sentimentLine(sel, theirs)}
          </>}
        </div>
      </div>
    </div>
  );
}
function sentimentLine(sel, theirs) {
  const sent = theirs.map(t => t.data.trainer_sentiment).filter(Boolean);
  const counts = sent.reduce((m, x) => (m[x] = (m[x] || 0) + 1, m), {});
  const worst = ['Would not return', 'Angry', 'Upset', 'Annoyed', 'Neutral', 'Happy', 'Very happy'].find(k => counts[k]);
  if (!worst) return null;
  return <p className="hint"><I s={svg.warn}/> {Object.entries(counts).map(([k, v]) => `${v}× ${k}`).join(' · ')} — the strongest signal right now is <b>{worst}</b>.</p>;
}

/* ------------------------------------------------------------------ autofill */
/** The desk is not a form-filling contest: this answers whatever is still blank with the
    first legal value, the way a demo does, so the review step can be reached from anywhere. */
export function autofillMissing(fields, data, { memberName = 'Rhea Shah', ticket = '' } = {}) {
  const next = { ...data };
  for (const f of fields) {
    if (!f.required) continue;
    const v = next[f.id];
    if (v !== '' && v != null && !(Array.isArray(v) && !v.length)) continue;
    if (f.type === 'lookup') {
      next[f.id] = f.module === 'member' ? `${memberName} [#481108]` : f.module === 'ticket' ? ticket : '';
      continue;
    }
    if (f.type === 'text' || f.type === 'url') next[f.id] = f.id.includes('count') ? '1' : '—';
    else if (f.type === 'number') next[f.id] = '1';
    else if (f.type === 'datetime') next[f.id] = new Date(Date.now() - 36e5).toISOString().slice(0, 16);
    else if (f.type === 'textarea') next[f.id] = 'Raised from the floor; details with the desk.';
    else if (f.type === 'multiselect' || f.type === 'file') next[f.id] = (f.options || ['note']).slice(0, 1);
    else next[f.id] = (f.options || ['Yes'])[0];
  }
  return next;
}

/* ------------------------------------------------------------- command palette */
export function CommandPalette({ items, onClose, onRun }) {
  const [q, setQ] = useState('');
  const [i, setI] = useState(0);
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    const list = items.map(x => ({ x, score: !s ? 1 : ((x.label + ' ' + (x.keywords || '')).toLowerCase().includes(s) ? 2 : 0) }));
    return list.filter(r => r.score).map(r => r.x);
  }, [q, items.length]);
  const pick = r => { onRun(r); onClose(); };
  return (
    <Modal onClose={onClose} title="Jump to anything" tag="⌘K"
      description="Categories, sub-categories, desks and views — one keystroke away for a busy front desk."
      footer={<div className="modal-foot"><span className="mut xs">↑↓ move · Enter run · Esc close</span><span className="mut xs mono">{rows.length} results</span></div>}>
      <div className="picker-q"><Search value={q} onChange={setQ} placeholder="Type a category, a person, “breaching”, …" autoFocus /></div>
      <div className="palette">
        {rows.slice(0, 40).map((r, k) => (
          <button key={r.id || r.label} className={cx('pal-row', k === i && 'cur')} onMouseEnter={() => setI(k)} onClick={() => pick(r)}>
            <span className="pal-ico"><I s={svg[r.icon] || svg.arrow} /></span>
            <span className="lk-txt"><b>{r.label}</b>{r.hint && <em>{r.hint}</em>}</span>
            <span className="chip mono">{r.kind || 'go'}</span></button>))}
        {!rows.length && <div className="lk-empty">Nothing matches “{q}”.</div>}
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------- ticket full record */
/** The row in the queue answers “which ticket is this?”. The sheet answers everything else: the
    story in the reporter’s words, both clocks, who owns it and what they have actually done, every
    answer grouped the way the form asked it, the roll if a class was involved, and the actions —
    all on one sheet so nobody re-opens three tabs to answer a member on the phone. */
export function TicketSheet({ t, story, now, fields = [], all = [], onClose, onRespond, onEscalate,
  onStatus, onResolve, onOpenRecord, onHandover, onExport, extra, theme }) {
  const data = t.data || {};
  const visibleIds = new Set(fields.map(f => f.id));
  const groups = new Map();
  for (const f of fields) {
    const v = data[f.id];
    if (v === undefined || v === null || String(v).trim() === '' || (Array.isArray(v) && !v.length)) continue;
    const sec = sectionOf(f);
    if (!groups.has(sec)) groups.set(sec, []);
    groups.get(sec).push({ f, v });
  }
  const orphans = Object.entries(data)
    .filter(([k, v]) => !visibleIds.has(k) && String(v).trim() !== '' && !(Array.isArray(v) && !v.length))
    .map(([k, v]) => ({ f: { id: k, label: fieldLabels[k] || k }, v }));
  if (orphans.length) groups.set('Answered elsewhere', orphans);
  const member = decodeLookup(data.member_name);
  const cls = t.class;
  const stages = [
    { k: 'raised', lab: 'Raised', at: t.createdAt, done: true, who: data.reporter_name || '—' },
    { k: 'triaged', lab: 'Triaged to ' + short(t.assignee), at: t.createdAt, done: !!t.chain,
      who: (t.chain || [])[Math.min(t.escalation || 0, (t.chain || []).length - 1)]?.who || t.assignee },
    { k: 'fr', lab: 'First response', at: t.firstResponseAt, done: !!t.firstResponseAt,
      who: t.firstResponseAt ? 'answered ' + fmtAt(t.firstResponseAt) : 'owed by ' + fmtAt(t.frDueAt) },
    { k: 'res', lab: 'Resolution', at: t.resolvedAt, done: !!t.resolvedAt,
      who: t.resolvedAt ? 'closed ' + fmtAt(t.resolvedAt) : 'due ' + fmtAt(t.resDueAt) },
  ];
  const storyLine = story || t.narrative || narrativeOf(t);
  const answers = [...groups.entries()];
  const answered = answers.reduce((n, [, list]) => n + list.length, 0);
  return (
    <Modal size="xl" onClose={onClose} tag={t.number}
      title={<span className="ts-title"><span className="ts-cat mono">{t.category} › {t.subCategory}</span>{t.title}</span>}
      description={storyLine}
      footer={<div className="modal-foot ts-foot">
        <span className="mut xs mono">v{t.version || 1} · {answered} of {fields.length} answers on record · {t.timeline?.length || 0} events</span>
        <span className="row-gap" />
        {!t.firstResponseAt && <button className="btn sm" onClick={onRespond}><I s={svg.bolt} /> Log first response</button>}
        {(t.escalation || 0) < ((t.chain || []).length - 1) && <button className="btn sm" onClick={onEscalate}><I s={svg.up} /> Escalate to L{(t.escalation || 0) + 1}</button>}
        {t.status !== 'resolved' && t.status !== 'closed' && <button className="btn sm pri" onClick={onResolve}><I s={svg.check} /> Resolve</button>}
        <button className="btn sm ghost" onClick={onHandover}><I s={svg.copy} /> Handover note</button>
        <button className="btn sm ghost" onClick={onExport}><I s={svg.down} /> JSON</button>
      </div>}>
      <div className="tsheet" style={theme ? themeVars(theme) : undefined}>
        {/* the type’s own mark, big and behind everything, so the sheet reads as *that* kind of problem */}
        {theme && <span className="ts-wm" aria-hidden="true"><I s={glyphSvg(theme.emblem, 158, 1.1)} /></span>}
        <div className="ts-hero">
          <div className="ts-chips">
            <StatusPill s={t.status} /><Pill p={t.priority} /><span className="chip mono">{t.slaLabel}</span>
            {(t.recurrenceCount || 1) > 1 && <span className="chip warn" data-tip="The same fault has been reported this many times"><I s={svg.flame} /> report #{t.recurrenceCount}</span>}
            {t.linkedTicketId && <span className="chip brand"><I s={svg.link} /> one clock with {t.linkedTicketId.slice(-4)}</span>}
            {(t.escalation || 0) > 0 && <span className="chip brand mono">L{t.escalation}</span>}
            <span className="chip mono" data-tip={"Opened " + fmtAt(t.createdAt)}>raised {fmtAt(t.createdAt)}</span>
            <span className="chip mono">updated {fmtAt(t.updatedAt)}</span>
          </div>
          <div className="clockpair ts-clocks">
            <div className={cx('clockbox', !t.firstResponseAt && (t.frDueAt ?? 0) <= now && 'bad')}>
              <span className="mut xxs">first response · live</span>
              <Countdown t={t} now={now} mode="fr" />
              <em className="mut xxs mono">due {fmtAt(t.frDueAt)} · {t.firstResponseAt ? 'answered ' + fmtAt(t.firstResponseAt) : 'not answered yet'}</em></div>
            <div className="clockbox"><span className="mut xxs">resolution · live</span>
              <Countdown t={t} now={now} mode="res" />
              <em className="mut xxs mono">{t.resolvedAt ? 'closed after ' + fmtDur(t.resolvedAt - t.createdAt) : 'promise ' + (t.hours?.res || TIERS[t.priority]?.res || 48) + 'h'}</em></div>
          </div>
        </div>

        <div className="ts-story">
          <span className="ts-story-mark" aria-hidden="true" />
          <p>{describeTicket(t)}</p>
          {t.summary && <blockquote>{t.summary}</blockquote>}
          {t.data.requested_outcome && <p className="ts-ask"><b>What they want:</b> {t.data.requested_outcome}</p>}
        </div>

        <div className="ts-kpis">
          <div className="ts-kpi"><span className="mut xxs">raised by</span>
            <b>{data.reporter_name || 'not recorded'}</b><em>{data.reporter_type || 'reporter type not set'}</em>
            {data.reporter_contact && <span className="chip mono xs">{data.reporter_contact}</span>}</div>
          <div className="ts-kpi"><span className="mut xxs">where</span>
            <b>{t.studio || '—'}</b><em>{t.area || 'no room named'}</em>
            <span className="chip mono xs">{t.department}</span></div>
          <div className="ts-kpi"><span className="mut xxs">who this is about</span>
            {member?.id
              ? <button className="lkbtn" onClick={() => onOpenRecord && onOpenRecord({ module: 'members', id: String(member.id), label: member.label })}><I s={svg.user} /> {member.label || data.member_name}</button>
              : <b>{data.member_name ? String(data.member_name) : 'no member linked'}</b>}
            <em>{Number(data.affected_count) > 0 ? `${data.affected_count} member${Number(data.affected_count) > 1 ? 's' : ''} affected` : 'counted as an internal or single-member issue'}</em></div>
          <div className="ts-kpi"><span className="mut xxs">evidence</span>
            <b>{Array.isArray(data.attachments) && data.attachments.length ? data.attachments.length + ' file' + (data.attachments.length > 1 ? 's' : '') : 'none attached'}</b>
            <em>{Array.isArray(data.attachments) && data.attachments.length ? 'names logged on the ticket — nothing is uploaded here' : 'photos and clips make an A/C or noise fault provable'}</em>
            {Array.isArray(data.attachments) && <span className="ts-files">{data.attachments.map(a => <span className="chip mono" key={a}><I s={svg.clip} /> {a}</span>)}</span>}</div>
        </div>

        <div className="ts-cols">
          <div className="ts-answers">
            {answers.map(([sec, list], gi) => <section className="ts-grp" key={sec} style={{ '--gi': gi }}>
              <h5><span className="ts-n mono">{String(gi + 1).padStart(2, '0')}</span>
                <span>{sec}</span><span className="mut xxs mono">{list.length} answer{list.length > 1 ? 's' : ''}</span></h5>
              {list.map(({ f, v }) => {
                const txt = Array.isArray(v) ? v.join(' · ') : String(v);
                const isLookup = f.type === 'lookup' && decodeLookup(v)?.id;
                const mod = f.module === 'member' ? 'members' : f.module === 'session' ? 'sessions' : f.module === 'ticket' ? 'tickets' : null;
                return <div className="ts-ans" key={f.id}>
                  <span className="k">{f.label || fieldLabels[f.id] || f.id}</span>
                  <span className={cx('v', txt.length > 90 && 'long')} data-tip={txt.length > 90 ? txt : undefined}>
                    {isLookup
                      ? <button className="chip lkbtn" onClick={() => onOpenRecord && onOpenRecord({ module: mod, id: String(decodeLookup(v).id), label: decodeLookup(v).label })}><I s={mod === 'members' ? svg.user : mod === 'sessions' ? svg.calendar : svg.link} /> {decodeLookup(v).label}</button>
                      : txt}
                  </span>
                  {f.required && <span className="ts-req" data-tip="Required for this sub-category"><I s={svg.check} /></span>}
                </div>;
              })}
            </section>)}
          </div>
          <aside className="ts-side">
          {extra}
            <div className="sidecard">
              <h5>Lifecycle</h5>
              <div className="ts-spine">
                {stages.map((st, i) => <div className={cx('ts-stage', st.done && 'done', !st.done && i === stages.findIndex(x => !x.done) && 'now')} key={st.k}>
                  <span className="d" aria-hidden="true" />
                  <b>{st.lab}</b><em>{st.who}</em>{st.at && <span className="mono xxs">{fmtAt(st.at)}</span>}</div>)}
              </div>
              <div className="hr" style={{ margin: '12px 0' }} />
              <h5>Route</h5>
              <div className="routechain">
                {(t.chain || []).map((c, i) => <div className={cx('rstep', i <= (t.escalation || 0) && 'done')} key={i}>
                  <span className="rd"><i /></span><span className="rl">{i === t.escalation ? 'current' : c.note}</span>
                  <span className="rw">{short(c.who)}</span></div>)}
              </div>
              <div className="row-gap" />
              <label className="chip ts-status" data-tip="Move the ticket; every change is written to the timeline">
                <I s={svg.layers} />
                <select value={t.status} onChange={e => onStatus && onStatus(e.target.value)}>
                  {Object.entries(statusLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select></label>
            </div>
            {cls?.sessionId && <div className="sidecard ts-class">
              <h5>Class on the record</h5>
              <div className="cd-stats">{[['booked', cls.booked], ['attended', cls.attended], ['absent', cls.absent],
                ['places', cls.capacity], ['waitlist', cls.waitlist], ['over', cls.overbook]]
                .map(([k, v]) => <div className="cds" key={k}><b className="mono">{v ?? '—'}</b><span>{k}</span></div>)}</div>
              <p className="cd-line">{cls.name || 'session'} · {cls.studio || t.studio} · host {cls.hostSituation || cls.trainer || '—'}
                {cls.source ? ` · read from ${cls.source}` : ''}</p>
              {!!cls.attendees?.length && <AttendeeRoster attendees={cls.attendees} readOnly compact />}
            </div>}
            <div className="sidecard">
              <h5>Timeline</h5>
              <div className="tl">{(t.timeline || []).slice(0, 12).map((e, i) => <div className="ev" key={i}>
                <time>{new Date(e.at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false })}</time>
                <span>{e.text}</span></div>)}</div>
            </div>
            {t.resolution && <div className="sidecard ts-res">
              <h5>How it was closed</h5>
              <div className="kv"><span className="k">Cause</span><span className="v">{t.resolution.causeCategory || '—'}</span></div>
              <div className="kv"><span className="k">Outcome</span><span className="v">{t.resolution.outcome || '—'}</span></div>
              <div className="kv"><span className="k">Goodwill</span><span className="v">{t.resolution.goodwill || 'None'}</span></div>
              {t.resolution.closureNote && <p className="hint">{t.resolution.closureNote}</p>}
            </div>}
          </aside>
        </div>
      </div>
    </Modal>
  );
}
