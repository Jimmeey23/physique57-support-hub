/* ───────────────────────────────────────────────────────────────────────────────
   The Momence action centre, ported from the reference app’s `momence-action-center.tsx`.

   Same four things a desk can actually do for a member on the spot — put class credits back, freeze
   or extend a membership, swap the trainer on the next class, leave a note — and the same rule the
   reference follows: no invented member. If the ticket carries no Momence member, the panel says so
   instead of offering to credit somebody who does not exist.

   A browser cannot hold a Momence secret, so nothing here is posted. Each action produces a
   *receipt*: the payload, the endpoint that would take it (verbatim from src/momence.js’s
   ENDPOINTS table) and a `pending` marker. The receipt rides on the ticket, so the next shift sees
   what was promised whether or not the API ever got it.
   ─────────────────────────────────────────────────────────────────────────────── */
import React, { useMemo, useState } from 'react';
import svg, { I } from './icons.jsx';
import { cx, fmtAt } from './ui.jsx';
import { ENDPOINTS, detailMomence, populateMember, readOnlyNotice, studios as STUDIO_LIST, trainers as TRAINERS } from './momence.js';
import { cleanName } from './org.js';

export const CREDIT_REASONS = ['AC / facility disruption', 'Class cancelled late', 'Equipment failure during the class',
  'Overbooked and turned away', 'Coach absent, guest stood in', 'Member was injured', 'Goodwill after a complaint'];
export const FREEZE_REASONS = ['Medical / injury', 'Travel or relocation', 'Household situation', 'Studio closed for works', 'Dispute under review'];
export const FREEZE_TYPES = ['now', 'scheduled', 'before_renewal'];
const rid = () => 'rcp_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

/* How a draft moves once it exists. Nothing in the hub can push it — the desk marks the row when
   somebody with the key does, so the state on the ticket stays honest either way. */
export const RECEIPT_STATES = ['pending', 'queued', 'synced', 'rejected'];

/** The four actions, with the fields each one needs and the endpoint that would take it. */
export function actionList(hasMember, hasClass) {
  return [
    { id: 'credit', label: 'Give the class credits back', icon: svg.card, kind: 'member', needs: hasMember,
      endpoint: ENDPOINTS.credits, hint: 'The bought-membership row is read first, so the credit lands on the pack it came from.',
      fields: [{ id: 'count', label: 'How many classes', type: 'number', def: 1, min: 1, max: 12 },
        { id: 'reason', label: 'Reason on the account', type: 'select', def: CREDIT_REASONS[0], options: CREDIT_REASONS },
        { id: 'both', label: 'Which ledger', type: 'select', def: 'Class credits', options: ['Class credits', 'Money credit (₹)', 'Both'] },
        { id: 'amount', label: 'Money credit (₹)', type: 'number', def: 0, showIf: v => /money|both/i.test(String(v.both || '')) }] },
    { id: 'freeze', label: 'Freeze or extend the membership', icon: svg.clock, kind: 'member', needs: hasMember,
      endpoint: ENDPOINTS.freeze, hint: 'Freeze types and the renewal flag follow the schema: not_set · now · scheduled · before_renewal.',
      fields: [{ id: 'days', label: 'Days', type: 'number', def: 7, min: 1, max: 180 },
        { id: 'when', label: 'Freeze type', type: 'select', def: 'now', options: FREEZE_TYPES },
        { id: 'reason', label: 'Reason', type: 'select', def: FREEZE_REASONS[0], options: FREEZE_REASONS }] },
    { id: 'substitute', label: 'Put another coach on the next class', icon: svg.whistle, kind: 'session', needs: hasClass,
      endpoint: ENDPOINTS.sessions, hint: 'Only names already on the roster are offered, and the class is the one the ticket is about.',
      fields: [{ id: 'trainer', label: 'Standing in', type: 'select', def: TRAINERS[0] || '', options: TRAINERS },
        { id: 'which', label: 'Which class', type: 'select', def: 'Next one on the schedule',
          options: ['Next one on the schedule', 'The class this ticket is about', 'Every class this week'] },
        { id: 'tell', label: 'Tell the members', type: 'select', def: 'Yes — app notice and a desk call',
          options: ['Yes — app notice and a desk call', 'App notice only', 'Not yet'] }] },
    { id: 'note', label: 'Leave a note on the member', icon: svg.clip, kind: 'member', needs: hasMember,
      endpoint: ENDPOINTS.notes, hint: 'Notes are read back into the next ticket the desk raises about this person.',
      fields: [{ id: 'text', label: 'What the next shift should know', type: 'textarea', def: '' },
        { id: 'tag', label: 'Tag on the account', type: 'select', def: 'follow-up', options: ['follow-up', 'vip', 'injury', 'refund-risk', 'none'] }] },
  ];
}

/**
 * The receipts the desk has already drafted, plus the read of the member behind them.
 * `onApply(receipt)` is the only write — the hub owns the ticket, Momence owns the account.
 */
export function MomenceActions({ t, onApply, onCopy, now }) {
  const memberId = t?.linked?.member?.id || t?.data?.member_id || null;
  const read = useMemo(() => (memberId ? (() => {
    const det = detailMomence('members', String(memberId));
    return det && !det.error ? { ok: true, det, brief: populateMember(det, { contextOnly: true }) } : { ok: false, error: det?.error || 'unread' };
  })() : null), [memberId, t?.id]);
  const hasMember = !!memberId && !!read?.ok;
  const hasClass = !!(t?.class?.sessionId || t?.linked?.session);
  const actions = actionList(hasMember, hasClass);
  const [open, setOpen] = useState('credit');
  const [vals, setVals] = useState(() => Object.fromEntries(actions.map(a => [a.id, Object.fromEntries(a.fields.map(f => [f.id, f.def]))])));
  const receipts = t?.actions || [];
  const set = (a, k, v) => setVals(s => ({ ...s, [a]: { ...s[a], [k]: v } }));
  const visible = a => a.fields.filter(f => !f.showIf || f.showIf(vals[a.id] || {}));
  const done = receipts.filter(r => r.status !== 'void');

  return <section className="mact" aria-label="Momence actions for this ticket">
    <header className="mact-head">
      <div><span className="eyebrow"><I s={svg.plug} /> Momence · what the desk can do now</span>
        <p className="xs mut">{readOnlyNotice}</p></div>
      {hasMember && <span className="chip mono ok"><I s={svg.user} /> {read.brief.member_name || `#${memberId}`}</span>}
      {!hasMember && <span className="chip mono"><I s={svg.warn} /> no member on this ticket</span>}
    </header>

    {hasMember && <div className="mact-profile">
      {[
        [[read.brief.member_id && `Momence #${read.brief.member_id}`, read.brief.member_email].filter(Boolean).join(' · ') || 'no member record on this ticket', 'member'],
        [read.brief.membership || 'no active pack', 'membership'],
        [read.brief.memberCreditsLeft || 'credits not readable', 'credits left'],
        [read.brief.memberExpiry || 'no expiry on file', 'renews'],
        [read.brief.memberHomeStudio || 'no home studio', 'home studio'],
        [read.brief.memberHistory || 'no history', 'history']
      ].map(([v, k]) => <div key={k}><span>{k}</span><b className="mono xxs">{v}</b></div>)}
      {read.brief.memberTags && <div><span>tags</span><b className="mono xxs">{read.brief.memberTags}</b></div>}
      {read.det?.related?.notes?.length > 0 && <div><span>last note</span><b className="xxs">{String(read.det.related.notes[0]?.body || read.det.related.notes[0]?.text || '—').slice(0, 90)}</b></div>}
    </div>}

    {!memberId && <p className="mact-none"><I s={svg.warn} /> Nothing here can be applied until a member is linked on the
      form — the hub will not credit an invented account.</p>}

    <div className="mact-list">{actions.map(a => {
      const on = open === a.id;
      return <div key={a.id} className={cx('mxa', on && 'open', !a.needs && 'off')}>
        <button type="button" className="mxa-h" onClick={() => setOpen(on ? '' : a.id)} disabled={!a.needs}
          title={a.needs ? a.hint : 'Needs a linked member first'}>
          <span className="mxa-ic"><I s={a.icon} /></span>
          <b>{a.label}</b>
          <em className="xxs mut">{a.needs ? a.hint : a.kind === 'session' ? 'needs a class on the ticket' : 'needs a member linked on the ticket'}</em>
          <span className="mxa-chev"><I s={on ? svg.minus : svg.plus} /></span>
        </button>
        {on && a.needs && <div className="mxa-b">
          {visible(a).map(f => <label className="mxf" key={f.id}>
            <span>{f.label}</span>
            {f.type === 'select'
              ? <select value={vals[a.id][f.id]} onChange={e => set(a.id, f.id, e.target.value)}>{f.options.map(o => <option key={o}>{o}</option>)}</select>
              : f.type === 'textarea'
                ? <textarea rows={3} value={vals[a.id][f.id]} placeholder="Two lines, in the words you would use at the desk." onChange={e => set(a.id, f.id, e.target.value)} />
                : <input type={f.type} min={f.min} max={f.max} value={vals[a.id][f.id]} onChange={e => set(a.id, f.id, e.target.value)} />}</label>)}
          <div className="mxa-f">
            <code className="xxs">{a.endpoint}</code>
            <button className="btn sm pri" onClick={() => onApply && onApply({
              id: rid(), action: a.id, targetType: a.kind, targetId: a.kind === 'session' ? String(t.class?.sessionId || '') : String(memberId || ''),
              targetName: a.kind === 'session' ? (t.class?.name || 'the class') : (read.brief.member_name || `Member #${memberId}`),
              summary: `${a.label} — ${visible(a).map(f => `${f.label.toLowerCase()} ${vals[a.id][f.id] || '—'}`).join(' · ')}`,
              details: { ...vals[a.id] }, performedAt: new Date().toISOString(), performedBy: cleanName(t.assignee) || 'desk',
              status: 'pending', momenceRef: `${a.id}:${t.number || 'draft'}`, ticket: t.number || '',
            })}><I s={svg.check} /> Draft it on the ticket</button>
          </div>
        </div>}
      </div>;
    })}</div>

    {done.length > 0 && <div className="mact-book">
      <div className="mact-book-h"><span className="eyebrow">Drafted on this ticket</span>
        <b className="mono xxs">{done.length} receipt{done.length === 1 ? '' : 's'}</b></div>
      <div className="mact-key">{RECEIPT_STATES.map(st => <span className={cx('mxs', st)} key={st}>{st}</span>)}</div>
      {done.slice(0, 6).map(r => <div className="mxr" key={r.id}>
        <span className={cx('mxs', r.status)}>{r.status}</span>
        <div><b>{r.summary}</b>
          <em className="xxs mono">{r.targetName || r.targetId} · {r.performedBy} · {fmtAt(new Date(r.performedAt).getTime())} · ref {r.momenceRef}</em></div>
        {onCopy && <button className="btn ghost sm" onClick={() => onCopy(r)} data-tip="Payload, endpoint and reference, as plain text"><I s={svg.copy} /> Copy</button>}
      </div>)}
      <p className="xxs mut">Applying one of these in production is a single call each — the payload above is the body.
        Until then the promise lives where the next shift will read it.</p>
    </div>}
    {now && <p className="xxs mut mact-now">Read at {new Date(now).toLocaleTimeString('en-IN', { hour12: false, hour: '2-digit', minute: '2-digit' })} IST against the demo dataset.</p>}
  </section>;
}

/** The plain-text form of a receipt — for WhatsApp, or the body of the email to the member. */
export function receiptText(r) {
  return [`Momence action · ${r.action}`, `Ticket: ${r.ticket}`, `Applied to: ${r.targetName}${r.targetId ? ` (#${r.targetId})` : ''}`,
    r.summary, `Drafted by ${r.performedBy} at ${fmtAt(new Date(r.performedAt).getTime())}`, `Status: ${r.status} · ref ${r.momenceRef}`]
    .filter(Boolean).join('\n');
}

export default MomenceActions;
