/* ───────────────────────────────────────────────────────────────────────────────
   Writing the report in words, not fragments.

   The desk fills a form of 20–48 questions; the owner should not have to re-read all of them to
   know what happened. This module turns the same answers into a paragraph — plain, specific, and
   strictly limited to what was actually recorded — and sends it to OpenAI only when a key exists
   on this device. Without a key nothing here reaches the network: src/core.js `narrate()` already
   produces a deterministic line from the same facts, and that stays the fallback everywhere.

   The reference app calls the model server-side with `credentials('chatgpt')`. This hub is a
   static build, so the key is held in localStorage, never committed, and the request goes straight
   to api.openai.com. That trade-off is stated in Settings rather than hidden.
   ─────────────────────────────────────────────────────────────────────────────── */
import { fieldLabels, narrativeOf, ticketLabel } from './core.js';

export const AI_STORE = 'p57.hub.v1.openai';
export const AI_MODELS = ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini'];
const ENDPOINT = 'https://api.openai.com/v1/chat/completions';

export function readKey() {
  let v = '';
  try { v = localStorage.getItem(AI_STORE) || ''; } catch { /* private mode */ }
  if (!v) { try { v = (import.meta.env && import.meta.env.VITE_OPENAI_API_KEY) || ''; } catch { /* no env */ } }
  return String(v || '').trim();
}
export function writeKey(k) {
  const v = String(k || '').trim();
  try { if (v) localStorage.setItem(AI_STORE, v); else localStorage.removeItem(AI_STORE); } catch { /* ignore */ }
  return v;
}
export const aiReady = (key = readKey()) => /^sk-[A-Za-z0-9_-]{16,}/.test(String(key || '').trim());
/** Never print a key back: Settings shows the head and tail only. */
export const maskKey = k => { const s = String(k || ''); return s.length < 12 ? (s ? '••••' : '') : `${s.slice(0, 6)}…${s.slice(-4)}`; };

const clean = v => String(v ?? '').replace(/\s+/g, ' ').trim();
const MAX_FACT = 90;

/**
 * The facts the model is allowed to use. Deliberately dull: one labelled line per answer, so a
 * hallucination would have to invent something that was never asked about.
 */
export function factsOf(t, labels = fieldLabels) {
  const L = labels || fieldLabels;
  const rows = [];
  const push = (k, v) => { const s = clean(v); if (s) rows.push(`${L[k] || k}: ${s.slice(0, MAX_FACT)}`); };
  push('studio', t.studio);
  push('category', t.category);
  push('sub_category', t.subCategory || t.label);
  push('priority', (t.priority || '').toUpperCase());
  push('status', t.status);
  push('area', t.data?.area);
  push('member', [t.data?.member_name, t.data?.member_id && `Momence #${t.data.member_id}`].filter(Boolean).join(' · '));
  push('reporter', [t.data?.reporter_name, t.data?.reporter_contact].filter(Boolean).join(' · '));
  if (t.class?.name) push('class', [t.class.name, t.class.when, t.class.sessionId && `session #${t.class.sessionId}`].filter(Boolean).join(' · '));
  if (Array.isArray(t.class?.attendees) && t.class.attendees.length) {
    push('attendee_notes', t.class.attendees.map(a => [a.name, a.status, (a.tags || []).join('/'), a.note, a.action]
      .filter(Boolean).join(' — ')).slice(0, 6).join(' | '));
  }
  if (t.asset_id) push('asset', [t.asset_id, t.data?.asset_type, t.data?.asset_condition].filter(Boolean).join(' · '));
  push('what_happened', t.data?.summary || t.summary);
  push('title', t.title);
  if (t.linked) push('linked_records', Object.entries(t.linked).filter(([, v]) => v).map(([k, v]) => `${k}=${typeof v === 'object' ? (v.label || v.id) : v}`).join(', '));
  push('repeats', (t.recurrenceCount || 1) > 1 ? `this is report #${t.recurrenceCount} for the same fault` : 'first time reported');
  push('workaround_tried', t.data?.workaround || t.data?.last_restart);
  push('requested_outcome', t.data?.requested_outcome);
  push('first_response_due', t.slaLabel);
  if (t.chain?.length) push('routing', t.chain.map((c, i) => `L${i} ${clean(c.who)} (${clean(c.note)})`).join(' → '));
  return rows;
}

/** The brief. Two hard rules: 150–220 words of prose, and no fact that is not in the list above. */
export function promptFor(t, labels = fieldLabels) {
  const facts = factsOf(t, labels);
  const short = narrativeOf(t);
  return [
    'You write the internal incident record for Physique 57 India, a boutique fitness studio group in Mumbai.',
    'Your reader is the person who inherits this ticket at the next shift, and, in a follow-up email, the member.',
    '',
    'Write 150 to 220 words of plain English prose in three or four paragraphs, no markdown, no headings, no bullet points, no invented names, numbers, times or causes.',
    'Cover, in order: what happened and where; who it affected and how badly; what the desk has already done or is waiting on; what the next shift must do and by when.',
    'Use the exact wording of the facts below for anything named. If a fact is missing, leave that topic out instead of guessing.',
    'Never restate the ticket number or repeat the label as a heading. Start with the situation.',
    '',
    `Short line already on the board (do not copy it): ${short}`,
    'Facts:',
    ...facts.map(f => `- ${f}`),
  ].join('\n');
}

async function post(body, { key, signal } = {}) {
  const r = await fetch(ENDPOINT, {
    method: 'POST', signal,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key || readKey()}` },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* a proxy or a login page answered */ }
  if (!r.ok) {
    const m = json?.error?.message || text.slice(0, 140);
    throw new Error(`OpenAI ${r.status} — ${m || 'no message'}`);
  }
  return json;
}

const tidy = s => String(s || '').replace(/\s+/g, ' ').replace(/^[\"'“”]+|[\"'“”]+$/g, '').trim();

/** The paragraph for one ticket. Resolves {ok:false} rather than throwing, so a cold network never
    eats the desk’s form data. */
export async function narrateTicket(t, { key, model = AI_MODELS[0], signal, maxTokens = 430 } = {}) {
  const k = key ?? readKey();
  if (!aiReady(k)) return { ok: false, error: 'No OpenAI key on this device — the local write-up is used instead.', used: 'local' };
  const t0 = Date.now();
  try {
    const json = await post({
      model, temperature: 0.4, max_tokens: maxTokens,
      messages: [{ role: 'user', content: promptFor(t) }],
    }, { key: k, signal });
    const text = tidy(json?.choices?.[0]?.message?.content || '');
    if (!text) throw new Error('the model returned an empty completion');
    return { ok: true, text, words: text.split(/\s+/).length, model, ms: Date.now() - t0,
      usage: json.usage ? `${json.usage.prompt_tokens}+${json.usage.completion_tokens} tok` : '' };
  } catch (e) {
    return { ok: false, error: String(e && e.message || e).slice(0, 200), model, ms: Date.now() - t0 };
  }
}

/** A second opinion on priority and next step, for the queue’s triage hint. Same fact list. */
export async function triageAdvice(t, { key, model = AI_MODELS[0], signal } = {}) {
  const k = key ?? readKey();
  if (!aiReady(k)) return { ok: false, error: 'No OpenAI key on this device.', used: 'local' };
  const facts = factsOf(t);
  const brief = [
    'You are the duty operations manager for Physique 57 India. From the facts below answer in exactly three short lines:',
    '1. Priority, one of CRITICAL / HIGH / MEDIUM / LOW, then a 12-word reason.',
    '2. The single next action, with who should do it.',
    '3. What to tell the member, in one sentence a front-desk associate can read aloud.',
    'No preamble, no markdown. Do not invent facts.',
    '', ...facts.map(f => `- ${f}`),
  ].join('\n');
  try {
    const json = await post({ model, temperature: 0.2, max_tokens: 220, messages: [{ role: 'user', content: brief }] }, { key: k, signal });
    const raw = String(json?.choices?.[0]?.message?.content || '');
    if (!raw.trim()) throw new Error('empty completion');
    /* split before the whitespace is flattened, or the three lines arrive as one */
    const lines = raw.split(/\r?\n/).map(l => tidy(l.replace(/^\s*(?:\d+\s*[.)]\s*|[-*]\s*)/, ''))).filter(Boolean);
    const text = lines.join(' ');
    const prio = (lines[0] || '').match(/CRITICAL|HIGH|MEDIUM|LOW/i);
    return { ok: true, priority: prio ? prio[0].toLowerCase() : '', lines, text, model,
      words: text.split(/\s+/).length, ms: 0 };
  } catch (e) {
    return { ok: false, error: String(e && e.message || e).slice(0, 200) };
  }
}

/** A one-line reply to the member, from the resolution record — the thing the desk is worst at. */
export function memberReplyDraft(t) {
  const r = t.resolution || {};
  const who = clean(t.data?.member_name) || 'there';
  const where = clean(t.studio) || 'the studio';
  const what = clean(t.subCategory) || clean(t.label) || 'what you reported';
  const parts = [
    `Hi ${who}, this is ${clean(t.data?.reporter_name) || 'the team'} at Physique 57 ${where}.`,
    `You raised “${what}”${t.data?.occurred_at ? ` around ${new Date(t.data.occurred_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}` : ''}.`,
    r.cause ? `Here is what it was: ${clean(r.cause)}.` : 'We have it logged and the right person is on it.',
    r.action ? `What we did: ${clean(r.action)}` : '',
    /credit|refund|₹/i.test(String(r.goodwill || '')) ? `As agreed, ${clean(r.goodwill)}${r.amountINR ? ` of ₹${r.amountINR}` : ''} has been applied to your account.` : '',
    r.closureNote ? `In short: ${clean(r.closureNote)}` : '',
    'Reply to this message if anything still looks off and we will pick it straight up.',
  ].filter(Boolean);
  return parts.join(' ').replace(/\s+/g, ' ');
}

export const ticketLine = t => ticketLabel(t);
export default { aiReady, readKey, writeKey, maskKey, narrateTicket, triageAdvice, memberReplyDraft, promptFor, factsOf };
