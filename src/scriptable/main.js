// Punto d'ingresso: widget sulla Home oppure vista completa nell'app.
import { buildModel } from '../core/model.js';

async function main() {
  const query = (typeof args !== 'undefined' && args.queryParameters) || {};
  const param = String((config.runsInWidget ? args.widgetParameter : query.stop) || '').trim().toLowerCase();
  try {
    const data = await loadData(Date.now());
    const getModel = async () => buildModel(data, await loadFeed(), Date.now());
    const model = await getModel();
    const key = model.stops[param] ? param : model.auto;
    if (config.runsInWidget) Script.setWidget(buildWidget(model, key));
    else await presentView(model, key, getModel);
  } catch (e) {
    const w = errorWidget(String(e.message || e));
    if (config.runsInWidget) Script.setWidget(w);
    else await w.presentMedium();
  }
  Script.complete();
}
