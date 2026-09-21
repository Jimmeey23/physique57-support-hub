/* ───────────────────────────────────────────────────────────────────────────────
   Fillout forms, embedded — ported from the reference app’s `fillout-embed.tsx`.

   Both Fillout runtimes work the same way: their script scans the document for a `data-*` host
   element when it executes. So switching forms has to re-run the script, and “ready” can only mean
   *the iframe is in the host* — never “the script file downloaded”. A form with no id configured
   does not load a script at all: it says what is missing and hands over the direct link instead.

   Everything here degrades quietly offline. The hub is a static build with no server to hold
   keys, so an embed that cannot reach fillout.com shows its skeleton, then a slower note, then the
   link — never a blank box the desk has to stare at.
   ─────────────────────────────────────────────────────────────────────────────── */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import svg, { I } from './icons.jsx';
import { cx } from './ui.jsx';

export const EMBED_SRC = {
  'fillout-v1': 'https://server.fillout.com/embed/v1/',
  'zite-v2': 'https://server.fillout.com/embed/v2-zite/',
};

/** The four forms the studio runs, in the shape the reference keeps them. Ids are set in Settings. */
export const FORMS = [
  { id: 'member-feedback', label: 'Class feedback — member form', kind: 'fillout-v1', height: 620,
    note: 'What members say after the ride, in their words. Shown on the class desk so the coach can send it before the room clears.',
    embedId: 'dSw2VkfdGqus' },
  { id: 'trainer-qa', label: 'Training quality assessment', kind: 'fillout-v1', height: 700,
    note: 'The weighted assessment a manager fills in on the floor. Every answer lands on the trainer’s report as a rubric row.',
    embedId: 'syTsvPww8nus' },
  { id: 'trainer-qa-lab', label: 'Trainer QA — FIT & Lab (app)', kind: 'zite-v2', height: 660,
    note: 'The non-technical version, built as a Zite app. Its flow API, not the Forms API, so the embed is the only way in.',
    embedId: 'srq1c6n7br' },
  { id: 'vendor-callout', label: 'Vendor & AMC callout', kind: 'fillout-v1', height: 560,
    note: 'The form the facilities team sends a technician. Attach the reference to the ticket before it is filed.',
    embedId: 'pdtcpzhxas' },
];

export const formById = (id, overrides = {}) => {
  const f = FORMS.find(x => x.id === id) || FORMS[0];
  const o = overrides[f.id] || {};
  return { ...f, ...o, embedId: o.embedId ?? f.embedId, kind: o.kind || f.kind };
};

const attrsFor = (kind, embedId, params) => {
  const attrs = kind === 'zite-v2'
    ? { 'data-zite-id': embedId, 'data-zite-embed-type': 'standard', 'data-zite-inherit-parameters': '' }
    : { 'data-fillout-id': embedId, 'data-fillout-embed-type': 'standard', 'data-fillout-inherit-parameters': '', 'data-fillout-dynamic-resize': '' };
  for (const [k, v] of Object.entries(params || {})) attrs[`data-${kind === 'zite-v2' ? 'zite' : 'fillout'}-${k}`] = String(v);
  return attrs;
};

export const directLink = (kind, embedId) => (kind === 'zite-v2'
  ? `https://app.zite.com/flow/${embedId}` : `https://fillout.com/f/${embedId}`);

/** One embedded form. Mount it with `key={embedId}` so picking a different form resets the loader. */
export function FilloutEmbed({ embedId, kind = 'fillout-v1', height = 620, params, className }) {
  const [ready, setReady] = useState(false);
  const [slow, setSlow] = useState(false);
  const host = useRef(null);
  useEffect(() => {
    const node = host.current;
    if (!node || typeof MutationObserver !== 'function' || typeof document === 'undefined' || !document.body) return undefined;
    const check = () => !!node.querySelector('iframe');
    const observer = new MutationObserver(() => { if (check()) { setReady(true); observer.disconnect(); } });
    if (!check()) observer.observe(node, { childList: true, subtree: true });
    /* drop any previous copy so the freshly appended script re-scans for this host */
    for (const old of document.querySelectorAll(`script[src="${EMBED_SRC[kind]}"]`)) old.remove();
    const script = document.createElement('script');
    script.src = EMBED_SRC[kind]; script.async = true;
    script.onerror = () => setSlow(true);
    document.body.appendChild(script);
    const timer = setTimeout(() => setSlow(true), 6000);
    return () => { observer.disconnect(); clearTimeout(timer); };
  }, [kind, embedId]);
  return (
    <div className={cx('form-embed', ready && 'ready', className)} style={{ minHeight: height }}>
      {!ready && (
        <div className="form-embed-loading" style={{ height }}>
          <div className="form-embed-skeleton">
            {[0, 1, 2, 3, 4].map(i => <span key={i} className="skeleton-line"
              style={{ height: i === 0 ? 30 : 16, animationDelay: `${i * 90}ms` }} />)}
          </div>
          <p className="eyebrow">{slow ? 'Still loading the form — it may be blocked on this network' : 'Loading form'}</p>
          {slow && <a className="btn sm ghost" href={directLink(kind, embedId)} target="_blank" rel="noreferrer">
            <I s={svg.link} /> Open it directly instead</a>}
        </div>
      )}
      <div ref={host} className="form-embed-host" style={{ width: '100%', height }} {...attrsFor(kind, embedId, params)} />
    </div>
  );
}

/**
 * The panel the hub actually mounts: header with what the form is for, the embed when an id is set,
 * and a written-out fallback (link + “paste the id in Settings”) when it is not.
 */
export function FormHost({ id, overrides, params, title, tight, openDefault = true }) {
  const form = useMemo(() => formById(id, overrides), [id, overrides]);
  /* The rail places these on purpose, so they come up open; `openDefault={false}` is for a host that
     sits below the fold and should not steal the frame. Without an id the panel shows its note either way. */
  const [open, setOpen] = useState(!!openDefault);
  const link = directLink(form.kind, form.embedId);
  return (
    <section className={cx('fhost', open && 'open', !form.embedId && 'unconfigured')}>
      <header className="fhost-head">
        <div>
          <span className="eyebrow">Fillout · {form.kind === 'zite-v2' ? 'Zite app' : 'form'}</span>
          <h5>{title || form.label}</h5>
        </div>
        <button className="btn xs ghost" onClick={() => setOpen(o => !o)} aria-expanded={open}>
          <I s={open ? svg.back : svg.link} /> {open ? 'Hide the form' : 'Show the form'}</button>
      </header>
      <p className="xs mut fhost-note">{form.note}</p>
      {!form.embedId && <p className="fhost-warn"><I s={svg.warn} /> No id saved on this device —
        add one under Settings → Integrations → Forms, or use <a href={link} target="_blank" rel="noreferrer">the live link</a>.</p>}
      {open && !!form.embedId && <FilloutEmbed key={`${form.id}-${form.embedId}`} embedId={form.embedId}
        kind={form.kind} height={tight ? 480 : form.height} params={params} />}
      {open && !form.embedId && <div className="fhost-ghost">
        <div className="form-embed-skeleton">{[0, 1, 2].map(i => <span key={i} className="skeleton-line" style={{ height: i ? 16 : 30 }} />)}</div>
        <p className="xs mut">Nothing embeds until an id exists — the shape above is what the form would take.</p>
      </div>}
      <footer className="fhost-foot"><span className="mono xxs">{form.embedId || 'no id'} · {form.kind} · {form.height}px</span>
        <a className="btn xs ghost" href={link} target="_blank" rel="noreferrer"><I s={svg.expand} /> Open in Fillout</a></footer>
    </section>
  );
}

export default FormHost;
