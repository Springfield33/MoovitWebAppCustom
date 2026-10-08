import { test } from 'node:test';
import assert from 'node:assert/strict';
import { romeParts, romeDayKey, shiftDay, serviceBaseMs, scheduledEvents, hhmm, fmtMin } from '../src/core/schedule.js';

test('romeParts e romeDayKey usano il fuso di Roma', () => {
  const ms = Date.UTC(2026, 9, 6, 22, 30); // 00:30 del 7/10 a Roma (CEST)
  assert.deepEqual(romeParts(ms), { y: 2026, mo: 10, d: 7, h: 0, mi: 30, s: 0 });
  assert.equal(romeDayKey(ms), '20261007');
});

test('shiftDay attraversa mesi e anni', () => {
  assert.equal(shiftDay('20261231', 1), '20270101');
  assert.equal(shiftDay('20261101', -1), '20261031');
});

test('serviceBaseMs: giorno normale (CEST)', () => {
  assert.equal(serviceBaseMs('20261006') + 420 * 60000, Date.UTC(2026, 9, 6, 5, 0)); // 07:00 CEST
});

test('serviceBaseMs: cambio ora del 25/10/2026, le 07:00 restano le 07:00', () => {
  assert.equal(serviceBaseMs('20261025') + 420 * 60000, Date.UTC(2026, 9, 25, 6, 0)); // 07:00 CET
});

test('scheduledEvents include le corse dopo mezzanotte del giorno di servizio precedente', () => {
  const stop = { d: { '20261006': 0, '20261007': 1 }, p: [[[1450, 490]], [[420, 495]]] };
  const now = Date.UTC(2026, 9, 6, 22, 5); // 00:05 del 7/10 a Roma
  const ev = scheduledEvents(stop, now);
  assert.deepEqual(ev[0], { line: 490, day: '20261006', m: 1450, sched: Date.UTC(2026, 9, 6, 22, 10) });
  assert.deepEqual(ev[1], { line: 495, day: '20261007', m: 420, sched: Date.UTC(2026, 9, 7, 5, 0) });
  assert.equal(ev.length, 2);
});

test('scheduledEvents ordina per orario e poi per linea', () => {
  const stop = { d: { '20261006': 0 }, p: [[[993, 495], [993, 490], [963, 490]]] };
  const ev = scheduledEvents(stop, Date.UTC(2026, 9, 6, 12, 0));
  assert.deepEqual(ev.map(e => [e.m, e.line]), [[963, 490], [993, 490], [993, 495]]);
});

test('hhmm e fmtMin', () => {
  assert.equal(hhmm(Date.UTC(2026, 9, 6, 14, 3)), '16:03');
  assert.equal(fmtMin(1480), '00:40');
  assert.equal(fmtMin(963), '16:03');
});
