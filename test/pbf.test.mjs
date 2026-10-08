import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import GtfsRealtimeBindings from 'gtfs-realtime-bindings';
import { decodeFeed } from '../src/core/pbf.js';
import { b64ToBytes } from '../src/core/b64.js';

const rt = GtfsRealtimeBindings.transit_realtime;

function encode(obj) {
  return rt.FeedMessage.encode(rt.FeedMessage.fromObject(obj)).finish();
}

const SAMPLE = {
  header: { gtfsRealtimeVersion: '2.0', timestamp: 1791442500 },
  entity: [
    { id: 'a', tripUpdate: { trip: { tripId: '0#1-1', routeId: '495', directionId: 1 }, stopTimeUpdate: [
      { stopSequence: 24, stopId: '71406', arrival: { delay: -464, time: 1791443980 }, departure: { delay: -464, time: 1791443980 } },
    ] } },
    { id: 'b', tripUpdate: { trip: { tripId: '0#2-1', routeId: '490', scheduleRelationship: 'CANCELED' }, stopTimeUpdate: [
      { stopSequence: 1, stopId: '82007', scheduleRelationship: 'SKIPPED' },
    ] } },
    { id: 'c', tripUpdate: { trip: { tripId: 'x', routeId: '62', directionId: 0 }, stopTimeUpdate: [
      { stopSequence: 1, stopId: '1', arrival: { time: 1 } },
    ] } },
    { id: 'd', vehicle: { trip: { tripId: 'v' } } },
  ],
};

const A = { tripId: '0#1-1', routeId: '495', directionId: 1, canceled: false, stops: [
  { seq: 24, stopId: '71406', arrival: { delay: -464, time: 1791443980 }, departure: { delay: -464, time: 1791443980 }, skipped: false },
] };
const B = { tripId: '0#2-1', routeId: '490', directionId: null, canceled: true, stops: [
  { seq: 1, stopId: '82007', arrival: null, departure: null, skipped: true },
] };
const C = { tripId: 'x', routeId: '62', directionId: 0, canceled: false, stops: [
  { seq: 1, stopId: '1', arrival: { delay: null, time: 1 }, departure: null, skipped: false },
] };

test('decodeFeed legge header, ritardi negativi, soppressioni e campi assenti', () => {
  assert.deepEqual(decodeFeed(encode(SAMPLE)), { timestamp: 1791442500, trips: [A, B, C] });
});

test('decodeFeed con filtro linee salta le altre corse', () => {
  assert.deepEqual(decodeFeed(encode(SAMPLE), { routes: ['490', '495'] }).trips, [A, B]);
});

test('decodeFeed accetta anche un array di numeri', () => {
  assert.deepEqual(decodeFeed(Array.from(encode(SAMPLE))).trips.length, 3);
});

const has = (o, k) => o != null && Object.prototype.hasOwnProperty.call(o, k);
const num = v => (v == null ? null : Number(typeof v === 'object' ? v.toString() : v));
const ev = e => (e ? { delay: has(e, 'delay') ? e.delay : null, time: has(e, 'time') ? num(e.time) : null } : null);

function fromBindings(buf, routes) {
  const f = rt.FeedMessage.decode(buf);
  const trips = [];
  for (const e of f.entity) {
    const tu = e.tripUpdate;
    if (!tu || !routes.includes(tu.trip.routeId)) continue;
    trips.push({
      tripId: tu.trip.tripId, routeId: tu.trip.routeId,
      directionId: has(tu.trip, 'directionId') ? tu.trip.directionId : null,
      canceled: tu.trip.scheduleRelationship === 3,
      stops: tu.stopTimeUpdate.map(u => ({
        seq: has(u, 'stopSequence') ? u.stopSequence : null,
        stopId: has(u, 'stopId') ? u.stopId : null,
        arrival: ev(u.arrival), departure: ev(u.departure),
        skipped: u.scheduleRelationship === 1,
      })),
    });
  }
  return { timestamp: num(f.header.timestamp), trips };
}

const FIXTURE = new URL('./fixtures/trip_updates.pb', import.meta.url);
test('decodeFeed coincide con gtfs-realtime-bindings sul feed reale', { skip: !existsSync(FIXTURE) }, () => {
  const buf = new Uint8Array(readFileSync(FIXTURE));
  const routes = ['490', '495'];
  const ours = decodeFeed(buf, { routes });
  assert.ok(ours.trips.length > 0, 'il campione deve contenere corse 490/495');
  assert.deepEqual(ours, fromBindings(buf, routes));
});

test('b64ToBytes coincide con Buffer per lunghezze 0..10 e 1000', () => {
  for (const n of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 1000]) {
    const bytes = Uint8Array.from({ length: n }, (_, i) => (i * 37 + 11) % 256);
    assert.deepEqual(b64ToBytes(Buffer.from(bytes).toString('base64')), bytes);
  }
});
