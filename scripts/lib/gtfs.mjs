// Lettura del GTFS statico (in streaming) e costruzione di data.json per le fermate configurate.
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { join } from 'node:path';

export const LINES = ['490', '495'];
export const STOPS = {
  tiburtina: { rule: 'first', direction: 0, nameRe: /TIBURTINA/i, grid: [420, 540] },
  calabria: { rule: 'stop', stopId: '71406', direction: 1, grid: [960, 1080] },
};

export function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c !== '"') cur += c;
      else if (line[i + 1] === '"') { cur += '"'; i++; }
      else quoted = false;
    } else if (c === '"') quoted = true;
    else if (c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

async function* csvRows(path) {
  const rl = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
  let head = null;
  for await (const raw of rl) {
    if (!raw.trim()) continue;
    const cells = parseCsvLine(raw);
    if (!head) { head = cells.map(h => h.replace(/^﻿/, '').trim()); continue; }
    const row = {};
    head.forEach((h, i) => { row[h] = (cells[i] ?? '').trim(); });
    yield row;
  }
}

function toMinutes(t) {
  if (!t) return null;
  const [h, m] = t.split(':');
  return Number(h) * 60 + Number(m);
}

export async function buildFromDir(dir, { lines = LINES, stops = STOPS, generated = new Date().toISOString() } = {}) {
  const trips = new Map();
  for await (const r of csvRows(join(dir, 'trips.txt'))) {
    if (lines.includes(r.route_id)) trips.set(r.trip_id, { line: Number(r.route_id), service: r.service_id, dir: Number(r.direction_id) });
  }
  const names = new Map();
  for await (const r of csvRows(join(dir, 'stops.txt'))) names.set(r.stop_id, r.stop_name);

  const watched = new Set(Object.values(stops).filter(s => s.rule === 'stop').map(s => s.stopId));
  const info = new Map(); // trip_id → { first, maxSeq, hits }
  for await (const r of csvRows(join(dir, 'stop_times.txt'))) {
    if (!trips.has(r.trip_id)) continue;
    const row = { stop: r.stop_id, seq: Number(r.stop_sequence), m: toMinutes(r.departure_time || r.arrival_time) };
    let t = info.get(r.trip_id);
    if (!t) info.set(r.trip_id, (t = { first: row, maxSeq: row.seq, hits: [] }));
    if (row.seq < t.first.seq) t.first = row;
    if (row.seq > t.maxSeq) t.maxSeq = row.seq;
    if (watched.has(row.stop)) t.hits.push(row);
  }

  const byDate = new Map();
  for await (const r of csvRows(join(dir, 'calendar_dates.txt'))) {
    if (r.exception_type !== '1') continue;
    if (!byDate.has(r.date)) byDate.set(r.date, []);
    byDate.get(r.date).push(r.service_id);
  }
  const dates = [...byDate.keys()].sort();

  const result = { v: 1, generated, range: [dates[0] ?? null, dates[dates.length - 1] ?? null], stops: {} };
  for (const [key, cfg] of Object.entries(stops)) {
    const bySvc = new Map();
    const ids = new Set();
    for (const [tripId, t] of info) {
      const trip = trips.get(tripId);
      if (trip.dir !== cfg.direction) continue;
      let row = null;
      if (cfg.rule === 'first') {
        if (t.first.seq !== t.maxSeq && cfg.nameRe.test(names.get(t.first.stop) || '')) row = t.first;
      } else {
        row = t.hits.find(h => h.stop === cfg.stopId && h.seq !== t.maxSeq) || null;
      }
      if (!row || row.m === null) continue;
      ids.add(row.stop);
      if (!bySvc.has(trip.service)) bySvc.set(trip.service, []);
      bySvc.get(trip.service).push([row.m, trip.line]);
    }
    const p = [];
    const pIndex = new Map();
    const d = {};
    for (const date of dates) {
      const ev = byDate.get(date).flatMap(s => bySvc.get(s) || []).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      if (!ev.length) continue;
      const k = JSON.stringify(ev);
      if (!pIndex.has(k)) { pIndex.set(k, p.length); p.push(ev); }
      d[date] = pIndex.get(k);
    }
    const idList = [...ids].sort();
    result.stops[key] = { ids: idList, name: names.get(idList[0]) || key, dir: cfg.direction, grid: cfg.grid, d, p };
  }
  return result;
}

export function validate(data, todayKey) {
  const errors = [];
  for (const [key, s] of Object.entries(data.stops)) {
    if (!s.ids.length || !s.p.length) errors.push(`${key}: nessun passaggio trovato`);
    else if (s.d[todayKey] === undefined) errors.push(`${key}: nessun orario per oggi (${todayKey})`);
  }
  return errors;
}
