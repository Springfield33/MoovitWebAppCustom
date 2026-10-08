import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rtEvents, annotate, nextDepartures, gridDepartures, delayLabel } from '../src/core/merge.js';

const T = Date.UTC(2026, 9, 6, 14, 3); // 16:03 Roma
const stu = (stopId, arrival, departure = null, skipped = false) => ({ seq: 24, stopId, arrival, departure, skipped });
const trip = (routeId, directionId, stops, canceled = false) => ({ tripId: 't', routeId, directionId, canceled, stops });

test('rtEvents filtra linea, direzione e fermata e preferisce la partenza', () => {
  const feed = { timestamp: T / 1000, trips: [
    trip('490', 1, [stu('71406', { delay: 60, time: T / 1000 + 60 }, { delay: 90, time: T / 1000 + 90 })]),
    trip('62', 1, [stu('71406', { delay: 0, time: T / 1000 })]),
    trip('495', 0, [stu('71406', { delay: 0, time: T / 1000 })]),
    trip('495', 1, [stu('99999', { delay: 0, time: T / 1000 })]),
    trip('495', null, [stu('71406', { delay: null, time: T / 1000 + 600 })]),
    trip('490', 1, [stu('71406', { delay: 30, time: null })]),
  ] };
  assert.deepEqual(rtEvents(feed, ['71406'], 1, [490, 495]), [
    { line: 490, predicted: T + 90000, delaySec: 90, sched: T, canceled: false },
    { line: 495, predicted: T + 600000, delaySec: 0, sched: T + 600000, canceled: false },
  ]);
});

test('rtEvents segna soppresse le corse cancellate e le fermate saltate', () => {
  const feed = { timestamp: 0, trips: [
    trip('490', 1, [stu('71406', { delay: 0, time: T / 1000 })], true),
    trip('495', 1, [stu('71406', { delay: 0, time: T / 1000 }, null, true)]),
  ] };
  assert.deepEqual(rtEvents(feed, ['71406'], 1, [490, 495]).map(e => e.canceled), [true, true]);
});

const S = (line, minute, day = '20261006') => ({ line, day, m: minute, sched: Date.UTC(2026, 9, 6, 14, minute - 960) });

test('annotate abbina entro ±2 minuti alla corsa più vicina della stessa linea', () => {
  const sched = [S(490, 963), S(490, 965), S(495, 963)];
  const rt = [{ line: 490, predicted: T + 300000, delaySec: 300, sched: T + 100000, canceled: false }];
  const ev = annotate(sched, rt);
  assert.equal(ev.length, 3);
  assert.equal(ev[1].live, true); // 16:05 dista 20 s, 16:03 dista 100 s
  assert.equal(ev[1].predicted, T + 300000);
  assert.equal(ev[0].live, false);
  assert.equal(ev[0].predicted, ev[0].sched);
  assert.equal(ev[2].live, false);
});

test('annotate aggiunge come live le corse RT senza corrispondenza', () => {
  const rt = [{ line: 495, predicted: T + 3600000, delaySec: 0, sched: T + 3600000, canceled: false }];
  const ev = annotate([S(490, 963)], rt);
  assert.deepEqual(ev[1], { line: 495, day: null, m: null, sched: T + 3600000, predicted: T + 3600000, delaySec: 0, live: true, canceled: false });
});

test('annotate non abbina due RT alla stessa corsa', () => {
  const rt = [
    { line: 490, predicted: T, delaySec: 0, sched: T, canceled: false },
    { line: 490, predicted: T + 30000, delaySec: 0, sched: T + 30000, canceled: false },
  ];
  const ev = annotate([S(490, 963)], rt);
  assert.equal(ev.length, 2);
  assert.ok(ev.every(e => e.live));
});

test('nextDepartures tiene le corse da 1 minuto fa in poi, ordinate per orario previsto', () => {
  const ev = annotate([S(490, 963), S(495, 973), S(490, 983)], [{ line: 490, predicted: T + 1500000, delaySec: 1500, sched: T, canceled: false }]);
  const next = nextDepartures(ev, T - 30000, 5);
  assert.deepEqual(next.map(e => [e.line, e.m]), [[495, 973], [490, 983], [490, 963]]);
  assert.equal(nextDepartures(ev, T + 2000000, 5).length, 0);
  assert.equal(nextDepartures(ev, T - 30000, 2).length, 2);
});

test('gridDepartures filtra giorno e fascia [inizio, fine) ed esclude le corse RT extra', () => {
  const ev = annotate([S(490, 959), S(490, 960), S(495, 1080), S(490, 970, '20261007')],
    [{ line: 495, predicted: T, delaySec: 0, sched: T + 999999, canceled: false }]);
  assert.deepEqual(gridDepartures(ev, '20261006', [960, 1080]).map(e => e.m), [960]);
});

test('delayLabel', () => {
  assert.equal(delayLabel(null), '');
  assert.equal(delayLabel(342), "+6'");
  assert.equal(delayLabel(-464), "−8'");
  assert.equal(delayLabel(20), "0'");
});
