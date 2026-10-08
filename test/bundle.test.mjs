import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import GtfsRealtimeBindings from 'gtfs-realtime-bindings';
import { bundle, loader } from '../scripts/bundle.mjs';

const BASE = 'https://utente.github.io/bus-roma/';

function load(code) {
  const mod = { exports: {} };
  new Function('module', code)(mod);
  return mod.exports;
}

test('il bundle si carica ed espone main, buildModel, decodeFeed', () => {
  const code = bundle({ pagesBase: BASE });
  assert.match(code, /const PAGES_BASE = "https:\/\/utente\.github\.io\/bus-roma\/";/);
  assert.match(code, /function init\(model, tab\)/); // view.html incorporata
  assert.match(code, /id=\\"trSec\\"/); // sezione treni nella vista incorporata
  assert.doesNotMatch(code, /^import\s/m);
  assert.doesNotMatch(code, /^export\s/m);
  const api = load(code);
  assert.equal(typeof api.main, 'function');
  assert.equal(typeof api.buildModel, 'function');
  assert.equal(typeof api.decodeFeed, 'function');
});

test('la logica nel bundle funziona: feed codificato → passaggio live', () => {
  const api = load(bundle({ pagesBase: BASE }));
  const rt = GtfsRealtimeBindings.transit_realtime;
  const now = Date.UTC(2026, 9, 6, 13, 0);
  const sched = Date.UTC(2026, 9, 6, 14, 3);
  const bytes = rt.FeedMessage.encode(rt.FeedMessage.fromObject({
    header: { gtfsRealtimeVersion: '2.0', timestamp: now / 1000 },
    entity: [{ id: 'a', tripUpdate: { trip: { tripId: 't', routeId: '490', directionId: 1 },
      stopTimeUpdate: [{ stopSequence: 24, stopId: '71406', arrival: { delay: 120, time: sched / 1000 + 120 } }] } }],
  })).finish();
  const data = { v: 1, generated: '2026-10-06T02:00:00Z', range: ['20261006', '20261006'], stops: {
    calabria: { ids: ['71406'], name: 'CALABRIA', dir: 1, grid: [960, 1080], d: { '20261006': 0 }, p: [[[963, 490]]] } } };
  const m = api.buildModel(data, api.decodeFeed(bytes, { routes: ['490', '495'] }), now);
  assert.equal(m.stops.calabria.next[0].live, true);
  assert.equal(m.stops.calabria.next[0].delaySec, 120);
});

test('bundle rifiuta nomi top-level duplicati', () => {
  const root = mkdtempSync(join(tmpdir(), 'bundle-'));
  mkdirSync(join(root, 'src'), { recursive: true });
  writeFileSync(join(root, 'src/view.html'), '<p></p>');
  writeFileSync(join(root, 'a.js'), 'export function main() {}\n');
  writeFileSync(join(root, 'b.js'), 'const main = 1;\n');
  assert.throws(() => bundle({ root, pagesBase: BASE, files: ['a.js', 'b.js'] }), /duplicato "main"/);
});

test('loader punta a Bus490495.js su Pages', () => {
  const code = loader(BASE);
  assert.match(code, /const BASE = "https:\/\/utente\.github\.io\/bus-roma\/";/);
  assert.match(code, /BASE \+ 'Bus490495\.js'/);
  assert.match(code, /importModule\(lib\)\.main\(\)/);
});

test('il bundle include la logica treni', () => {
  const api = load(bundle({ pagesBase: BASE }));
  const tib = JSON.parse(readFileSync(new URL('./fixtures/vt-tiburtina.json', import.meta.url)));
  const band = { key: 't', station: 'S08217', from: 615, to: 660, destinations: ['FARA SABINA-MONTELIBRETTI'] };
  const list = api.selectTrains(tib, band, Date.UTC(2026, 9, 8, 8, 28));
  assert.equal(api.worstLabel(list), "+13'");
});
