// Widget medio stile palina: 3 prossimi passaggi della fermata scelta.
import { hhmm } from '../core/schedule.js';
import { delayLabel } from '../core/merge.js';

const W_COLORS = { bg: '#24272C', led: '#FFB627', dim: '#A08040', warn: '#FF8A65', 490: '#5B9BD5', 495: '#E07A5F' };
const STOP_LABEL = { tiburtina: 'TIBURTINA', calabria: 'CALABRIA' };

function wText(stack, str, size, color, bold = true) {
  const t = stack.addText(str);
  t.font = bold ? Font.boldMonospacedSystemFont(size) : Font.regularMonospacedSystemFont(size);
  t.textColor = new Color(color);
  t.lineLimit = 1;
  return t;
}

function buildWidget(model, key) {
  const s = model.stops[key];
  const w = new ListWidget();
  w.backgroundColor = new Color(W_COLORS.bg);
  w.setPadding(10, 14, 10, 14);
  w.url = URLScheme.forRunningScript() + '?stop=' + key;
  w.refreshAfterDate = new Date(model.now + 5 * 60000);

  const head = w.addStack();
  head.centerAlignContent();
  wText(head, STOP_LABEL[key] || key.toUpperCase(), 13, W_COLORS.led);
  head.addSpacer();
  const tr = (model.trains || {})[key];
  if (tr && tr.alert) wText(head, '🚆' + tr.alert + ' ', 11, W_COLORS.warn);
  const ok = model.rtOk && model.dataOk;
  const flags = (model.rtOk ? '' : '⚠RT ') + (model.dataOk ? '' : '⚠ORARI ');
  wText(head, flags + 'agg. ' + hhmm(model.now), 11, ok ? W_COLORS.dim : W_COLORS.warn, false);
  w.addSpacer(6);

  if (!s.next.length) wText(w, 'NESSUN PASSAGGIO', 16, W_COLORS.led);
  for (const e of s.next.slice(0, 3)) {
    const row = w.addStack();
    row.centerAlignContent();
    row.spacing = 8;
    wText(row, String(e.line), 18, W_COLORS[e.line] || W_COLORS.led);
    wText(row, hhmm(e.predicted), 18, W_COLORS.led);
    row.addSpacer();
    if (e.canceled) {
      wText(row, 'SOPPRESSA', 14, W_COLORS.warn);
    } else if (e.predicted - model.now <= 120000) {
      wText(row, 'IN ARRIVO', 14, W_COLORS.led);
    } else {
      const d = row.addDate(new Date(e.predicted));
      d.applyRelativeStyle();
      d.font = Font.boldMonospacedSystemFont(14);
      d.textColor = new Color(W_COLORS.led);
      d.lineLimit = 1;
    }
    wText(row, e.live ? '● ' + delayLabel(e.delaySec) : 'prog.', 11, e.live ? W_COLORS.led : W_COLORS.dim, false);
    w.addSpacer(3);
  }
  w.addSpacer();
  return w;
}

function errorWidget(message) {
  const w = new ListWidget();
  w.backgroundColor = new Color(W_COLORS.bg);
  wText(w, 'BUS 490 · 495', 13, W_COLORS.led);
  w.addSpacer(6);
  const t = w.addText(message);
  t.font = Font.systemFont(12);
  t.textColor = new Color(W_COLORS.warn);
  return w;
}
