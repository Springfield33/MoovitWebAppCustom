// Unisce core + runtime Scriptable + vista in dist/Bus490495.js e genera il loader dist/Bus.js.
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const ORDER = [
  'src/core/schedule.js', 'src/core/b64.js', 'src/core/pbf.js', 'src/core/merge.js', 'src/core/trains.js', 'src/core/model.js',
  'src/scriptable/config.js', 'src/scriptable/cache.js', 'src/scriptable/trains.js', 'src/scriptable/widget.js',
  'src/scriptable/view.js', 'src/scriptable/main.js',
];

export function bundle({ root = '.', pagesBase, files = ORDER }) {
  const parts = [
    '// Bus490495.js — generato da scripts/bundle.mjs, non modificare a mano.',
    `const PAGES_BASE = ${JSON.stringify(pagesBase)};`,
    `const VIEW_HTML = ${JSON.stringify(readFileSync(join(root, 'src/view.html'), 'utf8'))};`,
  ];
  const seen = new Map();
  for (const f of files) {
    const body = readFileSync(join(root, f), 'utf8')
      .split('\n')
      .filter(l => !/^import\s/.test(l))
      .map(l => l.replace(/^export\s+/, ''))
      .join('\n');
    for (const m of body.matchAll(/^(?:async\s+)?(?:function\*?|const|let|class)\s+([A-Za-z_$][\w$]*)/gm)) {
      if (seen.has(m[1])) throw new Error(`Nome duplicato "${m[1]}" in ${f} e ${seen.get(m[1])}`);
      seen.set(m[1], f);
    }
    parts.push(`// ---- ${f}`, body);
  }
  parts.push('module.exports = { main, buildModel, decodeFeed, selectTrains, worstLabel };', '');
  return parts.join('\n');
}

export function loader(pagesBase) {
  return `// Bus — loader per Scriptable. Va incollato una sola volta in un nuovo script chiamato "Bus".
// Scarica Bus490495.js al massimo una volta al giorno e lo esegue; senza rete usa la copia salvata.
const BASE = ${JSON.stringify(pagesBase)};
const fm = FileManager.local();
const dir = fm.joinPath(fm.documentsDirectory(), 'bus-roma');
if (!fm.fileExists(dir)) fm.createDirectory(dir, true);
const lib = fm.joinPath(dir, 'Bus490495.js');
const old = !fm.fileExists(lib) || Date.now() - fm.modificationDate(lib).getTime() > 86400000;
if (old || (args.queryParameters && args.queryParameters.update)) {
  try {
    const req = new Request(BASE + 'Bus490495.js');
    req.timeoutInterval = 15;
    const code = await req.loadString();
    if (code.includes('module.exports')) fm.writeString(lib, code);
  } catch (e) {
    if (!fm.fileExists(lib)) throw e;
  }
}
await importModule(lib).main();
`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const pagesBase = process.env.PAGES_BASE || 'http://localhost:8080/';
  mkdirSync('dist', { recursive: true });
  writeFileSync('dist/Bus490495.js', bundle({ pagesBase }));
  writeFileSync('dist/Bus.js', loader(pagesBase));
  copyFileSync('data/data.json', 'dist/data.json');
  writeFileSync('dist/index.html', '<!doctype html><meta charset="utf-8"><title>bus-roma</title><p>Loader Scriptable: <a href="Bus.js">Bus.js</a> · <a href="data.json">data.json</a></p>\n');
  console.log(`Bundle scritto in dist/ (PAGES_BASE=${pagesBase})`);
}
