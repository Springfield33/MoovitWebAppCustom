import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  VT_BASE, TRAIN_BANDS, vtDate, partenzeUrl, queryTimes, bandForBusStop, bandAt,
} from '../src/core/trains.js';

const [MATTINA, POMERIGGIO] = TRAIN_BANDS;
// Ore di Roma dell'8/10/2026 (ora legale, +02:00); per dicembre (+01:00) i test usano istanti UTC espliciti.
const rome = (h, m) => Date.UTC(2026, 9, 8, h - 2, m);

test('fasce configurate come da spec', () => {
  assert.deepEqual([MATTINA.key, MATTINA.station, MATTINA.from, MATTINA.to, MATTINA.busStop], ['mattina', 'S08214', 390, 540, 'tiburtina']);
  assert.deepEqual([POMERIGGIO.key, POMERIGGIO.station, POMERIGGIO.from, POMERIGGIO.to, POMERIGGIO.busStop], ['pomeriggio', 'S08217', 990, 1110, 'calabria']);
  assert.ok(MATTINA.destinations.includes('FIUMICINO AEROPORTO'));
  assert.ok(POMERIGGIO.destinations.includes('FARA SABINA-MONTELIBRETTI'));
});

test('vtDate: formato Date.toString() in ora di Roma, legale e solare', () => {
  assert.equal(vtDate(Date.UTC(2026, 9, 8, 14, 30)), 'Thu Oct 08 2026 16:30:00 GMT+0200');
  assert.equal(vtDate(Date.UTC(2026, 11, 7, 5, 30)), 'Mon Dec 07 2026 06:30:00 GMT+0100');
});

test('partenzeUrl: spazi e + codificati come nelle chiamate verificate', () => {
  assert.equal(
    partenzeUrl('S08217', Date.UTC(2026, 9, 8, 14, 30)),
    VT_BASE + '/partenze/S08217/Thu%20Oct%2008%202026%2016:30:00%20GMT%2B0200',
  );
  assert.ok(VT_BASE.startsWith('http://www.viaggiatreno.it/'));
});

test('queryTimes: copre le partenze future della fascia a passi di 60 minuti', () => {
  assert.deepEqual(queryTimes(POMERIGGIO, rome(16, 0)), [rome(16, 30), rome(17, 30)]);
  assert.deepEqual(queryTimes(POMERIGGIO, rome(17, 45)), [rome(17, 45)]);
  assert.deepEqual(queryTimes(POMERIGGIO, rome(18, 31)), []);
  assert.deepEqual(queryTimes(MATTINA, rome(5, 0)), [rome(6, 30), rome(7, 30), rome(8, 30)]);
  assert.deepEqual(queryTimes(MATTINA, Date.UTC(2026, 11, 7, 6, 0)), [Date.UTC(2026, 11, 7, 6, 0), Date.UTC(2026, 11, 7, 7, 0)]);
});

test('bandForBusStop: fermata bus → fascia treni', () => {
  assert.equal(bandForBusStop('tiburtina'), MATTINA);
  assert.equal(bandForBusStop('calabria'), POMERIGGIO);
  assert.equal(bandForBusStop('altro'), null);
});

test('bandAt: controllo da 30\' prima, chiusura per 60\' dopo la fascia', () => {
  const at = ms => { const r = bandAt(ms); return r && `${r.band.key}:${r.phase}`; };
  assert.equal(at(rome(5, 59)), null);
  assert.equal(at(rome(6, 0)), 'mattina:check');
  assert.equal(at(rome(8, 59)), 'mattina:check');
  assert.equal(at(rome(9, 0)), 'mattina:close');
  assert.equal(at(rome(9, 59)), 'mattina:close');
  assert.equal(at(rome(10, 0)), null);
  assert.equal(at(rome(16, 0)), 'pomeriggio:check');
  assert.equal(at(rome(18, 30)), 'pomeriggio:close');
  assert.equal(at(rome(19, 30)), null);
  assert.equal(at(Date.UTC(2026, 11, 7, 5, 0)), 'mattina:check'); // 06:00 ora solare
  assert.equal(at(Date.UTC(2026, 11, 7, 4, 59)), null);
});
