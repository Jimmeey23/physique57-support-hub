/* ───────────────────────────────────────────────────────────────────────────────
   The trainer’s report — the reference app’s `trainer-report.tsx`, eight numbered sections,
   rebuilt on the hub’s own primitives and driven by src/assessments.js.

   It reads as a document, not a dashboard: what needs attention first, then the trajectory, then
   the rubric that produced it, then the notes themselves. Every section links back to the ticket it
   was computed from, so a manager can go from “72, Average” to the member’s words in one click.
   ─────────────────────────────────────────────────────────────────────────────── */
import React, { useState } from 'react';
import svg, { I } from './icons.jsx';
import { cx, Avatar, fmtAt } from './ui.jsx';
import { reviewDigest } from './assessments.js';
import { FormHost } from './embed.jsx';

const tone = t => (t === 'green' ? 'var(--ok)' : t === 'amber' ? 'var(--high)' : t === 'red' ? 'var(--crit)' : 'var(--mut)');
const scoreColor = v => (v >= 80 ? 'var(--ok)' : v >= 65 ? 'var(--high)' : 'var(--crit)');

function Section({ index, title, subtitle, action, children }) {
  return <section className="tr-sect">
    <header className="tr-head">
      <div className="tr-idx mono">{index}</div>
      <div className="tr-tt"><h4>{title}</h4>{subtitle && <p className="xs mut">{subtitle}</p>}</div>
      {action && <div className="tr-act">{action}</div>}
    </header>
    <div className="tr-body">{children}</div>
  </section>;
}

const bar = (label, pct, value, color) => <div className="tr-bar" key={label} title={`${label} · ${pct}%`}>
  <span className="lb">{label}</span>
  <span className="bt"><i style={{ width: `${Math.max(2, Math.min(100, pct))}%`, background: color || undefined }} /></span>
  <b className="mono">{value}</b></div>;

export function TrainerReport({ rep, onOpen, onRaise, overrides, now }) {
  const [sel, setSel] = useState(null);
  const picked = rep.reviews.find(r => r.id === sel) || rep.scored[0] || rep.reviews[0] || null;
  const mx = Math.max(1, ...rep.trajectory.map(p => p.score));
  const digest = reviewDigest(rep);
  return <div className="tr-report">
    <header className="tr-top">
      <Avatar name={rep.trainer} size={44} />
      <div className="tr-id">
        <span className="eyebrow">Trainer report · {rep.reviews.length} review{rep.reviews.length === 1 ? '' : 's'} on file</span>
        <h3>{rep.trainer}</h3>
        <p className="xs mut">{rep.dir?.studios?.join(', ') || 'across the studios this coach is rostered at'}</p>
      </div>
      <div className="tr-score">
        <b className="mono" style={{ color: scoreColor(rep.avgScore ?? 0) }}>{rep.avgScore ?? '—'}</b>
        <span className="xxs" style={{ color: tone(rep.tone) }}>{rep.band}</span>
        <em className="xxs mut">{rep.scored.length} scored{rep.unscored ? ` · ${rep.unscored} without a score` : ''}</em>
      </div>
      {onRaise && <button className="btn sm soft" onClick={() => onRaise(rep.trainer)}><I s={svg.plus} /> Log feedback about {rep.trainer.split(' ')[0]}</button>}
    </header>

    <pre className="tr-digest">{digest}</pre>

    <Section index="01" title="What needs attention" subtitle="Derived from the assessments and feedback on file — nothing here is a guess">
      {rep.needs.length ? <ul className="tr-needs">{rep.needs.map(r => <li key={r.id}>
        <span className={cx('nb', r.priority)} />
        <div><b>{r.sourceRef} · {r.sessionName || r.aspect || 'a class'}</b>
          <em className="xs mut">{r.score != null ? `${r.score}/100` : 'unscored'} · {r.evaluator} · {fmtAt(r.at)}{r.action ? ` · ${r.action}` : ''}</em>
          {r.improvements && <p className="xs">{r.improvements}</p>}</div>
        {onOpen && <button className="btn xs ghost" onClick={() => onOpen(r.id)}>Open ticket</button>}
      </li>)}</ul> : <p className="empty">Nothing open against this name. The last {rep.scored.length} review{rep.scored.length === 1 ? '' : 's'} closed clean.</p>}
    </Section>

    <Section index="02" title="Score trajectory" subtitle="Weighted result per assessment · pick a point to load its notes below"
      action={<span className="chip mono xs">{rep.delta ? `${rep.delta > 0 ? '+' : ''}${rep.delta} over the window` : 'no movement yet'}</span>}>
      {rep.trajectory.length ? <div className="tr-traj">{rep.trajectory.map((p, i) =>
        <button key={`${p.at}-${i}`} className={cx('tp', picked && picked.sourceRef === p.ref && 'on')} onClick={() => setSel(p.ref)}
          title={`${p.ref} · ${p.score}/100 · ${fmtAt(p.at)}`}>
          <i style={{ height: `${8 + 84 * (p.score / mx)}%`, background: scoreColor(p.score) }} /><em className="xxs mono">{p.score}</em>
        </button>)}</div>
        : <p className="empty">One scored review is not a trajectory. There are {rep.scored.length}.</p>}
    </Section>

    <Section index="03" title="Rubric attainment" subtitle="Averaged per block of the method, weakest first — the block, the marks, and how many reviews it rests on">
      {rep.rubric.length ? <div className="tr-rub">{rep.rubric.map(r =>
        bar(r.category, r.pct, `${r.score}/${r.weightage} · ${r.n}×`, scoreColor(r.pct)))}</div>
        : <p className="empty">No rubric rows yet — they come from the “what part of the method” answer on the feedback form.</p>}
    </Section>

    {picked && <Section index="04" title="Coaching notes" subtitle={`As recorded on ${picked.sourceRef}`}>
      <div className="tr-notes">
        {[['What went well', picked.strengths], ['What to change', picked.improvements],
          ['Plan for the next cycle', picked.coachingPlan], ['Done on the day', picked.action],
          ['Method block', picked.method], ['Mood of the room', picked.sentiment]].map(([k, v]) =>
          <div className="tn" key={k}><span>{k}</span><b className={cx(!v && 'mut')}>{v || 'not recorded'}</b></div>)}
      </div>
      {picked.answers.length > 0 && <details className="tr-ans"><summary className="xs mut">The {picked.answers.length} answers this was built from</summary>
        <ul>{picked.answers.map(a => <li key={a.label}><span className="xxs mut">{a.label}</span><b>{a.value}</b></li>)}</ul></details>}
    </Section>}

    <Section index="05" title="Recurring strengths and levers" subtitle="Averaged across every review on file · weakest first">
      <div className="tr-two">
        <div><span className="eyebrow">Strengths</span>
          {rep.strengths.length ? rep.strengths.slice(0, 5).map(s => bar(s.label, s.avg, `${s.avg}`, 'var(--ok)'))
            : <p className="empty xs">No block has crossed 80 yet.</p>}</div>
        <div><span className="eyebrow">Levers</span>
          {rep.levers.length ? rep.levers.slice(0, 5).map(s => bar(s.label, s.avg, `${s.avg}`, 'var(--high)'))
            : <p className="empty xs">Nothing is dragging.</p>}</div>
      </div>
    </Section>

    <Section index="06" title="Assessment history" subtitle="Every review that named this coach, newest first">
      {rep.reviews.length ? <table className="tr-hist"><thead><tr><th>Ref</th><th>When</th><th>By</th><th>Studio</th>
        <th>Rating</th><th>Mood</th><th className="n">Score</th><th>Band</th></tr></thead><tbody>
        {rep.reviews.slice(0, 14).map(r => <tr key={r.id} onClick={() => setSel(r.id)} className={cx(picked?.id === r.id && 'on')}>
          <td className="mono">{r.sourceRef}</td><td className="mono xs">{fmtAt(r.at)}</td><td>{r.evaluator}</td><td>{r.studio}</td>
          <td className="mono">{r.rating != null ? `${r.rating}/5` : '—'}</td><td className="xs">{r.sentiment || '—'}</td>
          <td className="n mono" style={{ color: scoreColor(r.score ?? 0) }}>{r.score ?? '—'}</td>
          <td><span className="tband" style={{ borderColor: tone(r.tone), color: tone(r.tone) }}>{r.band}</span></td>
        </tr>)}</tbody></table> : <p className="empty">Nothing has been filed about this coach inside the window.</p>}
    </Section>

    <Section index="07" title="Evaluator and studio breakdown" subtitle="Who is assessing this trainer, and where">
      <div className="tr-two">
        <div><span className="eyebrow">Evaluators</span>
          {rep.evaluators.length ? rep.evaluators.slice(0, 6).map(e => bar(e.name, e.avg, `${e.n} · ${e.avg}`, 'var(--brand)'))
            : <p className="empty xs">no evaluators recorded</p>}</div>
        <div><span className="eyebrow">Studios</span>
          {rep.studiosM.length ? rep.studiosM.slice(0, 6).map(e => bar(e.name, e.avg, `${e.n} · ${e.open} open`, 'var(--accent)'))
            : <p className="empty xs">no studios recorded</p>}</div>
      </div>
    </Section>

    <Section index="08" title="Member feedback and compliments" subtitle="Everything logged against this trainer outside a formal assessment">
      <div className="tr-sent">{Object.entries(rep.sentiment).sort((a, b) => b[1] - a[1]).map(([k, v]) =>
        <span className="chip" key={k}>{k} <b className="mono">{v}</b></span>)}</div>
      <div className="tr-acts-row">{Object.entries(rep.actions).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) =>
        <span className="chip xs" key={k}>done: {k} <b className="mono">{v}</b></span>)}</div>
      <div className="tr-acts-row">{Object.entries(rep.cycles).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) =>
        <span className="chip xs" key={k}>cycle: {k} <b className="mono">{v}</b></span>)}</div>
    </Section>

    <FormHost id="trainer-qa" overrides={overrides} tight title="Add a training-quality assessment" />
  </div>;
}

export default TrainerReport;
