// Decoder protobuf minimale per GTFS-Realtime: legge solo i campi usati dall'app.

function pbVarint(r) {
  let n = 0, mul = 1, low = 0, shift = 0, b;
  do {
    b = r.buf[r.pos++];
    if (shift < 32) low |= (b & 0x7f) << shift;
    n += (b & 0x7f) * mul;
    mul *= 128;
    shift += 7;
  } while (b & 0x80);
  r.i32 = low | 0; // valore int32 con segno (ritardi negativi)
  return n;
}

function pbSkip(r, wt) {
  if (wt === 0) pbVarint(r);
  else if (wt === 1) r.pos += 8;
  else if (wt === 2) { const len = pbVarint(r); r.pos += len; }
  else if (wt === 5) r.pos += 4;
  else throw new Error('wire type non supportato: ' + wt);
}

function pbAscii(r, len) {
  let s = '';
  const end = r.pos + len;
  for (let i = r.pos; i < end; i++) s += String.fromCharCode(r.buf[i]);
  r.pos = end;
  return s;
}

// Chiama onField(field, wireType) per ogni campo; se restituisce false il campo viene saltato.
function pbFields(r, end, onField) {
  while (r.pos < end) {
    const key = pbVarint(r);
    const wt = key & 7;
    if (!onField(Math.floor(key / 8), wt)) pbSkip(r, wt);
  }
  r.pos = end;
}

function pbEvent(r, end) {
  const e = { delay: null, time: null };
  pbFields(r, end, (f, wt) => {
    if (f === 1 && wt === 0) { pbVarint(r); e.delay = r.i32; return true; }
    if (f === 2 && wt === 0) { e.time = pbVarint(r); return true; }
    return false;
  });
  return e;
}

function pbStopTime(r, end) {
  const u = { seq: null, stopId: null, arrival: null, departure: null, skipped: false };
  pbFields(r, end, (f, wt) => {
    if (wt === 2 && (f === 2 || f === 3 || f === 4)) {
      const len = pbVarint(r);
      const sub = r.pos + len;
      if (f === 4) u.stopId = pbAscii(r, len);
      else if (f === 2) u.arrival = pbEvent(r, sub);
      else u.departure = pbEvent(r, sub);
      return true;
    }
    if (f === 1 && wt === 0) { u.seq = pbVarint(r); return true; }
    if (f === 5 && wt === 0) { u.skipped = pbVarint(r) === 1; return true; }
    return false;
  });
  return u;
}

function pbTrip(r, end) {
  const t = { tripId: null, routeId: null, directionId: null, canceled: false };
  pbFields(r, end, (f, wt) => {
    if (wt === 2 && (f === 1 || f === 5)) {
      const s = pbAscii(r, pbVarint(r));
      if (f === 1) t.tripId = s; else t.routeId = s;
      return true;
    }
    if (f === 4 && wt === 0) { t.canceled = pbVarint(r) === 3; return true; }
    if (f === 6 && wt === 0) { t.directionId = pbVarint(r); return true; }
    return false;
  });
  return t;
}

function pbTripUpdate(r, end, routes) {
  let trip = null;
  const stops = [];
  pbFields(r, end, (f, wt) => {
    if (wt !== 2 || (f !== 1 && f !== 2)) return false;
    const len = pbVarint(r);
    const sub = r.pos + len;
    if (f === 1) {
      trip = pbTrip(r, sub);
      if (routes && !routes.includes(trip.routeId)) r.pos = end; // linea non richiesta: salta il resto
    } else {
      stops.push(pbStopTime(r, sub));
    }
    return true;
  });
  if (!trip || (routes && !routes.includes(trip.routeId))) return null;
  return { ...trip, stops };
}

export function decodeFeed(buf, opts = {}) {
  const routes = opts.routes || null;
  const r = { buf, pos: 0, i32: 0 };
  const feed = { timestamp: null, trips: [] };
  pbFields(r, buf.length, (f, wt) => {
    if (wt !== 2) return false;
    const len = pbVarint(r);
    const sub = r.pos + len;
    if (f === 1) {
      pbFields(r, sub, (hf, hwt) => {
        if (hf === 3 && hwt === 0) { feed.timestamp = pbVarint(r); return true; }
        return false;
      });
    } else if (f === 2) {
      pbFields(r, sub, (ef, ewt) => {
        if (ef !== 3 || ewt !== 2) return false;
        const l = pbVarint(r);
        const t = pbTripUpdate(r, r.pos + l, routes);
        if (t) feed.trips.push(t);
        return true;
      });
    } else {
      r.pos = sub;
    }
    return true;
  });
  return feed;
}
