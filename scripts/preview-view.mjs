// Genera dist/preview.html: la vista con dati veri, da aprire nel browser del PC.
// Uso: node scripts/preview-view.mjs [tiburtina|calabria] [--live]
// Senza --live i treni sono una demo dalle fixture dell'8/10/2026 (stessa lista per entrambe le schede).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { buildModel } from '../src/core/model.js';
import { decodeFeed } from '../src/core/pbf.js';
import { TRAIN_BANDS, bandForBusStop, selectTrains, fetchBand, trainsEntry, VT_UA } from '../src/core/trains.js';

const RT_URL = 'https://romamobilita.it/sites/default/files/rome_rtgtfs_trip_updates_feed.pb';
const tab = process.argv.find(a => a === 'tiburtina' || a === 'calabria') || 'calabria';
const live = process.argv.includes('--live');
const data = JSON.parse(readFileSync('data/data.json', 'utf8'));
const now = Date.now();
let feed = null;
const trains = {};
if (live) {
  const res = await fetch(RT_URL);
  feed = decodeFeed(new Uint8Array(await res.arrayBuffer()), { routes: ['490', '495'] });
  const getJson = async url => (await fetch(url, { headers: { 'User-Agent': VT_UA, Accept: 'application/json' } })).json();
  for (const key of Object.keys(data.stops)) {
    try { trains[key] = trainsEntry(await fetchBand(bandForBusStop(key), now, getJson)); } catch (e) { trains[key] = null; }
  }
} else {
  const fixture = JSON.parse(readFileSync('test/fixtures/vt-tiburtina.json', 'utf8'));
  const demo = { ...TRAIN_BANDS[1], from: 615, to: 720 };
  const list = selectTrains(fixture, demo, Date.UTC(2026, 9, 8, 8, 28));
  list[1] = { ...list[1], soppresso: true };
  for (const key of Object.keys(data.stops)) trains[key] = trainsEntry(list);
}
const model = buildModel(data, feed, now, trains);
const html = readFileSync('src/view.html', 'utf8')
  .replace('</body>', `<script>init(${JSON.stringify(model)}, ${JSON.stringify(tab)});</script>\n</body>`);
mkdirSync('dist', { recursive: true });
writeFileSync('dist/preview.html', html);
console.log(`Scritto dist/preview.html (scheda ${tab}, tempo reale ${model.rtOk ? 'sì' : 'no'}, treni ${live ? 'live' : 'demo'})`);
