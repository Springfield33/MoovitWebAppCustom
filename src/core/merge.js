// Unione dei passaggi in tempo reale con quelli programmati.

const MATCH_MS = 120000;

export function rtEvents(feed, stopIds, dir, lines) {
  const out = [];
  for (const t of feed.trips) {
    const line = Number(t.routeId);
    if (!lines.includes(line)) continue;
    if (t.directionId !== null && t.directionId !== dir) continue;
    const u = t.stops.find(s => stopIds.includes(s.stopId));
    if (!u) continue;
    const ev = u.departure && u.departure.time ? u.departure : u.arrival;
    if (!ev || !ev.time) continue;
    const delaySec = ev.delay ?? 0;
    const predicted = ev.time * 1000;
    out.push({ line, predicted, delaySec, sched: predicted - delaySec * 1000, canceled: t.canceled || u.skipped });
  }
  return out;
}

export function annotate(sched, rt) {
  const events = sched.map(e => ({ ...e, predicted: e.sched, delaySec: null, live: false, canceled: false }));
  for (const r of rt) {
    let best = null;
    for (const e of events) {
      if (e.live || e.line !== r.line) continue;
      const diff = Math.abs(e.sched - r.sched);
      if (diff <= MATCH_MS && (!best || diff < best.diff)) best = { e, diff };
    }
    const target = best ? best.e : { line: r.line, day: null, m: null, sched: r.sched };
    Object.assign(target, { predicted: r.predicted, delaySec: r.delaySec, live: true, canceled: r.canceled });
    if (!best) events.push(target);
  }
  return events;
}

export function nextDepartures(events, nowMs, n) {
  return events
    .filter(e => e.predicted >= nowMs - 60000)
    .sort((a, b) => a.predicted - b.predicted || a.line - b.line)
    .slice(0, n);
}

export function gridDepartures(events, dayKey, grid) {
  return events
    .filter(e => e.day === dayKey && e.m >= grid[0] && e.m < grid[1])
    .sort((a, b) => a.sched - b.sched || a.line - b.line);
}

export function delayLabel(sec) {
  if (sec === null || sec === undefined) return '';
  const m = Math.round(sec / 60);
  return m > 0 ? `+${m}'` : m < 0 ? `−${-m}'` : "0'";
}
