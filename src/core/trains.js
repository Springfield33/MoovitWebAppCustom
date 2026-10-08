// Treni Fara Sabina ↔ Tiburtina da Viaggiatreno: fasce, URL, selezione e confronto.
import { romeParts, romeDayKey, serviceBaseMs, pad2, romeOffsetMs, hhmm } from './schedule.js';

export const VT_BASE = 'http://www.viaggiatreno.it/infomobilita/resteasy/viaggiatreno';
export const VT_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
export const ALERT_DELAY_MIN = 10;
export const CHANGE_DELTA_MIN = 5;
const CHECK_LEAD_MIN = 30;
const CLOSE_WINDOW_MIN = 60;
const QUERY_STEP_MS = 60 * 60000;

export const TRAIN_BANDS = [
  { key: 'mattina', label: 'Fara Sabina → Tiburtina', station: 'S08214', from: 390, to: 540, busStop: 'tiburtina',
    destinations: ['FIUMICINO AEROPORTO', 'ROMA TIBURTINA', 'ROMA TERMINI', 'ROMA OSTIENSE'] },
  { key: 'pomeriggio', label: 'Tiburtina → Fara Sabina', station: 'S08217', from: 990, to: 1110, busStop: 'calabria',
    destinations: ['FARA SABINA-MONTELIBRETTI', 'POGGIO MIRTETO', 'ORTE'] },
];

const WD_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function romeMinutes(ms) {
  const p = romeParts(ms);
  return p.h * 60 + p.mi;
}

export function dayStartMs(ms) {
  return serviceBaseMs(romeDayKey(ms));
}

// Formato di Date.toString() richiesto da Viaggiatreno, in ora di Roma.
export function vtDate(ms) {
  const p = romeParts(ms);
  const off = Math.round(romeOffsetMs(ms) / 60000);
  const a = Math.abs(off);
  const dow = new Date(Date.UTC(p.y, p.mo - 1, p.d)).getUTCDay();
  return `${WD_EN[dow]} ${MON_EN[p.mo - 1]} ${pad2(p.d)} ${p.y} ${pad2(p.h)}:${pad2(p.mi)}:${pad2(p.s)} GMT${off < 0 ? '-' : '+'}${pad2(Math.floor(a / 60))}${pad2(a % 60)}`;
}

export function partenzeUrl(station, ms) {
  return `${VT_BASE}/partenze/${station}/${vtDate(ms).replace(/ /g, '%20').replace('+', '%2B')}`;
}

// Istanti da interrogare: il tabellone copre ~1,5 h, quindi un passo di 60 minuti non lascia buchi.
export function queryTimes(band, nowMs) {
  const base = dayStartMs(nowMs);
  const end = base + band.to * 60000;
  const out = [];
  for (let t = Math.max(nowMs, base + band.from * 60000); t < end; t += QUERY_STEP_MS) out.push(t);
  return out;
}

export function bandForBusStop(key) {
  return TRAIN_BANDS.find(b => b.busStop === key) || null;
}

export function bandAt(nowMs) {
  const m = romeMinutes(nowMs);
  for (const band of TRAIN_BANDS) {
    if (m >= band.from - CHECK_LEAD_MIN && m < band.to) return { band, phase: 'check' };
    if (m >= band.to && m < band.to + CLOSE_WINDOW_MIN) return { band, phase: 'close' };
  }
  return null;
}

const BAD_RESPONSE = 'Risposta Viaggiatreno inattesa';

export function selectTrains(partenze, band, nowMs) {
  if (!Array.isArray(partenze)) throw new Error(BAD_RESPONSE);
  const today = romeDayKey(nowMs);
  const seen = new Set();
  const out = [];
  for (const t of partenze) {
    const ms = Number(t && t.orarioPartenza);
    if (!ms || seen.has(t.numeroTreno) || romeDayKey(ms) !== today) continue;
    const m = romeMinutes(ms);
    const dest = String(t.destinazione || '').trim().toUpperCase();
    if (m < band.from || m > band.to || !band.destinations.includes(dest)) continue;
    seen.add(t.numeroTreno);
    out.push({
      numero: t.numeroTreno, categoria: String(t.categoriaDescrizione || '').trim(), destinazione: dest,
      orario: hhmm(ms), partenzaMs: ms, ritardo: Number(t.ritardo) || 0, soppresso: Number(t.provvedimento || 0) !== 0,
    });
  }
  return out.sort((a, b) => a.partenzaMs - b.partenzaMs || a.numero - b.numero);
}

export function isAlert(t) {
  return t.soppresso || t.ritardo >= ALERT_DELAY_MIN;
}

export function trainState(t) {
  return t.soppresso ? 'SOPPRESSO' : t.ritardo > 0 ? `+${t.ritardo}'` : 'in orario';
}

export function trainLabel(t) {
  return `${t.categoria} ${t.numero} (${t.orario})`;
}

export function worstLabel(trains) {
  const bad = trains.filter(isAlert);
  if (!bad.length) return null;
  if (bad.some(t => t.soppresso)) return 'SOPPR';
  return `+${Math.max(...bad.map(t => t.ritardo))}'`;
}

export function trainsEntry(trains) {
  return { list: trains.map(t => ({ ...t, state: trainState(t), late: isAlert(t) })), alert: worstLabel(trains) };
}

export async function fetchBand(band, nowMs, getJson) {
  const pages = await Promise.all(queryTimes(band, nowMs).map(t => getJson(partenzeUrl(band.station, t))));
  if (pages.some(p => !Array.isArray(p))) throw new Error(BAD_RESPONSE);
  return selectTrains(pages.flat(), band, nowMs);
}

// Variazioni da notificare tra due fotografie della fascia. I treni spariti dal tabellone (già partiti) si ignorano.
export function diffSnapshots(prev, curr) {
  const before = new Map(prev.map(t => [t.numero, t]));
  const out = [];
  for (const c of curr) {
    const p = before.get(c.numero);
    const was = !!p && isAlert(p);
    const is = isAlert(c);
    const label = trainLabel(c);
    if (!was && is) out.push(`${label}: ${trainState(c)}`);
    else if (was && !is) out.push(p.soppresso ? `${label}: soppressione revocata, ${trainState(c)}` : `${label} rientrato: ${trainState(c)}`);
    else if (was && is) {
      if (c.soppresso && !p.soppresso) out.push(`${label}: ${trainState(p)} → SOPPRESSO`);
      else if (!c.soppresso && p.soppresso) out.push(`${label}: soppressione revocata, ${trainState(c)}`);
      else if (!c.soppresso && Math.abs(c.ritardo - p.ritardo) >= CHANGE_DELTA_MIN) out.push(`${label}: ${trainState(p)} → ${trainState(c)}`);
    }
  }
  return out;
}
