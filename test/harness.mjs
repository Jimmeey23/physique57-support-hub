/* Loads the real app sources under Node: esbuild-bundles them with an import map
   (JSX → JS, data.json → a global, CSS stubbed), then installs a DOM thin enough for
   react-test-renderer. Used by every harness in this folder. */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
/* Resolved from wherever the repo happens to be checked out — a test suite that hard-codes one
   absolute path only passes on the machine that wrote it, and mixes two React copies anywhere else
   (which is what "cannot read properties of null (reading 'useState')" was telling us). */
const require = createRequire(import.meta.url);
const { build } = require('esbuild');

export const APP = path.resolve(import.meta.dirname, '..');
export const SRC = path.join(APP, 'src');
export const TMP = path.join(APP, 'test', '.tmp');
export const DATA = JSON.parse(fs.readFileSync(path.join(SRC, 'data.json'), 'utf8'));

export async function loadApp(extra = '') {
  /* the bundle’s data.json import is shimmed to read this global, so it must exist first */
  globalThis.__DATA__ = DATA;
  fs.rmSync(TMP, { recursive: true, force: true });
  fs.mkdirSync(TMP, { recursive: true });
  const EXTS = ['.jsx', '.js', '.json'];
  const resolveSrc = (from, spec) => {
    const base = path.resolve(path.dirname(from), spec.replace(/^\.\//, ''));
    for (const e of ['', ...EXTS]) if (fs.existsSync(base + e) && fs.statSync(base + e).isFile()) return base + e;
    return null;
  };
  const entry = path.join(TMP, 'entry.jsx');
  fs.writeFileSync(entry, [
    `import App from '${SRC}/main.jsx';`,
    `import * as CORE from '${SRC}/core.js';`,
    `import * as FORMS from '${SRC}/forms.jsx';`,
    `import * as UI from '${SRC}/ui.jsx';`,
    `import * as COND from '${SRC}/conditions.js';`,
    `globalThis.__X = { App, CORE, FORMS, UI, COND };`,
    extra,
  ].join('\n'));
  await build({
    entryPoints: [entry], bundle: true, format: 'esm', outfile: path.join(TMP, 'bundle.mjs'),
    absWorkingDir: APP, jsx: 'automatic', logLevel: 'error', platform: 'node',
    external: ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime'],
    define: { 'process.env.NODE_ENV': '"development"' },
    plugins: [{
      name: 'node-test-map',
      setup(b) {
        b.onResolve({ filter: /^react-dom\/client$/ }, () => ({ path: 'fakeclient', namespace: 'fake' }));
        b.onResolve({ filter: /^\./ }, a => {
          if (!a.path.startsWith('.')) return null;
          if (a.path.endsWith('.css')) return { path: a.path, namespace: 'stub' };
          const from = a.importer && a.importer.startsWith(SRC) ? a.importer : entry;
          const hit = resolveSrc(from, a.path);
          if (!hit) return { errors: [{ text: 'unresolved: ' + a.path + ' from ' + from }] };
          if (hit.endsWith('data.json')) return { path: 'DATA', namespace: 'datajson' };
          return { path: hit, namespace: 'src' };
        });
        b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: '', loader: 'js' }));
        b.onLoad({ filter: /.*/, namespace: 'fake' }, () => ({
          contents: 'export const createRoot = () => ({ render() {}, unmount() {} });\n'
                  + 'export const hydrateRoot = () => ({ render() {}, unmount() {} });', loader: 'js' }));
        b.onLoad({ filter: /.*/, namespace: 'datajson' }, () => ({ contents: 'export default globalThis.__DATA__', loader: 'js' }));
        b.onLoad({ filter: /\.json$/ }, a => ({ contents: fs.readFileSync(a.path, 'utf8'), loader: 'json' }));
      b.onLoad({ filter: /\.png$/ }, a => ({ contents: 'export default "data:image/png;base64,' + fs.readFileSync(a.path).toString('base64') + '"', loader: 'js' }));
        b.onLoad({ filter: /\.jsx?$/ }, a => ({ contents: fs.readFileSync(a.path, 'utf8'), loader: 'jsx', resolveDir: SRC }));
        b.onLoad({ filter: /\.json$/ }, a => ({ contents: fs.readFileSync(a.path, 'utf8'), loader: 'json' }));
      },
    }],
  });
  /* core.js hydrates DATA.opts in place at import; every harness must load it first. */
  const mod = await import(path.join(TMP, 'bundle.mjs'));
  if (!globalThis.__X.CORE.hydrateData().universal[0].options
      && globalThis.__X.CORE.hydrateData().universal.some(f => f.optsRef !== undefined)) {
    throw new Error('data hydration did not run — fields still carry optsRef');
  }
  return mod ? path.join(TMP, 'bundle.mjs') : path.join(TMP, 'bundle.mjs');
}

/* A DOM thin enough that the components don’t notice, plus a localStorage we can read. */
export function installDom(store = new Map()) {
  const el = () => ({
    style: {}, classList: { add() {}, remove() {}, toggle() {}, contains: () => false }, dataset: {},
    setAttribute() {}, getAttribute: () => null, removeAttribute() {}, addEventListener() {}, removeEventListener() {},
    appendChild() {}, insertBefore() {}, remove() {}, select() {}, focus() {}, blur() {}, click() {},
    closest: () => null, querySelector: () => null, querySelectorAll: () => [], scrollIntoView() {},
    nodeType: 1, tagName: 'DIV', textContent: '', innerHTML: '', children: [],
  });
  globalThis.__DATA__ = DATA;
  globalThis.document = { documentElement: el(), body: el(), head: el(), getElementById: () => el(),
    querySelector: () => null, querySelectorAll: () => [], createElement: el, createTextNode: el,
    addEventListener() {}, removeEventListener() {}, execCommand: () => true };
  globalThis.window = { addEventListener() {}, removeEventListener() {}, scrollTo() {}, matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }),
    location: { href: '/' }, document: globalThis.document, setTimeout, clearTimeout, setInterval, clearInterval };
  globalThis.navigator = globalThis.navigator || { clipboard: { writeText: async () => {} } };
  globalThis.localStorage = { getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k), key: () => null, length: 0 };
  globalThis.URL = globalThis.URL || {};
  globalThis.URL.createObjectURL = () => 'blob:x'; globalThis.URL.revokeObjectURL = () => {};
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  return store;
}

/* react-test-renderer JSON-tree helpers. */
export const walk = (n, f) => {
  if (!n) return;
  if (typeof n === 'string' || typeof n === 'number') { f(String(n), null); return; }
  f(null, n);
  (n.children || []).forEach(c => walk(c, f));
};
/* JSX renders adjacent expressions with no separator, so join with '' but keep a
   spaced copy for matching text that a human reads across an icon or two. */
export const texts = node => { const out = []; walk(node, (s) => { if (s) out.push(s); }); return out.join(''); };
export const textsSpaced = node => { const out = []; walk(node, (s) => { if (s) out.push(s); }); return out.join(' '); };
export const nodes = root => { const out = []; walk(root, (_, n) => { if (n) out.push(n); }); return out; };
export const byType = (root, type) => nodes(root).filter(n => n.type === type);
export const byClass = (root, cls) => nodes(root).filter(n => typeof n.props?.className === 'string'
  && n.props.className.split(' ').includes(cls));
export const findText = (root, re) => nodes(root).filter(n => re.test(texts(n)));
/* leaf-most node whose text matches, so you get the button itself, not its ancestors */
export const deepest = list => list.slice().sort((a, b) => texts(b).length - texts(a).length)[0];

/* the <html> stub, so a test can read the attributes the app sets on it */
export const docEl = () => globalThis.document.documentElement;
