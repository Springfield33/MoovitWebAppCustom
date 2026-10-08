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
