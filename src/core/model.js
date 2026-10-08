// Modello unico per widget e vista: prossimi passaggi e griglia di ogni fermata.
import { romeDayKey, romeParts, scheduledEvents } from './schedule.js';
import { rtEvents, annotate, nextDepartures, gridDepartures } from './merge.js';

const MODEL_LINES = [490, 495];
const FEED_MAX_AGE_MS = 5 * 60000;
const DATA_MAX_AGE_MS = 3 * 86400000;

export function autoStop(nowMs) {
  return romeParts(nowMs).h < 12 ? 'tiburtina' : 'calabria';
}

export function buildModel(data, feed, nowMs, trains = {}) {
  const rtOk = !!feed && feed.timestamp !== null && nowMs - feed.timestamp * 1000 <= FEED_MAX_AGE_MS;
  const today = romeDayKey(nowMs);
  let dataOk = nowMs - Date.parse(data.generated) <= DATA_MAX_AGE_MS;
  const stops = {};
  for (const [key, s] of Object.entries(data.stops)) {
    if (s.d[today] === undefined) dataOk = false;
    const rt = rtOk ? rtEvents(feed, s.ids, s.dir, MODEL_LINES) : [];
    const events = annotate(scheduledEvents(s, nowMs), rt);
    stops[key] = { key, name: s.name, grid: s.grid, next: nextDepartures(events, nowMs, 5), table: gridDepartures(events, today, s.grid) };
  }
  return { now: nowMs, today, rtOk, dataOk, generated: data.generated, auto: autoStop(nowMs), stops, trains };
}
