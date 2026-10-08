// Vista completa: WebView con view.html, aggiornata ogni 30 secondi mentre è aperta.

async function presentView(model, tab, getModel) {
  const wv = new WebView();
  await wv.loadHTML(VIEW_HTML);
  await wv.evaluateJavaScript(`init(${JSON.stringify(model)}, ${JSON.stringify(tab)})`);
  const timer = Timer.schedule(30000, true, () => {
    getModel()
      .then(m => wv.evaluateJavaScript(`update(${JSON.stringify(m)})`))
      .catch(() => {});
  });
  await wv.present(true);
  timer.invalidate();
}
