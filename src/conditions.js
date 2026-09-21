/* Conditional visibility. A field is hidden until the field its condition refers to is
   answered. Dependencies are resolved at data-build time (gen-data.mjs) from the
   “Is conditional” prose; here we only evaluate them, with prose as the fallback. */

export const filled = v => v !== '' && v != null && !(Array.isArray(v) && !v.length);

/* Which field does the condition talk about? */
export function dependencyOf(f, index) {
  if (f.dependsOn && index.has(f.dependsOn)) return f.dependsOn;
  if (f.dependsOn) return null;                       // explicit but missing here → stay visible
  if (!f.conditional) return null;
  const prose = (f.condText || '').toLowerCase();
  if (!prose || /^no\b/.test(prose.trim())) return null;
  for (const id of index.keys()) {
    if (prose.includes(id.replace(/_/g, ' ')) || prose.includes(id)) return id;
  }
  return null;
}

export function isVisible(f, data, index) {
  if (!f.conditional) return true;
  const dep = f._dep !== undefined ? f._dep : (f._dep = index ? dependencyOf(f, index) : (f.dependsOn || null));
  if (!dep) return true;          // no resolvable dependency → always show (never hide a required field)
  return filled(data[dep]);
}

/* Attach resolved deps once, so per-keystroke renders stay cheap. */
export function withDeps(fields) {
  const index = new Map(fields.map(f => [f.id, f]));
  const out = fields.map(f => {
    const dep = dependencyOf(f, index);
    return { ...f, _dep: dep, _depLabel: dep ? (index.get(dep) || {}).label : '' };
  });
  return { fields: out, index };
}
