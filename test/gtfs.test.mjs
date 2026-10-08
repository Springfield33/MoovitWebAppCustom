import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { parseCsvLine, buildFromDir, validate } from '../scripts/lib/gtfs.mjs';

const DIR = fileURLToPath(new URL('./fixtures/gtfs-mini/', import.meta.url));

test('parseCsvLine gestisce virgolette, virgole e virgolette raddoppiate', () => {
  assert.deepEqual(parseCsvLine('70001,"PIAZZA FIUME, LATO A",41.9'), ['70001', 'PIAZZA FIUME, LATO A', '41.9']);
  assert.deepEqual(parseCsvLine('a,"b ""c""",'), ['a', 'b "c"', '']);
});

test('buildFromDir produce data.json per Tiburtina e Calabria', async () => {
  const data = await buildFromDir(DIR, { generated: '2026-10-06T02:00:00Z' });
  assert.deepEqual(data, {
    v: 1,
    generated: '2026-10-06T02:00:00Z',
    range: ['20261006', '20261011'],
    stops: {
      tiburtina: {
        ids: ['82007'], name: 'STAZ.NE TIBURTINA (MB)', dir: 0, grid: [420, 540],
        d: { '20261006': 0, '20261007': 0, '20261011': 1 },
        p: [[[430, 490], [540, 490], [1480, 490]], [[485, 495]]],
      },
      calabria: {
        ids: ['71406'], name: 'CALABRIA', dir: 1, grid: [960, 1080],
        d: { '20261006': 0, '20261007': 0 },
        p: [[[963, 490], [993, 495]]],
      },
    },
  });
});

test('validate segnala fermate senza orari per oggi', async () => {
  const data = await buildFromDir(DIR, { generated: 'x' });
  assert.deepEqual(validate(data, '20261006'), []);
  assert.deepEqual(validate(data, '20261011'), ['calabria: nessun orario per oggi (20261011)']);
  assert.deepEqual(validate(data, '20261201'), [
    'tiburtina: nessun orario per oggi (20261201)',
    'calabria: nessun orario per oggi (20261201)',
  ]);
});
