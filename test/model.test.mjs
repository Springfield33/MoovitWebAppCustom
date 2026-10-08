import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildModel, autoStop } from '../src/core/model.js';
import { hhmm } from '../src/core/schedule.js';

// Schema feriale Calabria (dall'artifact), solo attorno alla fascia 16–18.
const REF = [[953,490],[957,495],[963,490],[973,490],[975,495],[983,490],[993,490],[993,495],[1003,490],[1012,495],[1014,490],[1024,490],[1025,495],[1034,490],[1038,495],[1044,490],[1044,495],[1051,495],[1054,490],[1063,495],[1064,490],[1074,490],[1076,495],[1084,490],[1088,495]];
const EXPECTED = '16:03(490) 16:13(490) 16:15(495) 16:23(490) 16:33(490) 16:33(495) 16:43(490) 16:52(495) 16:54(490) 17:04(490) 17:05(495) 17:14(490) 17:18(495) 17:24(490) 17:24(495) 17:31(495) 17:34(490) 17:43(495) 17:44(490) 17:54(490) 17:56(495)';

const data = (overrides = {}) => ({
  v: 1, generated: '2026-10-06T02:00:00Z', range: ['20261005', '20261111'],
  stops: {
    tiburtina: { ids: ['82007'], name: 'STAZ.NE TIBURTINA (MB)', dir: 0, grid: [420, 540], d: { '20261006': 0 }, p: [[[430, 490], [485, 495]]] },
    calabria: { ids: ['71406'], name: 'CALABRIA', dir: 1, grid: [960, 1080], d: { '20261006': 0 }, p: [REF] },
  },
  ...overrides,
});

const NOW = Date.UTC(2026, 9, 6, 14, 0); // 16:00 Roma: 15:53 e 15:57 sono già passati

test('griglia Calabria del 06/10 coincide con il riferimento del handoff', () => {
  const m = buildModel(data(), null, NOW);
  assert.equal(m.stops.calabria.table.map(e => `${hhmm(e.sched)}(${e.line})`).join(' '), EXPECTED);
});

test('senza feed: solo programmati, rtOk falso, 5 prossimi', () => {
  const m = buildModel(data(), null, NOW);
  assert.equal(m.rtOk, false);
  assert.equal(m.dataOk, true);
  assert.equal(m.stops.calabria.next.length, 5);
  assert.ok(m.stops.calabria.next.every(e => !e.live));
  assert.equal(m.stops.calabria.next[0].m, 963);
});

test('feed recente: la corsa abbinata diventa live con ritardo', () => {
  const sched963 = Date.UTC(2026, 9, 6, 14, 3);
  const feed = { timestamp: NOW / 1000, trips: [{ tripId: 't', routeId: '490', directionId: 1, canceled: false,
    stops: [{ seq: 24, stopId: '71406', arrival: { delay: 300, time: sched963 / 1000 + 300 }, departure: null, skipped: false }] }] };
  const m = buildModel(data(), feed, NOW);
  assert.equal(m.rtOk, true);
  const first = m.stops.calabria.next[0];
  assert.deepEqual([first.m, first.live, first.delaySec, first.predicted], [963, true, 300, sched963 + 300000]);
  assert.equal(m.stops.tiburtina.next.every(e => !e.live), true);
});

test('feed di 6 minuti fa: ignorato', () => {
  const feed = { timestamp: NOW / 1000 - 360, trips: [] };
  assert.equal(buildModel(data(), feed, NOW).rtOk, false);
});

test('dataOk falso se manca la data odierna o i dati hanno più di 3 giorni', () => {
  assert.equal(buildModel(data(), null, Date.UTC(2026, 9, 7, 13, 0)).dataOk, false);
  assert.equal(buildModel(data({ generated: '2026-10-02T02:00:00Z' }), null, NOW).dataOk, false);
});

test('auto: mattina Tiburtina, pomeriggio Calabria', () => {
  assert.equal(buildModel(data(), null, Date.UTC(2026, 9, 6, 6, 0)).auto, 'tiburtina');
  assert.equal(buildModel(data(), null, Date.UTC(2026, 9, 6, 10, 0)).auto, 'calabria');
});

test('trains: passati nel modello così come sono, default vuoto', () => {
  const tr = { calabria: { list: [], alert: null }, tiburtina: null };
  assert.deepEqual(buildModel(data(), null, NOW).trains, {});
  assert.equal(buildModel(data(), null, NOW, tr).trains, tr);
});

test('autoStop coincide con model.auto', () => {
  assert.equal(autoStop(Date.UTC(2026, 9, 6, 6, 0)), 'tiburtina');
  assert.equal(autoStop(Date.UTC(2026, 9, 6, 10, 0)), 'calabria');
});
