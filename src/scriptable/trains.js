// Treni della fascia abbinata a ogni fermata bus; null se Viaggiatreno non risponde (mai in cache).
import { bandForBusStop, fetchBand, trainsEntry, VT_UA } from '../core/trains.js';

async function loadTrains(keys, nowMs) {
  const out = {};
  await Promise.all(keys.map(async key => {
    const band = bandForBusStop(key);
    if (!band) return;
    try {
      const list = await fetchBand(band, nowMs, url => {
        const req = new Request(url);
        req.timeoutInterval = VT_TIMEOUT_S;
        req.headers = { 'User-Agent': VT_UA, Accept: 'application/json' };
        return req.loadJSON();
      });
      out[key] = trainsEntry(list);
    } catch (e) {
      out[key] = null;
    }
  }));
  return out;
}
