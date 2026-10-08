// Genera dist/preview.html: la vista con dati veri, da aprire nel browser del PC.
// Uso: node scripts/preview-view.mjs [tiburtina|calabria] [--live]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { buildModel } from '../src/core/model.js';
import { decodeFeed } from '../src/core/pbf.js';

const RT_URL = 'https://romamobilita.it/sites/default/files/rome_rtgtfs_trip_updates_feed.pb';
const tab = process.argv.find(a => a === 'tiburtina' || a === 'calabria') || 'calabria';
let feed = null;
if (process.argv.includes('--live')) {
  const res = await fetch(RT_URL);
  feed = decodeFeed(new Uint8Array(await res.arrayBuffer()), { routes: ['490', '495'] });
}
const data = JSON.parse(readFileSync('data/data.json', 'utf8'));
const model = buildModel(data, feed, Date.now());
const html = readFileSync('src/view.html', 'utf8')
  .replace('</body>', `<script>init(${JSON.stringify(model)}, ${JSON.stringify(tab)});</script>\n</body>`);
mkdirSync('dist', { recursive: true });
writeFileSync('dist/preview.html', html);
console.log(`Scritto dist/preview.html (scheda ${tab}, tempo reale ${model.rtOk ? 'sì' : 'no'})`);
