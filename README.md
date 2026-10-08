# bus-roma

Widget e vista Scriptable (iPhone) con i passaggi delle linee ATAC **490** e **495** a
**Staz.ne Tiburtina** (partenze, griglia 7–9) e **Calabria** (verso Tiburtina, griglia 16–18),
in tempo reale quando disponibile e con gli orari programmati come riserva.

Dati: open data di Roma Servizi per la Mobilità (GTFS statico + GTFS-Realtime).

## Come funziona

- Ogni notte GitHub Actions scarica il GTFS statico, genera `data/data.json` e pubblica su GitHub Pages
  `data.json`, `Bus490495.js` (lo script vero) e `Bus.js` (il loader).
- Sull'iPhone lo script "Bus" (loader) scarica `Bus490495.js` una volta al giorno; il widget legge il
  feed in tempo reale direttamente da romamobilita.it.

## Installazione

### GitHub (una volta)
1. Crea il repository pubblico `bus-roma` e fai il push di questo progetto.
2. *Settings → Pages → Build and deployment → Source*: **GitHub Actions**.
3. *Actions → update-data → Run workflow*. Al termine, `https://<utente>.github.io/bus-roma/` mostra i link.

### iPhone (una volta)
1. Installa **Scriptable** dall'App Store.
2. In Safari apri `https://<utente>.github.io/bus-roma/Bus.js`, seleziona tutto e copia.
3. In Scriptable: **+**, incolla, rinomina lo script in **Bus**, esegui (▶) per provarlo.
4. Home: tieni premuto → **+** → Scriptable → formato **medio** → tocca il widget → *Script*: **Bus**.
   *Parameter* (facoltativo): `tiburtina` o `calabria` per fissare la fermata.

Per forzare l'aggiornamento dello script: aprire `scriptable:///run/Bus?update=1`.

## Sviluppo

```bash
npm ci
npm test
node scripts/build-data.mjs --dir <cartella GTFS estratta>
node scripts/preview-view.mjs tiburtina --live   # apre dist/preview.html nel browser
node scripts/bundle.mjs
```
