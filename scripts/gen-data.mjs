#!/usr/bin/env node
/* Turns the validated CSV deliverables into one compact JSON the app consumes.
   Run: npm run data */
import fs from 'node:fs';
import path from 'node:path';

const HERE = path.resolve(import.meta.dirname, '..');
const ROOT = path.resolve(HERE, '..');
/* The CSV deliverables live in the repo (data/) so a fresh clone can rebuild src/data.json;
   the sandbox checkout keeps them one level up in output/, which stays the fallback. */
const OUT = [path.join(HERE, 'data'), path.join(ROOT, 'output')]
  .find(d => fs.existsSync(path.join(d, 'Physique57_A_taxonomy.csv')));
if (!OUT) { console.error('no data/Physique57_A_taxonomy.csv — the CSV deliverables are missing'); process.exit(1); }
const REPO = path.join(ROOT, 'build', 'artifacts', 'repo');
/* src/constants.json is the committed distillation of the reference repo’s constants — it is what
   makes `npm run data` reproduce the shipped data.json in a clone that has no sibling checkout. */
const CONSTS = path.join(HERE, 'src', 'constants.json');

/* ---------------- 1. CSV reader (handles quoted commas + CRLF) ---------------- */
function parseCSV(text) {
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (c !== '\r') cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const head = rows.shift().map(h => h.replace(/^\uFEFF/, ''));
  return rows.filter(r => r.length > 1).map(r => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])));
}
const opts = s => (s || '').replace(/^`|`$/g, '').split(';').map(x => x.trim()).filter(Boolean);
const yes = s => String(s || '').trim().toLowerCase() === 'yes';
/* `Is conditional` holds prose ("Yes — for numbered units"), so test the stem, not equality. */
const startsYes = s => /^\s*yes\b/i.test(String(s || '').trim());

/* ---------------- 2. Table A: taxonomy ---------------- */
const tax = parseCSV(fs.readFileSync(path.join(OUT, 'Physique57_A_taxonomy.csv'), 'utf8'));
const categories = [];
const byCat = new Map();
for (const r of tax) {
  if (!byCat.has(r.Category)) {
    const c = { name: r.Category, department: r.Department, ownerMumbai: r['Owner (Mumbai)'],
      ownerBengaluru: r['Owner (Bengaluru)'], l1: r['Escalation level 1'], l2: r['Escalation level 2'],
      subs: [] };
    byCat.set(r.Category, c); categories.push(c);
  }
  const c = byCat.get(r.Category);
  c.subs.push({
    name: r['Sub category'], priority: (r.Priority || 'medium').toLowerCase(),
    slaLabel: r.SLA, department: r.Department,
    ownerMumbai: r['Owner (Mumbai)'], ownerBengaluru: r['Owner (Bengaluru)'],
    l1: r['Escalation level 1'], l2: r['Escalation level 2'],
    hist: Number(r['Historic tickets'] || 0) || 0,
  });
}
const slaHours = s => {
  const fr = /(\d+(?:\.\d+)?|15|30)\s*(min|hr)\s*first/i.exec(s) || /—\s*(\d+)\s*min/i.exec(s);
  const rs = /(\d+(?:\.\d+)?)\s*hr\s*resolution/i.exec(s) || /(\d+)\s*hr\s*containment/i.exec(s);
  const wd = /(\d+)\s*working days/i.exec(s);
  let first = 8, res = 48;
  if (/P1/.test(s)) { first = /15 min/.test(s) ? 0.25 : 0.5; res = /2 hr containment/.test(s) ? 2 : 4; }
  else if (/P2/.test(s)) { first = 2; res = 12; }
  else if (/P3/.test(s)) { first = 8; res = 48; }
  else if (/P4/.test(s)) { first = 24; res = wd ? Number(wd[1]) * 24 : 120; }
  if (rs) res = Number(rs[1]);
  if (fr) first = fr[2] && fr[2].toLowerCase() === 'min' ? Number(fr[1]) / 60 : Number(fr[1] ?? fr[2]);
  return { first, res };
};
for (const c of categories) for (const s of c.subs) { s.hours = slaHours(s.slaLabel); }

/* ---------------- 3. Table B: field plans ---------------- */
const intake = parseCSV(fs.readFileSync(path.join(OUT, 'Physique57_B_intake_fields.csv'), 'utf8'));
const TYPE = { text: 'text', textarea: 'textarea', number: 'number', 'datetime-local': 'datetime',
  select: 'select', multiselect: 'multiselect', radio: 'radio', rating: 'rating', file: 'file', url: 'url' };
const clean = s => (s || '').replace(/^`|`$/g, '').trim();
const universal = [];
const subFields = new Map();
const fieldIds = new Set();
for (const r of intake) {
  const uni = clean(r['Applies to']).toLowerCase().startsWith('universal');
  const f = {
    id: clean(r['Field ID']), label: clean(r['Field label']), type: TYPE[clean(r['Field type'])] || 'text',
    desc: clean(r['Field description']), required: yes(r['Is required']),
    conditional: startsYes(r['Is conditional']),
    dependsOn: (clean(r['Linked field ID']) !== '-' ? clean(r['Linked field ID']) : null),
    condText: clean(r['Is conditional']),
    options: (r['Options to display'] || '').includes(';') ? opts(r['Options to display']) : null,
    placeholder: !(r['Options to display'] || '').includes(';') ? clean(r['Options to display']) : '',
  };
  /* A field that is hidden until another is answered cannot also block submit. */
  f.required = yes(r['Is required']) && !f.conditional;
  f.requiredAlways = yes(r['Is required']);
  if (f.options) fieldIds.add(f.id);
  if (uni) { if (!universal.some(u => u.id === f.id)) universal.push(f); continue; }
  const key = `${clean(r['Category'])}|||${clean(r['Sub category'])}`;
  if (!subFields.has(key)) subFields.set(key, []);
  if (!subFields.get(key).some(x => x.id === f.id)) subFields.get(key).push(f);
}
/* a dependency that no form actually renders would hide its field forever — drop it */
const uniIds = new Set(universal.map(u => u.id));
for (const [key, fields] of subFields) {
  const local = new Set(fields.map(f => f.id));
  for (const f of fields) if (f.dependsOn && !uniIds.has(f.dependsOn) && !local.has(f.dependsOn)) f.dependsOn = null;
}

/* ---------------- 4. studios + room plans (from constants.ts) ---------------- */
let studios = [], roomsByStudio = {};
try {
  const src = fs.readFileSync(path.join(REPO, 'src/lib/constants.ts'), 'utf8');
  const sb = src.slice(src.indexOf('export const STUDIOS'), src.indexOf('export const CLASS_FORMATS'));
  for (const m of sb.matchAll(/\{\s*\n\s*id: "([^"]+)",\s*\n\s*name: "([^"]+)",\s*\n\s*city: "([^"]+)",\s*\n\s*region: "([^"]+)",[\s\S]*?\n  \}/g))
    studios.push({ id: m[1], name: m[2], city: m[3], region: m[4] });
  const lb = src.slice(src.indexOf('export const STUDIO_LAYOUTS'), src.indexOf('export function getStudioRoomsForStudio'));
  let cur = null;
  for (const line of lb.split('\n')) {
    const k = /^\s{2}(\w+): \{/.exec(line); if (k) { cur = k[1]; roomsByStudio[cur] = []; }
    const n = /\{ name: "([^"]+)"/.exec(line); if (n && cur) roomsByStudio[cur].push(n[1]);
  }
} catch (e) { console.warn('constants.ts unavailable — reading the committed src/constants.json instead'); }
if (!studios.length && fs.existsSync(CONSTS)) {
  const c = JSON.parse(fs.readFileSync(CONSTS, 'utf8'));
  const raw = c.raw || c;
  studios = (raw.STUDIOS || []).map(({ id, name, city, region }) => ({ id, name, city, region }));
  const layouts = raw.STUDIO_LAYOUTS || c.layouts || {};
  for (const [k, v] of Object.entries(layouts)) roomsByStudio[k] = ((v && v.rooms) || []).map(r => r.name);
}
if (!studios.length) {
  const seen = new Set();
  for (const r of intake) for (const o of opts(r['Options to display']))
    if (/^(Kwality House|Supreme HQ|Kenkere House|Courtside|the Studio by Copper)/.test(o) && !seen.has(o)) {
      seen.add(o); studios.push({ id: o.split(',')[0].toLowerCase().replace(/\W+/g, '-'), name: o,
        city: /Bengaluru/.test(o) ? 'Bengaluru' : 'Mumbai', region: /Bengaluru/.test(o) ? 'Bengaluru' : 'Mumbai' });
    }
}
/* every area string that ever appears in an `area` field, so the fallback select is complete */
const allAreas = new Set();
for (const r of intake.filter(x => clean(x['Field ID']) === 'area')) for (const o of opts(r['Options to display'])) allAreas.add(o);

/* ---------------- 5. emit ---------------- */
const data = {
  generatedAt: '2026-09-20',
  brand: { name: 'Physique 57', region: 'India', product: 'Support & Ticket Hub' },
  categories,
  universal,
  subFields: Object.fromEntries(subFields),
  studios, roomsByStudio, allAreas: [...allAreas],
  counts: { categories: categories.length,
    subcategories: categories.reduce((n, c) => n + c.subs.length, 0),
    fields: universal.length + [...subFields.values()].reduce((n, f) => n + f.length, 0),
    rows: intake.length },
};
/* The same option lists repeat across the 296 sub-category forms (1,768 field rows, only 91
   distinct lists). Intern them: a field carries `optsRef` instead of a copy of the array,
   and the app hydrates it once at startup. Cuts the shipped taxonomy roughly in half. */
const seen = new Map(); const shared = [];
const intern = list => {
  const key = JSON.stringify(list);
  if (!seen.has(key)) { seen.set(key, shared.length); shared.push(list); }
  return seen.get(key);
};
let interned = 0;
for (const f of data.universal) if (f.options) { f.optsRef = intern(f.options); delete f.options; interned++; }
for (const list of Object.values(data.subFields)) for (const f of list) if (f.options) { f.optsRef = intern(f.options); delete f.options; interned++; }
data.opts = shared;
const dest = path.join(ROOT, 'app', 'src', 'data.json');
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.writeFileSync(dest, JSON.stringify(data));
console.log('option lists: %d distinct shared across %d fields', shared.length, interned);
console.log('data.json written — %d categories, %d sub-categories, %d universal + %d sub-specific fields, %d studios, %s KB',
  data.counts.categories, data.counts.subcategories, universal.length,
  [...subFields.values()].reduce((n, f) => n + f.length, 0), studios.length,
  (fs.statSync(dest).size / 1024).toFixed(0));
