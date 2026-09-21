/* Pulls the operational constants out of the reference repo (iris-ai-v2) and folds the ones
   that improve option lists into src/data.json, plus src/constants.json for the lookups.
   Read-only on the repo; safe to re-run. Run `npm run data` first. */
import fs from 'node:fs';
import path from 'node:path';
import { transform } from 'esbuild';
import { VOCAB, GROUPS, GROUP_KEYS, UNIVERSAL } from '../src/vocab.js';

const REPO = process.env.IRIS_REPO || '/home/user/build/artifacts/repo';
const APP = path.resolve(import.meta.dirname, '..');
const SRC = path.join(APP, 'src');
const CONST_TS = path.join(REPO, 'src/lib/constants.ts');

/* ---- evaluate the repo's constants without its TS/Next toolchain ---- */
const names = ['STUDIOS', 'CLASS_FORMATS', 'STUDIO_AREAS', 'STUDIO_LAYOUTS', 'AREA_ALIASES', 'COMMON_STUDIO_AREAS',
  'SYSTEMS', 'OCCURRED_OPTIONS', 'REPORTED_BY_OPTIONS', 'TRAINERS', 'MEMBERSHIPS', 'STATUS_LABELS',
  'PRIORITY_SLA_HOURS', 'CYCLE_INTAKE_QUESTIONS', 'EQUIPMENT_CATALOGUE', 'EQUIPMENT_CONDITIONS',
  'STAGES_SC3_PARTS', 'STAGES_SC3_TROUBLESHOOTING'];
let out;
if (fs.existsSync(CONST_TS)) {
  let src = fs.readFileSync(CONST_TS, 'utf8');
  src = src.split('\n').filter(l => !/^import\s/.test(l)).join('\n').replace(/as const/g, '');
  for (const n of names) src = src.replace(new RegExp(`export const ${n}\\b`), `const ${n}`);
  const keep = names.map(n => `if (typeof ${n} !== 'undefined') out.${n} = ${n};`).join('\n');
  src += `\nconst out = {};\n${keep}\nglobalThis.__K = out;\n`;
  const js = await transform(src, { loader: 'ts', format: 'cjs' });
  const run = new Function('module', 'exports', 'globalThis', js.code);
  const g = {}; run({}, {}, g);
  out = g.__K;
} else {
  console.warn('repo constants not found at ' + CONST_TS + ' — reusing existing src/constants.json');
  out = JSON.parse(fs.readFileSync(path.join(SRC, 'constants.json'), 'utf8')).raw;
}

/* ---- shaped constants for the app ---- */
const C = {
  raw: out,
  studios: (out.STUDIOS || []).map(s => ({ id: s.id, name: s.name, city: s.city, region: s.region,
    studioIds: s.studioIds, momenceLocationId: s.momenceLocationId ?? null, address: s.address })),
  classFormats: out.CLASS_FORMATS || [],
  studioAreas: out.STUDIO_AREAS || [],
  commonAreas: out.COMMON_STUDIO_AREAS || [],
  areaAliases: out.AREA_ALIASES || {},
  layouts: Object.fromEntries(Object.entries(out.STUDIO_LAYOUTS || {}).map(([k, v]) =>
    [k, { studioName: v.studioName, rooms: v.rooms.map(r => ({ name: r.name, capacity: r.capacity ?? null, category: r.category, description: r.description })) }])),
  systems: out.SYSTEMS || [],
  occurredOptions: out.OCCURRED_OPTIONS || [],
  reportedByOptions: out.REPORTED_BY_OPTIONS || [],
  trainers: out.TRAINERS || [],
  memberships: out.MEMBERSHIPS || [],
  statusLabels: out.STATUS_LABELS || {},
  prioritySlaHours: out.PRIORITY_SLA_HOURS || {},
  cycleIntakeQuestions: out.CYCLE_INTAKE_QUESTIONS || [],
  cycleParts: out.STAGES_SC3_PARTS || [],
  cycleTroubleshooting: out.STAGES_SC3_TROUBLESHOOTING || [],
  equipment: (out.EQUIPMENT_CATALOGUE || []).map(e => ({ type: e.type, category: e.category, aliases: e.aliases || [] })),
  equipmentTypes: (out.EQUIPMENT_CATALOGUE || []).map(e => e.type),
  equipmentCategories: [...new Set((out.EQUIPMENT_CATALOGUE || []).map(e => e.category))],
  equipmentConditions: out.EQUIPMENT_CONDITIONS || [],
};
fs.writeFileSync(path.join(SRC, 'constants.json'), JSON.stringify(C, null, 1));

/* ---- fold repo options into the generated form data ---- */
const dataPath = path.join(SRC, 'data.json');
const D = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

/* Which fields become linked lookups rather than free text. `class_format` deliberately
   stays a plain select: it names a format, not a Momence session record. */
const LOOKUPS = {
  member: ['member_name', 'member_named', 'member_id', 'member_email'],
  session: ['class_date', 'session_point'],
  ticket: ['linked_ticket', 'valet_ticket', 'ticket_vendor'],
};
/* Option lists widened with the repo's canonical values (a desk should never type
   "Bike 3" and "Bike #3" into two different tickets). */
const WIDEN = {
  asset_type: C.equipmentTypes, systems: C.systems, occurred_relative: C.occurredOptions,
  reporter_type: C.reportedByOptions, membership: C.memberships, trainer: C.trainers,
  notified_members: ['All booked members', 'Affected members only', 'Nobody yet'],
  trainer_under_review: ['No', 'Yes — coaching note attached', 'Yes — method deviation'],
};
/* Lists for fields the generator left empty. */
const INJECT = { asset_condition: C.equipmentConditions, asset_link: [], };

/* ---- controlled vocabularies and extra detail come from src/vocab.js, the same module the
   class desk and the resolution panel read — one source, so a list can never drift. ---- */
/* Options are interned: a field carries `optsRef: n` into D.opts[n]. Widening therefore means
   widening the SHARED list in place (keeping its identity); only fields with no optsRef get an
   array of their own. Idempotent — every step dedupes, so re-running never compounds. */
const lists = D.opts || (D.opts = []);
const vocabRefs = Object.fromEntries(Object.entries(D.vocab || {}).map(([n, arr]) => {
  let ref = lists.findIndex(l => l.join('|') === arr.join('|'));
  if (ref < 0) { lists.push([...arr]); ref = lists.length - 1; }
  return [n, ref];
}));
const putVocab = (name, arr) => {
  if (vocabRefs[name] !== undefined) { const cur = lists[vocabRefs[name]];
    if (cur.join('|') !== arr.join('|')) { cur.length = 0; cur.push(...arr); } return vocabRefs[name]; }
  let ref = lists.findIndex(l => l.join('|') === arr.join('|'));
  if (ref < 0) { lists.push([...arr]); ref = lists.length - 1; }
  vocabRefs[name] = ref; return ref;
};
/* Group the interned lists by which field ids read them, so widening a list that several
   unrelated fields share (a generic Yes/No pool, say) cannot leak trainer names into a
   member-confirmed field. Shared by exactly one id → widen in place and everyone using that
   vocabulary agrees. Shared more widely → that field gets its own copy instead. */
const users = new Map();
for (const f of [...D.universal, ...Object.values(D.subFields).flat()]) {
  if (f.optsRef !== undefined) {
    if (!users.has(f.optsRef)) users.set(f.optsRef, new Set());
    users.get(f.optsRef).add(f.id);
  }
}
const soleOwner = ref => { const u = users.get(ref); return u && u.size === 1; };
let sharedWidened = 0, forked = 0, converted = 0, attached = 0, universalAdded = 0;
const widenField = f => {
  if (f._enrich) return;                    // our own fields already carry their final type
  const add = WIDEN[f.id];
  /* a prose field the desk should never free-type becomes a real choice */
  const vocab = VOCAB[f.id];
  if (vocab && f.type !== 'lookup') {
    f.type = vocab.type; delete f.options;
    f.optsRef = putVocab('field:' + f.id, vocab.options);
    converted++;
  }
  if (f.optsRef !== undefined && !add && !INJECT[f.id] && !vocab && f.type !== 'lookup') return;
  const current = (f.optsRef !== undefined ? lists[f.optsRef] : f.options) || [];
  const extra = add?.length ? add : (INJECT[f.id]?.length && !current.length ? INJECT[f.id] : []);
  const merged = [...new Set([...current, ...extra])];
  if (f.optsRef !== undefined) {
    delete f.options;
    if (merged.length === current.length) return finish(f);
    if (soleOwner(f.optsRef)) { lists[f.optsRef].length = 0; lists[f.optsRef].push(...merged); sharedWidened++; return finish(f); }
    delete f.optsRef;                       // fork: keep the shared pool untouched
    f.options = merged; forked++; return finish(f);
  }
  if (merged.length) f.options = merged; else delete f.options;
  return finish(f);
};
const finish = f => {
  const isLookup = Object.entries(LOOKUPS).find(([, ids]) => ids.includes(f.id));
  if (isLookup) { f.type = 'lookup'; f.module = isLookup[0]; delete f.options; delete f.optsRef; }
  else if (f.type === 'lookup') { f.type = 'select'; delete f.module; }
};
D.universal.forEach(widenField);
let touched = 0;
for (const key of Object.keys(D.subFields)) { for (const f of D.subFields[key]) { widenField(f); touched++; } }

/* A group field, whether freshly added or left by a previous run: the spec is the source of
   truth, so the step is idempotent even after `npm run data` rebuilt the plan. */
const groupField = (gname, spec) => {
  const f = { ...spec, _enrich: 'G:' + gname, required: false,
    desc: spec.desc || `${gname === 'roster' ? 'Filled in by the class desk' : 'Added by the reference-data pass'} — optional, but it is the detail the owner asks for.` };
  if (f.options) { f.optsRef = putVocab('g:' + gname + ':' + f.id, f.options); delete f.options; }
  if (f.id === 'attendees_affected') f.dependsOn = 'class_date';
  if (f.type === 'lookup' && f.module === 'member') f.multi = true;
  return f;
};
/* ---- attach the extra detail where its keywords say it belongs ---- */
for (const key of Object.keys(D.subFields)) {
  const list = D.subFields[key];
  const subName = key.split('|||')[1] || key;
  for (const [gname, fields] of Object.entries(GROUPS)) {
    if (!GROUP_KEYS[gname].test(subName)) continue;
    for (const spec of fields) {
      const have = list.find(f => f.id === spec.id);
      if (have) { Object.assign(have, groupField(gname, spec)); continue; }   // re-point at the right type/list
      list.push(groupField(gname, spec)); attached++;
    }
  }
}
/* two universal choices every ticket should carry — dropdowns, not prose */
for (const spec of UNIVERSAL) {
  const existing = D.universal.find(x => x.id === spec.id);
  const f = { id: spec.id, label: spec.label, type: spec.type, desc: spec.desc, _enrich: 'universal',
    required: false, conditional: false, universal: true, _u: true };
  f.optsRef = putVocab('u:' + spec.id, spec.options);
  const at = D.universal.findIndex(x => x.id === spec.after);
  if (existing) { Object.assign(existing, f); continue; }
  D.universal.splice(at < 0 ? D.universal.length : at + 1, 0, f); universalAdded++;
}

const countLookup = f => (f.type === 'lookup' ? 1 : 0);
const allFields = [...D.universal, ...Object.values(D.subFields).flat()];
D.counts.fields = allFields.length;
const lookupTotal = allFields.filter(f => f.type === 'lookup').length;
D.linkedLookups = LOOKUPS;
D.vocab = Object.fromEntries(Object.entries(vocabRefs).map(([n, ref]) => [n, lists[ref]]));
D.counts = { ...D.counts, repoConstants: Object.keys(C).length - 1, lookupFields: lookupTotal,
  vocabLists: Object.keys(D.vocab).length, enrichedFields: attached, convertedFields: converted };
D.enrichGroups = { fields: Object.fromEntries(Object.entries(GROUPS).map(([k, v]) => [k, v.map(f => f.id)])) };
D.opts = lists;
D.repo = { cycleIntake: C.cycleIntakeQuestions, cycleParts: C.cycleParts, cycleTroubleshooting: C.cycleTroubleshooting,
  areaAliases: C.areaAliases, equipmentCategories: C.equipmentCategories, statusLabels: C.statusLabels,
  prioritySlaHours: C.prioritySlaHours, layouts: C.layouts, source: path.relative(REPO, CONST_TS),
  studios: C.studios, systems: C.systems, memberships: C.memberships, trainers: C.trainers };
fs.writeFileSync(dataPath, JSON.stringify(D));
fs.writeFileSync(path.join(SRC, 'constants.json'), JSON.stringify({ ...C,
  counts: { studios: C.studios.length, classFormats: C.classFormats.length, trainers: C.trainers.length,
    memberships: C.memberships.length, equipmentTypes: C.equipmentTypes.length, systems: C.systems.length,
    rooms: Object.values(C.layouts).reduce((n, l) => n + l.rooms.length, 0), statuses: Object.keys(C.statusLabels).length,
    cycleQuestions: C.cycleIntakeQuestions.length, areas: C.studioAreas.length } }, null, 1));
const dup = lists.filter(l => new Set(l).size !== l.length).length;
console.log('enriched — %d sub fields scanned · %d lookup fields · %d interned lists widened in place · %d forked · %d non-deduped pools',
  touched, lookupTotal, sharedWidened, forked, dup);
console.log('  %d prose fields converted to dropdowns · %d detail fields attached by keyword · %d universal fields added · %d vocab pools published',
  converted, attached, universalAdded, Object.keys(D.vocab).length);
