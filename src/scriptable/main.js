// Punto d'ingresso: widget sulla Home oppure vista completa nell'app.
import { buildModel, autoStop } from '../core/model.js';

async function main() {
  const query = (typeof args !== 'undefined' && args.queryParameters) || {};
  const param = String((config.runsInWidget ? args.widgetParameter : query.stop) || '').trim().toLowerCase();
  try {
    const data = await loadData(Date.now());
    const key = data.stops[param] ? param : autoStop(Date.now());
    const getModel = async keys => {
      const now = Date.now();
      const [feed, trains] = await Promise.all([loadFeed(), loadTrains(keys, now)]);
      return buildModel(data, feed, now, trains);
    };
    if (config.runsInWidget) {
      Script.setWidget(buildWidget(await getModel([key]), key));
    } else {
      const all = Object.keys(data.stops);
      await presentView(await getModel(all), key, () => getModel(all));
    }
  } catch (e) {
    const w = errorWidget(String(e.message || e));
    if (config.runsInWidget) Script.setWidget(w);
    else await w.presentMedium();
  }
  Script.complete();
}
