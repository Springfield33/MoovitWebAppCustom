// Orari programmati con cache locale (1 giorno) e feed in tempo reale (mai in cache).
import { romeDayKey } from '../core/schedule.js';
import { b64ToBytes } from '../core/b64.js';
import { decodeFeed } from '../core/pbf.js';

async function loadData(nowMs) {
  const fm = FileManager.local();
  const dir = fm.joinPath(fm.documentsDirectory(), CACHE_DIR_NAME);
  if (!fm.fileExists(dir)) fm.createDirectory(dir, true);
  const path = fm.joinPath(dir, 'data.json');
  let cached = null;
  if (fm.fileExists(path)) {
    try { cached = JSON.parse(fm.readString(path)); } catch (e) { cached = null; }
  }
  const today = romeDayKey(nowMs);
  const fresh = cached && nowMs - fm.modificationDate(path).getTime() < 86400000
    && Object.values(cached.stops).every(s => s.d[today] !== undefined);
  if (fresh) return cached;
  try {
    const req = new Request(DATA_URL);
    req.timeoutInterval = 10;
    const data = await req.loadJSON();
    if (data && data.v === 1 && data.stops) {
      fm.writeString(path, JSON.stringify(data));
      return data;
    }
  } catch (e) {
    // rete assente: si usa la copia salvata
  }
  if (cached) return cached;
  throw new Error('Orari non disponibili: nessuna connessione e nessuna copia salvata.');
}

async function loadFeed() {
  try {
    const req = new Request(RT_URL);
    req.timeoutInterval = 10;
    const raw = await req.load();
    return decodeFeed(b64ToBytes(raw.toBase64String()), { routes: FEED_ROUTES });
  } catch (e) {
    return null;
  }
}
