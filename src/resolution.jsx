/* ───────────────────────────────────────────────────────────────────────────────
   The resolution record, in the rail.

   The close-out is the part of a ticket the next shift actually reads, so it is not a
   footer link — it is the highlighted column on the right, with the checklist the vendor
   reference app asks for (cause named · action recorded · member told · prevention written
   down · evidence attached) computed live from what has been typed.

   Ownership rules come from src/org.js: the ticket owner and their reporting manager write,
   everyone else reads. A read-up-only rail is still the full record — nothing is hidden, the
   controls are simply not editable, and the rail says exactly whose pen it is waiting for.
   ─────────────────────────────────────────────────────────────────────────────── */
import React, { useMemo, useState } from 'react';
import svg, { I } from './icons.jsx';
import { cx, Countdown, Pill, fmtAt, fmtDur } from './ui.jsx';
import Picker from './picker.jsx';
import { RES_CAUSE, RES_OWNER, RES_OUTCOME, RES_FOLLOWUP, RES_GOODWILL, RES_PREVENTION, RES_PROOF,
  RES_REOPEN_RISK, RES_ASSET_CONDITION, RES_CLASS_FOLLOWUP } from './vocab.js';
import { sessionStats } from './momence.js';
import { cleanName, resolutionRights, viewerOptions } from './org.js';

/* The eighteen capture fields, with the defaults the desk would expect for this ticket. */
export function resolutionDraft(t, hasClass) {
  const hc = hasClass ?? !!(t?.class?.sessionId || t?.data?.class_date || t?.linked?.session);
  return {
    causeCategory: '', cause: '', responsible: 'Studio team', action: '',
    outcome: t?.resolution?.outcome || 'Fixed at the studio',
    followUp: 'Not needed', goodwill: 'None', amountINR: '',
    prevention: 'Nothing to change', ownerNotes: '', assetCondition: '',
    vendorRef: '', classFollowUp: hc ? 'Missed members credited' : 'No class impact to report',
    memberNotified: t?.data?.member_email ? 'Yes — reply to the reporter' : 'No follow-up needed',
    reopenRisk: 'Low', proof: 'Nothing attached',
    verifiedBy: cleanName(t?.assignee || ''), closureNote: '',
  };
}

/* Four of those are not optional: without them the record cannot be read by anyone else. */
export const REQUIRED_RES = [['causeCategory', 'cause category'], ['cause', 'root cause'],
  ['action', 'what you did'], ['closureNote', 'a line the next shift can read']];
export const resolutionGaps = f => REQUIRED_RES.filter(([k]) => !String(f?.[k] || '').trim());

/* The close-out checklist the reference app insists on before a ticket may leave the board. */
export function resolutionChecks(f, t) {
  const money = /credit|refund|₹|passed|extended/i.test(String(f.goodwill || ''));
  return [
    { id: 'cause', label: 'Cause named', ok: !!f.causeCategory && String(f.cause || '').trim().length > 12, hint: 'A category and a sentence in your own words.' },
    { id: 'action', label: 'Action recorded', ok: String(f.action || '').trim().length > 12, hint: 'What was done, to what, by whom.' },
    { id: 'member', label: 'Member told', ok: /^Yes/.test(String(f.memberNotified || '')) || /No follow-up/.test(String(f.memberNotified || '')), hint: 'Either a reply went out or none was owed.' },
    { id: 'prevent', label: 'Prevention written down', ok: String(f.prevention || '') !== 'Nothing to change', hint: '“Nothing to change” is a decision, not a default.' },
    { id: 'proof', label: 'Evidence attached', ok: String(f.proof || '') !== 'Nothing attached', hint: 'Invoice, screenshot, receipt — whatever makes it checkable.' },
    { id: 'signoff', label: 'Signed off by a second name', ok: String(f.verifiedBy || '').trim().length > 2, hint: 'Whoever checked it, not whoever fixed it.' },
    { id: 'money', label: money ? 'Goodwill amount entered' : 'Goodwill marked as none', ok: !money || Number(f.amountINR) > 0, hint: money ? 'Finance will ask for the rupee figure.' : 'Only asked for when money or credit moves.' },
    { id: 'closure', label: 'Closure line written', ok: String(f.closureNote || '').trim().length > 12, hint: 'One sentence the front desk can repeat without opening the ticket.' },
  ];
}

/* A choice, rendered by the same dropdown every other choice on the hub uses. */
function Pick({ id, label, options, value, onChange, readOnly, hint }) {
  return <Picker f={{ id, label, options: options || [] }} value={value || ''} list={options || []}
    onChange={readOnly ? () => {} : onChange} placeholder={readOnly ? '—' : 'Select…'} error={undefined}
    studio={undefined} />;
}

/**
 * The body of the record. `stack` turns the three reading columns into one, which is what fits a
 * rail; `readOnly` swaps every control for the value it holds.
 */
export function ResolutionBody({ t, f, set, readOnly = false, stack = false }) {
  const hasClass = !!(t.class?.sessionId || t.data?.class_date || t.linked?.session);
  const st = hasClass && t.class?.sessionId ? sessionStats(t.class.sessionId) : null;
  const attendeeCount = Object.keys(t.class?.attendees || {}).length;
  const money = /credit|refund|₹|passed|extended/i.test(String(f.goodwill || ''));
  const ro = v => <p className={cx('res-ro', !String(v || '').trim() && 'empty')}>{String(v || '').trim() || 'not recorded'}</p>;
  const txt = (k, ph, rows = 2) => readOnly ? ro(f[k])
    : <textarea rows={rows} value={f[k] || ''} placeholder={ph} onChange={e => set(k, e.target.value)} />;
  const one = (k, list) => readOnly ? ro(f[k]) : <Pick id={`res-${k}`} label={k} options={list} value={f[k]} onChange={v => set(k, v)} />;
  const inp = (k, ph, type) => readOnly ? ro(f[k])
    : <input type={type || 'text'} value={f[k] || ''} placeholder={ph} onChange={e => set(k, e.target.value)} />;
  return <div className={cx('res-cols', stack && 'stack', readOnly && 'ro')}>
    <div className="res-col">
      <h5>What went wrong</h5>
      <label className="res-f"><span>Category<i className="req" /></span>{one('causeCategory', RES_CAUSE)}</label>
      <label className="res-f"><span>Root cause, in your words<i className="req" /></span>
        {txt('cause', 'The pedal on bike 4 was never torqued to spec — reverse-threaded on the left crank.')}</label>
      <label className="res-f"><span>Whose fix it was</span>{one('responsible', RES_OWNER)}</label>
      {hasClass && <label className="res-f"><span>Class follow-up</span>{one('classFollowUp', RES_CLASS_FOLLOWUP)}</label>}
      {hasClass && st && <div className="res-class">
        <span className="eyebrow">Class snapshot</span>
        <div className="kv"><span className="k">Booked / attended</span><span className="v mono">{st.booked} / {st.attended}</span></div>
        <div className="kv"><span className="k">No-shows</span><span className="v mono">{st.absent ?? '—'}</span></div>
        <div className="kv"><span className="k">Attendees you noted</span><span className="v mono">{attendeeCount}</span></div>
      </div>}
      {t.asset_id && <label className="res-f"><span>Asset left in what state</span>{one('assetCondition', RES_ASSET_CONDITION)}</label>}
      <label className="res-f"><span>Vendor / AMC / invoice reference</span>{inp('vendorRef', 'Quote 2211 · Shree Fitness Services')}</label>
    </div>
    <div className="res-col">
      <h5>What you did, and what the member gets</h5>
      <label className="res-f"><span>Action taken<i className="req" /></span>
        {txt('action', 'Bike 4 out of rotation, pedal re-torqued at 42 N·m, the other nine checked on the same shift.')}</label>
      <div className="res-two">
        <label className="res-f"><span>Outcome</span>{one('outcome', RES_OUTCOME)}</label>
        <label className="res-f"><span>Member follow-up</span>{one('followUp', RES_FOLLOWUP)}</label>
      </div>
      <div className="res-two">
        <label className="res-f"><span>Goodwill</span>{one('goodwill', RES_GOODWILL)}</label>
        {money
          ? <label className="res-f"><span>Amount (₹)</span>{inp('amountINR', '0', 'number')}</label>
          : <div className="res-f ghost"><span>Amount</span><em className="mut xs">only asked for when money or credit moves</em></div>}
      </div>
      <label className="res-f"><span>Prevention / SOP change</span>{one('prevention', RES_PREVENTION)}</label>
      <label className="res-f"><span>Notes for the owner</span>{txt('ownerNotes', 'Cost, warranty, the bit finance will ask for.')}</label>
    </div>
    <div className="res-col">
      <h5>Before it leaves the board</h5>
      <label className="res-f"><span>Evidence attached</span>{one('proof', RES_PROOF)}</label>
      <div className="res-two">
        <label className="res-f"><span>Reopen risk</span>{one('reopenRisk', RES_REOPEN_RISK)}</label>
        <label className="res-f"><span>Verified by</span>{inp('verifiedBy', 'who signed it off')}</label>
      </div>
      <label className="res-f"><span>Closure line<i className="req" /></span>
        {txt('closureNote', 'One sentence the front desk can repeat to a member without opening this ticket.')}</label>
      <div className="res-meta tight">
        <div><span>raised</span><b className="mono">{fmtAt(t.createdAt)}</b></div>
        <div><span>first response</span><b className="mono">{t.firstResponseAt ? fmtDur(t.firstResponseAt - t.createdAt) + ' after' : 'not sent'}</b></div>
        <div><span>resolution due</span><b className="mono">{fmtAt(t.resDueAt)}</b></div>
        <div><span>escalation</span><b className="mono">step {(t.escalation ?? 0) + 1} of {(t.chain || []).length}</b></div>
        <div><span>reports filed</span><b className="mono">×{t.recurrenceCount || 1}</b></div>
      </div>
    </div>
  </div>;
}

/**
 * The rail. Owns its own draft state, seeded from anything already recorded on the ticket, so
 * closing and re-opening the rail does not lose the desk’s typing.
 */
export function ResolutionRail({ t, viewer, org, onSubmit, onOpenWide, onEscalate, onRespond, onViewer, onSaveDraft, onCopyReply, now }) {
  const [draft, setDraft] = useState(() => ({ ...resolutionDraft(t), ...(t.resolution || {}), ...(t.resolutionDraft || {}) }));
  const [savedAt, setSavedAt] = useState(0);
  React.useEffect(() => { setDraft({ ...resolutionDraft(t), ...(t.resolution || {}), ...(t.resolutionDraft || {}) }); }, [t?.id]);
  const set = (k, v) => setDraft(d => ({ ...d, [k]: v }));
  const rights = useMemo(() => resolutionRights(t, viewer, org), [t?.assignee, t?.escalation, viewer?.name, org]);
  const done = ['resolved', 'closed'].includes(t.status);
  const checks = resolutionChecks(draft, t);
  const gaps = resolutionGaps(draft);
  const doneCount = checks.filter(c => c.ok).length;
  const people = useMemo(() => viewerOptions(org), [org]);
  return <section className={cx('rrail', !rights.ok && 'locked', done && 'filed')} aria-label={`Resolution record for ${t.number}`}>
    <header className="rrail-head">
      <div>
        <span className="eyebrow">Resolution{done ? ' · filed' : ''}</span>
        <h4>{t.title || t.subCategory}</h4>
        <span className="mono xs mut">{t.number} · {t.studio}</span>
      </div>
      <Pill p={t.priority} />
    </header>

    <div className="rrail-clock">
      <Countdown t={t} now={now} />
      <div className="sla-second"><Countdown t={t} now={now} mode="res" compact /></div>
    </div>

    <div className={cx('rrail-right', rights.ok ? 'ok' : 'ro')}>
      <span className="rrail-lock"><I s={rights.ok ? svg.check : svg.minus} /></span>
      <div>
        <b>{rights.ok ? 'You may write this record' : 'Read-only for you'}</b>
        <p>{rights.why}</p>
        <p className="mut xs">Owner {rights.owner || 'unassigned'}
          {rights.manager ? ` · reports to ${rights.manager}` : ' · top of this line'}</p>
      </div>
      <label className="rrail-as" data-tip="Sign in as somebody else to see what each role may do with the record."
        title="Who you are looking at this ticket as">
        <span className="xxs mut">view as</span>
        <select value={viewer?.name || ''} onChange={e => {
          const p = people.find(x => x.name === e.target.value);
          if (p && onViewer) onViewer(p);
        }}>
          <option value="">{cleanName(viewer?.name) || 'nobody signed in'}</option>
          {people.slice(0, 14).map(p => <option key={p.name} value={p.name}>{p.name} · {p.role || p.kind}</option>)}
        </select>
      </label>
    </div>

    <div className="rrail-checks">
      <div className="rrail-checks-head"><span className="xs mut">close-out checklist</span>
        <b className="mono">{doneCount}/{checks.length}</b></div>
      <ul>{checks.map(c => <li key={c.id} className={cx('rk', c.ok && 'on')} data-tip={c.hint}>
        <span className="rk-mark">{c.ok ? <I s={svg.check} /> : <I s={svg.minus} />}</span>{c.label}</li>)}</ul>
    </div>

    <ResolutionBody t={t} f={draft} set={set} readOnly={!rights.ok || done} stack />

    <footer className="rrail-foot">
      {rights.ok && !done && <>
        <button className="btn" onClick={() => { setSavedAt(Date.now()); onSaveDraft && onSaveDraft(draft); }}><I s={svg.copy} /> Save draft</button>
        <button className="btn pri" disabled={gaps.length > 0} onClick={() => onSubmit(draft)}><I s={svg.check} /> Record resolution</button>
      </>}
      {(!rights.ok || done) && <button className="btn" onClick={onOpenWide}><I s={svg.expand} /> {done ? 'Read the filed record' : 'Ask the owner to close it'}</button>}
      {!done && rights.ok && <button className="btn ghost" onClick={() => onEscalate && onEscalate(t.id)}><I s={svg.up} /> Escalate</button>}
      {!done && !rights.ok && <button className="btn ghost" onClick={() => onRespond && onRespond(t)}><I s={svg.bolt} /> Nudge the owner</button>}
      <span className="xs mut">{gaps.length ? `still needed: ${gaps.map(g => g[1]).join(', ')}`
        : savedAt ? `draft kept at ${new Date(savedAt).toLocaleTimeString('en-IN', { hour12: false, hour: '2-digit', minute: '2-digit' })}`
        : 'every required field is filled'}</span>
    </footer>

    {(t.timeline || []).some(e => /resolve|reopen/.test(e.kind || '')) && <div className="rrail-audit">
      <span className="xs mut">resolution trail</span>
      {(t.timeline || []).filter(e => /resolve|reopen/.test(e.kind || '')).slice(0, 4).map((e, i) =>
        <div key={i} className={cx('ra', e.kind === 'reopen' && 'bad')}><b className="mono xxs">{fmtAt(e.at)}</b><span>{e.text}</span></div>)}
    </div>}
    {t.resolution && <div className="rrail-filed">
      <span className="xs mut">as filed</span>
      <p>{t.resolution.closureNote || t.resolutionNotes || '—'}</p>
      <div className="kv"><span className="k">Outcome</span><span className="v mono">{t.resolution.outcome}</span></div>
      <div className="kv"><span className="k">Proof</span><span className="v mono">{t.resolution.proof}</span></div>
      <div className="kv"><span className="k">Verified by</span><span className="v mono">{t.resolution.verifiedBy || '—'}</span></div>
      <button className="btn xs" onClick={() => onCopyReply && onCopyReply(t)} data-tip="Three sentences built only from this record — what it was, what was done, what happens next.">
        <I s={svg.copy} /> Copy the reply to the member</button>
    </div>}
  </section>;
}

export default ResolutionRail;
