// Fuso orario di Roma, giorni di servizio GTFS ed eventi programmati di una fermata.

const ROME_FMT = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});

export function romeParts(ms) {
  const o = {};
  for (const part of ROME_FMT.formatToParts(new Date(ms))) o[part.type] = part.value;
  return { y: +o.year, mo: +o.month, d: +o.day, h: +o.hour % 24, mi: +o.minute, s: +o.second };
}

export function pad2(n) {
  return String(n).padStart(2, '0');
}

export function romeDayKey(ms) {
  const p = romeParts(ms);
  return `${p.y}${pad2(p.mo)}${pad2(p.d)}`;
}

function keyParts(key) {
  return [Number(key.slice(0, 4)), Number(key.slice(4, 6)), Number(key.slice(6, 8))];
}

export function shiftDay(key, n) {
  const [y, mo, d] = keyParts(key);
  const t = new Date(Date.UTC(y, mo - 1, d + n));
  return `${t.getUTCFullYear()}${pad2(t.getUTCMonth() + 1)}${pad2(t.getUTCDate())}`;
}

export function romeOffsetMs(ms) {
  const p = romeParts(ms);
  return Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s) - Math.floor(ms / 1000) * 1000;
}

// Regola GTFS: gli orari contano da "mezzogiorno locale meno 12 ore" del giorno di servizio.
export function serviceBaseMs(key) {
  const [y, mo, d] = keyParts(key);
  const noonGuess = Date.UTC(y, mo - 1, d, 12);
  return noonGuess - romeOffsetMs(noonGuess) - 12 * 3600000;
}

export function scheduledEvents(stop, nowMs) {
  const today = romeDayKey(nowMs);
  const out = [];
  for (const off of [-1, 0, 1]) {
    const day = shiftDay(today, off);
    const i = stop.d[day];
    if (i === undefined) continue;
    const base = serviceBaseMs(day);
    for (const [m, line] of stop.p[i]) out.push({ line, day, m, sched: base + m * 60000 });
  }
  return out.sort((a, b) => a.sched - b.sched || a.line - b.line);
}

export function hhmm(ms) {
  const p = romeParts(ms);
  return `${pad2(p.h)}:${pad2(p.mi)}`;
}

export function fmtMin(m) {
  return `${pad2(Math.floor(m / 60) % 24)}:${pad2(m % 60)}`;
}
