/* ───────────────────────────────────────────────────────────────────────────────
   Trainer reviews, normalised — the reference app’s `lib/trainer-reviews.ts`, without the database.

   The reference pulls assessments out of two Fillout forms and two Zite apps and files each one as
   a ticket, then aggregates them for the report. This hub already *is* that ticket store: the desk
   records a trainer’s rating, the sentiment behind it, which part of the method it touched and what
   was done on the spot. So the same normalised shape is computed here from what the hub holds —
   one row per review, with a rubric built from the field the desk actually answered.

   Nothing is invented: a review with no rating has `score: null` and is counted under “unscored”
   instead of being smoothed into an average.
   ─────────────────────────────────────────────────────────────────────────────── */
import { fieldLabels } from './core.js';

const clean = v => String(v ?? '').replace(/\s*\(.*?\)\s*/g, ' ').replace(/\s+/g, ' ').trim();
export const num = v => { const n = Number(String(v ?? '').replace(/[^\d.]/g, '')); return Number.isFinite(n) ? n : null; };

/** The reference’s bands, on the same 0–100 scale. */
export const BANDS = [[90, 'Exceptional', 'green'], [80, 'Good', 'green'], [70, 'Average', 'amber'], [60, 'Poor', 'amber'], [0, 'Needs help', 'red']];
export const bandOf = score => (score == null ? { band: 'Unscored', tone: 'grey' }
  : (BANDS.find(([min]) => score >= min) ? (() => { const [, b, t] = BANDS.find(([min]) => score >= min); return { band: b, tone: t }; })() : { band: 'Needs help', tone: 'red' }));

/** The eight sentiments the intake offers, scored once, on the same scale as the bands. */
export const SENTIMENT_SCORE = { 'Very happy': 100, Happy: 88, Neutral: 70, Annoyed: 52, Upset: 38, Angry: 24, 'Would not return': 12, 'Asked for a refund': 18 };
/** Five stars is the primary signal; sentiment adjusts it, and neither alone decides the band. */
export function scoreOf({ rating, sentiment, hasClassIssue }) {
  const r = rating != null && rating > 0 ? (rating / 5) * 100 : null;
  const s = sentiment && SENTIMENT_SCORE[sentiment] != null ? SENTIMENT_SCORE[sentiment] : null;
  if (r == null && s == null) return null;
  let out = r == null ? s : s == null ? r : Math.round(r * 0.7 + s * 0.3);
  if (hasClassIssue) out = Math.min(out, 69);
  return Math.max(0, Math.min(100, out));
}

/** Tickets that say something about a coach — feedback, praise, or a class the trainer ran badly. */
export const isReviewTicket = t => !!(t && (t.data?.trainer || t.data?.trainer_under_review
  || t.category === 'Trainer Feedback' || /trainer/i.test(String(t.subCategory || ''))));

const row = (k, v) => ({ label: fieldLabels[k] || k.replace(/_/g, ' '), value: clean(v) });

/** One review per ticket, in the reference’s shape. */
export function reviewsFrom(tickets = [], name = '') {
  const want = name ? clean(name).toLowerCase() : '';
  const out = [];
  for (const t of tickets || []) {
    if (!isReviewTicket(t)) continue;
    const who = clean(t.data?.trainer_under_review || t.data?.trainer) || clean(t.data?.trainer) || 'Unattributed';
    if (want && clean(who).toLowerCase() !== want) continue;
    const rating = num(t.data?.trainer_rating);
    const sentiment = clean(t.data?.trainer_sentiment);
    const hasClassIssue = ['critical', 'high'].includes(t.priority) || !!t.class?.sessionId
      || /abandon|shortened|unsafe|injur/i.test(String(t.data?.class_disruption || ''));
    const score = scoreOf({ rating, sentiment, hasClassIssue });
    out.push({
      id: t.id, sourceRef: t.number, sourceLabel: `${t.category === 'Trainer Feedback' ? 'Member or desk review' : 'Class record'} · ${clean(t.studio) || 'studio'}`,
      trainer: who, evaluator: clean(t.data?.reporter_name) || clean(t.data?.reviewed_by) || 'Front desk',
      studio: clean(t.studio) || '—', sessionName: clean(t.class?.name || t.data?.class_name || t.subCategory),
      at: t.createdAt, score, ...bandOf(score), unscored: score == null,
      strengths: clean(t.data?.trainer_strengths || (/positive|praise|compliment/i.test(String(t.data?.trainer_feedback_type || '')) ? t.data?.summary : '')),
      improvements: clean(t.data?.trainer_improvements || (score != null && score < 70 ? t.data?.summary : '')),
      coachingPlan: clean(t.data?.trainer_review_cycle || ''), action: clean(t.data?.trainer_action_now || ''),
      method: clean(t.data?.trainer_method_reference || ''), aspect: clean(t.data?.trainer_feedback_type || ''),
      rating, sentiment, priority: t.priority, status: t.status, ticket: t,
      answers: Object.entries(t.data || {}).filter(([, v]) => clean(v)).slice(0, 14).map(([k, v]) => row(k, v)),
    });
  }
  /* createdAt is an ISO string on a ticket, so compare it as a date — `b - a` on strings is NaN and the list silently keeps intake order */
  return out.sort((a, b) => new Date(b.at || 0) - new Date(a.at || 0));
}

/** Rubric attainment: the reference averages score against weightage per category; here the
    category is the field the desk chose, and the weight is how many reviews touched it. */
export function rubricFrom(reviews = []) {
  const m = new Map();
  for (const r of reviews) {
    if (r.score == null) continue;
    const cat = r.aspect || r.method || 'General coaching';
    const cur = m.get(cat) || { category: cat, score: 0, weightage: 0, n: 0 };
    cur.score += r.score; cur.weightage += 100; cur.n++;
    m.set(cat, cur);
  }
  return [...m.values()].map(c => ({
    category: c.category, n: c.n,
    score: Math.round((c.score / c.n) * 10) / 10, weightage: Math.round((c.weightage / c.n) * 10) / 10,
    pct: c.weightage > 0 ? Math.round((c.score / c.weightage) * 100) : 0,
  })).sort((a, b) => a.pct - b.pct || b.n - a.n);
}

/** Everything the report page prints, in one object. */
export function trainerReport(name, tickets = [], dir = null) {
  const reviews = reviewsFrom(tickets, name);
  const scored = reviews.filter(r => r.score != null);
  const avgScore = scored.length ? Math.round(scored.reduce((n, r) => n + r.score, 0) / scored.length) : null;
  const trajectory = scored.slice().sort((a, b) => new Date(a.at || 0) - new Date(b.at || 0))
    .map(r => ({ at: r.at, score: r.score, ref: r.sourceRef }));
  const delta = trajectory.length > 1 ? trajectory[trajectory.length - 1].score - trajectory[0].score : 0;
  const rubric = rubricFrom(reviews);
  const needs = reviews.filter(r => (r.score != null && r.score < 70) || ['critical', 'high'].includes(r.priority) || r.status !== 'resolved')
    .slice(0, 6);
  /* A block of the method is judged on its own average across every review that named it — the
     same block can be praised in one assessment and flagged in another, and that is one number, not two. */
  const blocks = new Map();
  for (const r of reviews) {
    const k = r.aspect || r.method;
    if (!k) continue;
    const cur = blocks.get(k) || { label: k, n: 0, score: 0, scored: 0 };
    cur.n++;
    if (r.score != null) { cur.score += r.score; cur.scored++; }
    blocks.set(k, cur);
  }
  const judged = [...blocks.values()].filter(x => x.scored)
    .map(x => ({ label: x.label, n: x.n, scored: x.scored, avg: Math.round(x.score / x.scored) }));
  const strengths = judged.filter(x => x.avg >= 80).sort((a, c) => c.avg - a.avg);
  const levers = judged.filter(x => x.avg < 80).sort((a, c) => a.avg - c.avg);
  const evaluators = new Map(); const studios = new Map();
  for (const r of reviews) {
    const e = evaluators.get(r.evaluator) || { name: r.evaluator, n: 0, score: 0 };
    e.n++; e.score += r.score == null ? 0 : r.score; evaluators.set(r.evaluator, e);
    const st = studios.get(r.studio) || { name: r.studio, n: 0, score: 0, open: 0 };
    st.n++; st.score += r.score == null ? 0 : r.score; if (r.status !== 'resolved') st.open++;
    studios.set(r.studio, st);
  }
  return {
    trainer: clean(name) || '—', reviews, scored, avgScore, ...bandOf(avgScore),
    unscored: reviews.length - scored.length, trajectory, delta, rubric, needs,
    strengths, levers,
    evaluators: [...evaluators.values()].map(x => ({ ...x, avg: x.n ? Math.round(x.score / x.n) : 0 })).sort((a, b) => b.n - a.n),
    studiosM: [...studios.values()].map(x => ({ ...x, avg: x.n ? Math.round(x.score / x.n) : 0 })).sort((a, b) => b.n - a.n),
    sentiment: reviews.reduce((m, r) => (m[r.sentiment || 'not recorded'] = (m[r.sentiment || 'not recorded'] || 0) + 1, m), {}),
    actions: reviews.reduce((m, r) => (m[r.action || 'nothing recorded'] = (m[r.action || 'nothing recorded'] || 0) + 1, m), {}),
    cycles: reviews.reduce((m, r) => (m[r.coachingPlan || 'none asked'] = (m[r.coachingPlan || 'none asked'] || 0) + 1, m), {}),
    dir,
  };
}

/** A weekly line for the managers’ thread, in the reference’s voice: number, band, one lever. */
export function reviewDigest(rep) {
  const worst = rep.levers[0];
  return [
    `${rep.trainer} · ${rep.scored.length} scored review${rep.scored.length === 1 ? '' : 's'}`
      + (rep.avgScore != null ? ` · average ${rep.avgScore}/100 (${rep.band})` : ' · nothing scored yet')
      + (rep.delta ? ` · ${rep.delta > 0 ? '+' : ''}${rep.delta} across the window` : ''),
    rep.unscored ? `${rep.unscored} review${rep.unscored === 1 ? '' : 's'} carry a comment but no score — the form asks for one.` : '',
    worst ? `Weakest block: ${worst.label} — ${worst.avg}/100 across ${worst.scored} scored of ${worst.n} that named it.` : 'No block stands out as weak.',
    rep.needs.length ? `Open now: ${rep.needs.length} ticket${rep.needs.length === 1 ? '' : 's'}, ${rep.needs.filter(r => r.status !== 'resolved').length} still moving.` : '',
  ].filter(Boolean).join('\n');
}

export default { reviewsFrom, rubricFrom, trainerReport, reviewDigest, bandOf, scoreOf, isReviewTicket, BANDS, SENTIMENT_SCORE };
