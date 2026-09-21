/* ───────────────────────────────────────────────────────────────────────────────
   Who reports to whom — and who may write what.

   Nothing here is invented. The taxonomy already ships, for every category and every
   sub-category, a first responder (the studio owner), a regional counterpart and two
   escalation rungs. Read those as reporting lines and you get the org chart for free:
   the ticket’s owner is the person it is assigned to, and their manager is the next rung
   up on the same chain. That single relationship is what decides whether the resolution
   sidebar opens for editing or stays a read-up-only sheet.
   ─────────────────────────────────────────────────────────────────────────────── */

/* "Zahur Shaikh (Studio Coordinator)" → name / role. The parenthetical is the job title in
   every row of the source CSVs; a "+ another person" tail is a joint rung, not a new one. */
export const cleanName = who => String(who ?? '')
  .replace(/\s*\([^)]*\)\s*/g, ' ').replace(/\s*\+.*$/, '').replace(/\s+/g, ' ').trim();
export const roleOf = who => {
  const m = String(who ?? '').match(/\(([^)]+)\)/);
  return m ? m[1].replace(/\s*\+.*$/, '').trim() : '';
};
const key = n => cleanName(n).toLowerCase();
const same = (a, b) => !!a && !!b && key(a) === key(b);

/**
 * Build the org from the shipped taxonomy.
 * @param {Array} categories  DATA.categories — each with ownerMumbai/ownerBengaluru/l1/l2 and subs[]
 * @param {Array} tickets     live tickets, so a person only counts as “working” if they actually are
 */
export function buildOrg(categories = [], tickets = []) {
  const people = new Map();          // key → { name, roles:Set, owns:Set, manages:Set, kind }
  const up = new Map();              // key → Set(key)      reporting line upwards
  const down = new Map();            // key → Set(key)      direct reports
  const add = (raw, ctx = {}) => {
    const name = cleanName(raw);
    if (!name) return null;
    const k = key(name);
    if (!people.has(k)) people.set(k, { name, roles: new Set(), owns: new Set(), manages: new Set(), cats: new Set() });
    const p = people.get(k);
    const role = roleOf(raw);
    if (role) p.roles.add(role);
    if (ctx.category) p.cats.add(ctx.category);
    if (ctx.owns) p.owns.add(ctx.owns);
    if (!up.has(k)) up.set(k, new Set());
    if (!down.has(k)) down.set(k, new Set());
    return k;
  };
  const edge = (from, to) => {
    if (!from || !to || from === to) return;
    up.get(from).add(to);
    down.get(to).add(from);
    people.get(to).manages.add(people.get(from).name);
  };

  for (const c of categories) {
    /* the ladder for a category: studio owner → L1 → L2. The Bengaluru counterpart is a peer
       owner at the same rung, so it reports to the same L1 rather than above anyone. */
    const mumbai = add(c.ownerMumbai, { category: c.name, owns: c.name });
    const blr = add(c.ownerBengaluru, { category: c.name, owns: c.name });
    const l1 = add(c.l1, { category: c.name });
    const l2 = add(c.l2, { category: c.name });
    edge(mumbai, l1); edge(blr, l1); edge(l1, l2);
    for (const s of (c.subs || [])) {
      /* a sub-category may name its own responders — the chain the ticket actually carries.
         Those win over the category default, because that is who the desk is really paging. */
      const s0 = add(s.ownerMumbai, { category: c.name, owns: `${c.name} › ${s.name}` });
      const sb = add(s.ownerBengaluru, { category: c.name, owns: `${c.name} › ${s.name}` });
      const s1 = add(s.l1, { category: c.name });
      const s2 = add(s.l2, { category: c.name });
      edge(s0, s1); edge(sb, s1); edge(s1, s2);
    }
  }

  /* ticket load per person, so the “signed in as” picker leads with whoever is actually busy */
  const load = new Map();
  for (const t of tickets) {
    const k = key(t.assignee);
    if (!k) continue;
    const done = ['resolved', 'closed'].includes(t.status);
    const row = load.get(k) || { open: 0, done: 0, breach: 0 };
    row[done ? 'done' : 'open']++;
    if (!done && t.resDueAt && t.resDueAt < Date.now()) row.breach++;
    load.set(k, row);
    if (!people.has(k)) add(t.assignee, {});
  }

  return { people, up, down, load, size: people.size };
}

/** The one person directly above `who`, or null at the top of the tree. */
export function managerOf(org, who) {
  const k = key(who);
  const set = org.up.get(k);
  if (!set || !set.size) return null;
  const first = [...set][0];
  return org.people.get(first)?.name || null;
}

/** The whole upline, closest first — the chain a ticket escalates along. */
export function upline(org, who, max = 4) {
  const out = [];
  let cur = key(who);
  for (let i = 0; i < max && cur; i++) {
    const next = [...(org.up.get(cur) || [])][0];
    if (!next || out.some(p => key(p.name) === next)) break;
    out.push({ name: org.people.get(next)?.name, role: [...(org.people.get(next)?.roles || [])][0] || '' });
    cur = next;
  }
  return out;
}

export function directReports(org, who) {
  return [...(org.down.get(key(who)) || [])].map(k => org.people.get(k)).filter(Boolean);
}

/** Everything the hub knows about one person, for the rail’s identity card. */
export function personCard(org, who) {
  const k = key(who);
  const p = org.people.get(k);
  if (!p) return { name: cleanName(who) || '—', roles: [], owns: [], reports: [], manager: null, load: { open: 0, done: 0, breach: 0 } };
  return {
    name: p.name,
    roles: [...p.roles],
    owns: [...p.owns],
    cats: [...p.cats],
    reports: [...p.manages],
    manager: managerOf(org, p.name),
    load: org.load.get(k) || { open: 0, done: 0, breach: 0 },
  };
}

/**
 * Who the hub will let sign in: everyone the taxonomy names, ordered by what they are holding.
 * `kind` is what the picker shows next to the name.
 */
export function viewerOptions(org) {
  const rows = [...org.people.values()].map(p => {
    const l = org.load.get(key(p.name)) || { open: 0, done: 0, breach: 0 };
    const roles = [...p.roles];
    const top = roles[0] || '';
    const manager = managerOf(org, p.name);
    return {
      name: p.name, role: top, roles, manages: p.manages.size, owns: p.owns.size,
      open: l.open, done: l.done, breach: l.breach, reportsTo: manager,
      kind: p.manages.size ? 'manager' : (p.owns.size ? 'owner' : 'desk'),
    };
  });
  return rows.sort((a, b) => (b.open - a.open) || (b.breach - a.breach)
    || (b.manages - a.manages) || a.name.localeCompare(b.name));
}

/**
 * The permission question the resolution sidebar asks.
 * The ticket owner and the owner’s reporting manager may write; the owner’s own upline beyond
 * that may write only once the ticket has actually been escalated to them.
 */
export function resolutionRights(t, viewer, org) {
  const ownerRaw = t?.assignee || (t?.chain || [])[t?.escalation ?? 0]?.who || '';
  const owner = cleanName(ownerRaw);
  const manager = owner ? managerOf(org, owner) : null;
  const who = cleanName(viewer?.name || viewer || '');
  const base = { owner, manager, ownerRole: roleOf(ownerRaw) || (org.people.get(key(owner)) || {}).roles?.[0] || 'owner' };
  if (!who) return { ...base, ok: false, relation: 'none', why: 'Nobody is signed in to the hub, so the record is sealed.' };
  if (same(who, owner)) {
    return { ...base, ok: true, relation: 'owner', why: `You own this ticket${base.ownerRole ? ` (${base.ownerRole})` : ''}.` };
  }
  if (manager && same(who, manager)) {
    return { ...base, ok: true, relation: 'manager', why: `You are ${owner}’s reporting manager.` };
  }
  const rung = (t?.chain || []).findIndex(c => same(cleanName(c.who), who));
  if (rung > (t?.escalation ?? 0) && rung >= 0) {
    return { ...base, ok: true, relation: 'escalation', why: `Escalated to you at L${rung} of this ticket.` };
  }
  const isManagerAbove = manager && upline(org, manager, 6).some(p => same(p.name, who));
  if (isManagerAbove) return { ...base, ok: true, relation: 'escalation', why: `You sit above ${owner}’s line.` };
  return {
    ...base, ok: false, relation: 'reader',
    why: `Read-only — resolution is written by ${owner || 'the assigned owner'}${manager ? ` or ${manager}` : ''}, not by ${who}.`,
  };
}

/** A line for the sheet: who owns it and who they answer to. */
export function ownershipLine(t, org) {
  const r = resolutionRights(t, {}, org);
  if (!r.owner) return 'No owner recorded on this ticket.';
  return `${r.owner}${r.ownerRole ? ` (${r.ownerRole})` : ''}${r.manager ? ` reports to ${r.manager}` : ' — top of this line'}`;
}
