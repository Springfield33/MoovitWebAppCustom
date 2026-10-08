import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  VT_BASE, TRAIN_BANDS, vtDate, partenzeUrl, queryTimes, bandForBusStop, bandAt,
  selectTrains, isAlert, trainState, trainLabel, worstLabel, trainsEntry, fetchBand, diffSnapshots,
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

const TIB = JSON.parse(readFileSync(new URL('./fixtures/vt-tiburtina.json', import.meta.url)));
const FARA = JSON.parse(readFileSync(new URL('./fixtures/vt-fara.json', import.meta.url)));
const FIX_NOW = Date.UTC(2026, 9, 8, 8, 28); // 10:28 Roma, quando sono state scaricate
const TEST_POM = { ...POMERIGGIO, from: 615, to: 660 }; // 10:15–11:00 verso Fara
const TEST_MAT = { ...MATTINA, from: 990, to: 1080 };   // 16:30–18:00 verso Roma

test('selectTrains: fascia e destinazione, ordinati, normalizzati', () => {
  const list = selectTrains(TIB, TEST_POM, FIX_NOW);
  assert.deepEqual(list.map(t => `${t.orario} ${t.numero} ${t.ritardo}`), ['10:16 20613 8', '10:31 20615 4', '10:46 20621 13']);
  assert.deepEqual(list[2], {
    numero: 20621, categoria: 'REG', destinazione: 'FARA SABINA-MONTELIBRETTI',
    orario: '10:46', partenzaMs: Date.UTC(2026, 9, 8, 8, 46), ritardo: 13, soppresso: false,
  });
});

test('selectTrains: da Fara tiene solo i treni verso Roma', () => {
  const list = selectTrains(FARA, TEST_MAT, FIX_NOW);
  assert.deepEqual(list.map(t => t.numero), [20521, 20523, 20527, 20517, 20531, 20533]);
});

test('selectTrains: dedup tra chiamate sovrapposte, altro giorno escluso', () => {
  assert.equal(selectTrains([...TIB, ...TIB], TEST_POM, FIX_NOW).length, 3);
  assert.equal(selectTrains(TIB, TEST_POM, FIX_NOW + 86400000).length, 0);
});

test('selectTrains: input non-array → errore', () => {
  assert.throws(() => selectTrains({ error: 'x' }, TEST_POM, FIX_NOW), /Viaggiatreno/);
  assert.throws(() => selectTrains(null, TEST_POM, FIX_NOW), /Viaggiatreno/);
});

test('soppressione, anticipo e provvedimento assente', () => {
  const base = TIB.find(t => t.numeroTreno === 20615);
  const [sopp] = selectTrains([{ ...base, provvedimento: 1 }], TEST_POM, FIX_NOW);
  const [early] = selectTrains([{ ...base, ritardo: -3 }], TEST_POM, FIX_NOW);
  const [noProv] = selectTrains([{ ...base, provvedimento: undefined }], TEST_POM, FIX_NOW);
  assert.equal(sopp.soppresso, true);
  assert.equal(noProv.soppresso, false);
  assert.equal(trainState(sopp), 'SOPPRESSO');
  assert.equal(trainState(early), 'in orario');
  assert.equal(isAlert(early), false);
  assert.equal(isAlert(sopp), true);
});

test('isAlert, trainState, trainLabel, worstLabel', () => {
  const [a, b, c] = selectTrains(TIB, TEST_POM, FIX_NOW); // +8, +4, +13
  assert.equal(isAlert(a), false);
  assert.equal(isAlert({ ...a, ritardo: 10 }), true);
  assert.equal(isAlert(c), true);
  assert.equal(trainState(b), "+4'");
  assert.equal(trainLabel(c), 'REG 20621 (10:46)');
  assert.equal(worstLabel([a, b]), null);
  assert.equal(worstLabel([a, b, c]), "+13'");
  assert.equal(worstLabel([c, { ...b, soppresso: true }]), 'SOPPR');
  assert.equal(worstLabel([]), null);
});

test('trainsEntry: aggiunge stato e allerta per la vista', () => {
  const e = trainsEntry(selectTrains(TIB, TEST_POM, FIX_NOW));
  assert.equal(e.alert, "+13'");
  assert.deepEqual(e.list.map(t => [t.state, t.late]), [["+8'", false], ["+4'", false], ["+13'", true]]);
});

test('fetchBand: una chiamata per queryTimes, risultati uniti e filtrati', async () => {
  const urls = [];
  const list = await fetchBand(TEST_POM, Date.UTC(2026, 9, 8, 8, 0), async url => { urls.push(url); return TIB; });
  assert.equal(urls.length, 1); // 10:15–11:00 → una sola chiamata
  assert.match(urls[0], /\/partenze\/S08217\/Thu%20Oct%2008%202026%2010:15:00%20GMT%2B0200$/);
  assert.equal(list.length, 3);
  await assert.rejects(fetchBand(TEST_POM, Date.UTC(2026, 9, 8, 8, 0), async () => '<html>'), /Viaggiatreno/);
  assert.deepEqual(await fetchBand(TEST_POM, Date.UTC(2026, 9, 8, 12, 0), async () => { throw new Error('non chiamare'); }), []);
});

const T = (numero, orario, ritardo, soppresso = false) => ({ numero, categoria: 'REG', destinazione: 'FARA SABINA-MONTELIBRETTI', orario, partenzaMs: 0, ritardo, soppresso });

test('diffSnapshots: ingresso in allerta e nuova soppressione', () => {
  assert.deepEqual(diffSnapshots([], [T(1, '16:31', 4), T(2, '16:46', 13)]), ["REG 2 (16:46): +13'"]);
  assert.deepEqual(diffSnapshots([T(1, '16:31', 4)], [T(1, '16:31', 4, true)]), ['REG 1 (16:31): SOPPRESSO']);
  assert.deepEqual(diffSnapshots([T(2, '16:46', 13)], [T(2, '16:46', 13, true)]), ["REG 2 (16:46): +13' → SOPPRESSO"]);
});

test('diffSnapshots: miglioramenti', () => {
  assert.deepEqual(diffSnapshots([T(2, '16:46', 13)], [T(2, '16:46', 4)]), ["REG 2 (16:46) rientrato: +4'"]);
  assert.deepEqual(diffSnapshots([T(2, '16:46', 0, true)], [T(2, '16:46', 3)]), ["REG 2 (16:46): soppressione revocata, +3'"]);
  assert.deepEqual(diffSnapshots([T(2, '16:46', 0, true)], [T(2, '16:46', 15)]), ["REG 2 (16:46): soppressione revocata, +15'"]);
  assert.deepEqual(diffSnapshots([T(2, '16:46', 25)], [T(2, '16:46', 15)]), ["REG 2 (16:46): +25' → +15'"]);
});

test('diffSnapshots: variazioni sotto i 5 minuti e treni partiti ignorati', () => {
  assert.deepEqual(diffSnapshots([T(2, '16:46', 13)], [T(2, '16:46', 17)]), []);
  assert.deepEqual(diffSnapshots([T(2, '16:46', 13)], [T(2, '16:46', 18)]), ["REG 2 (16:46): +13' → +18'"]);
  assert.deepEqual(diffSnapshots([T(1, '16:31', 4), T(2, '16:46', 3)], [T(1, '16:31', 9)]), []);
  assert.deepEqual(diffSnapshots([T(2, '16:46', 30)], []), []); // partito: sparito dal tabellone
});

test('selectTrains: numero treno non numerico scartato (finisce nella WebView)', () => {
  const base = TIB.find(t => t.numeroTreno === 20615);
  assert.deepEqual(selectTrains([{ ...base, numeroTreno: '<img src=x onerror=alert(1)>' }], TEST_POM, FIX_NOW), []);
  assert.equal(selectTrains([{ ...base, numeroTreno: '20615' }], TEST_POM, FIX_NOW)[0].numero, 20615);
});
