// Scarica il GTFS statico di Roma, genera data/data.json e lo valida.
// Uso: node scripts/build-data.mjs [--dir <cartella GTFS già estratta>]
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { buildFromDir, validate } from './lib/gtfs.mjs';
import { romeDayKey, fmtMin } from '../src/core/schedule.js';

const ZIP_URL = 'https://romamobilita.it/sites/default/files/rome_static_gtfs.zip';

async function gtfsDir() {
  const i = process.argv.indexOf('--dir');
  if (i > -1) return process.argv[i + 1];
  const tmp = mkdtempSync(join(tmpdir(), 'gtfs-'));
  const res = await fetch(ZIP_URL);
  if (!res.ok) throw new Error(`Download GTFS fallito: HTTP ${res.status}`);
  writeFileSync(join(tmp, 'gtfs.zip'), Buffer.from(await res.arrayBuffer()));
  execFileSync('unzip', ['-q', '-o', join(tmp, 'gtfs.zip'), '-d', join(tmp, 'gtfs')]);
  return join(tmp, 'gtfs');
}

const data = await buildFromDir(await gtfsDir());
const today = romeDayKey(Date.now());
console.log(`Periodo ${data.range.join(' → ')}`);
for (const [key, s] of Object.entries(data.stops)) {
  console.log(`${key}: ids=${s.ids.join(',')} nome="${s.name}" schemi=${s.p.length} date=${Object.keys(s.d).length}`);
  const i = s.d[today];
  if (i !== undefined) {
    const grid = s.p[i].filter(([m]) => m >= s.grid[0] && m < s.grid[1]).map(([m, l]) => `${fmtMin(m)}(${l})`);
    console.log(`  oggi ${fmtMin(s.grid[0])}–${fmtMin(s.grid[1])}: ${grid.join(' ')}`);
  }
}
const errors = validate(data, today);
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
mkdirSync('data', { recursive: true });
writeFileSync('data/data.json', JSON.stringify(data));
console.log(`Scritto data/data.json (${JSON.stringify(data).length} byte)`);
