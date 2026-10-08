# Treni Fara Sabina ↔ Roma Tiburtina — icona nel widget bus e avvisi di ritardo

Data: 2026-10-08 · Stato: design approvato in chat, in revisione scritta

## 1. Obiettivo

Sapere in anticipo se i regionali (FL1) tra **Fara Sabina-Montelibretti** e **Roma Tiburtina** sono in
ritardo o soppressi, senza un frontend dedicato:

| Fascia | Stazione di partenza | Codice | Partenze programmate | Verso | Fermata bus abbinata |
|---|---|---|---|---|---|
| mattina | Fara Sabina-Montelibretti | `S08214` | 06:30–09:00 | Roma (Tiburtina) | Tiburtina |
| pomeriggio | Roma Tiburtina | `S08217` | 16:30–18:30 | Fara Sabina | Calabria |

Un treno è **in allerta** se è soppresso oppure ha `ritardo ≥ 10` minuti.

Due canali:
1. **Widget bus esistente** (repo pubblico `MoovitWebAppCustom`): icona `🚆+15'` (ritardo peggiore) o
   `🚆SOPPR` nell'intestazione quando la fascia abbinata ha almeno un treno in allerta; sezione treni
   nella vista di dettaglio.
2. **Notifiche** (nuovo repo **privato** `treni-fara`): una GitHub Action apre/aggiorna/chiude una issue
   privata per fascia e giorno; GitHub manda mail (e push con GitHub Mobile) al proprietario.

Criteri di successo:
- con treni in orario il widget è identico a oggi e non arriva nessuna notifica;
- un ritardo ≥ 10' o una soppressione nella fascia accende l'icona e produce una issue entro ~10–20 minuti
  (precisione del cron di GitHub);
- ogni variazione significativa (in peggio o in meglio) genera un commento sulla issue;
- lo stato giornaliero dei treni non è pubblico (solo il codice lo è);
- un guasto della sorgente dati non rompe il widget bus e si manifesta come mail "run failed".

Fuori ambito: festivi (le Action girano lun–ven senza calendario festività), altre stazioni o fasce,
canali diversi da GitHub (mail SMTP, Telegram, ntfy), storico dei ritardi.

## 2. Fonte dati: Viaggiatreno

Base: `http://www.viaggiatreno.it/infomobilita/resteasy/viaggiatreno` — **verificato l'8/10/2026**:

- Serve **HTTP**: `https://` fa 301 verso `http://`.
- Senza User-Agent da browser Akamai risponde **403**; con UA Safari iOS risponde 200 JSON.
- `GET /partenze/{codStazione}/{data}` con `data` nel formato di `Date.toString()` JS, URL-encoded, es.
  `Thu%20Oct%2008%202026%2016:30:00%20GMT%2B0200`. Restituisce le partenze da quell'ora per ~1,5 h.
  Un orario già passato da tempo restituisce `[]` (è un tabellone, non uno storico).
- Campi usati per ogni treno: `numeroTreno`, `categoriaDescrizione` (es. `REG`), `destinazione`,
  `orarioPartenza` (epoch ms, programmato), `compOrarioPartenza` (`HH:MM`), `ritardo` (minuti, anche
  negativo), `provvedimento` (0 = regolare; ≠ 0 trattato come **soppresso** finché non si chiarisce il
  significato dei singoli valori), `nonPartito`.
- Direzione osservata:
  - da Fara (`S08214`) verso Roma: destinazione `FIUMICINO AEROPORTO`; verso nord: `ORTE`, `POGGIO MIRTETO`.
  - da Tiburtina (`S08217`) verso Fara: destinazioni `FARA SABINA-MONTELIBRETTI`, `POGGIO MIRTETO`, `ORTE`.
  Il filtro è una **lista di destinazioni ammesse** per fascia, in configurazione.

Limite noto: molti treni del mattino **partono da Fara** (`codOrigine = S08214`); per loro il ritardo
compare di solito solo a partenza avvenuta, quindi l'anticipo vale soprattutto per soppressioni e treni
provenienti da Poggio Mirteto/Orte.

## 3. Architettura

```
Repo pubblico MoovitWebAppCustom
  src/core/trains.js  ← logica pura (URL, filtro, allerta, diff)
        │ bundle in Bus490495.js                 │ checkout (senza token)
        ▼                                        ▼
iPhone – Scriptable                       Repo privato treni-fara
  fetch Viaggiatreno (HTTP, UA browser)     .github/workflows/check.yml (cron lun–ven)
  → icona widget + sezione vista            notify.mjs → issue private → mail / push
```

### 3.1 `src/core/trains.js` (repo pubblico, puro, testato in Node)

- `TRAIN_BANDS`: configurazione delle due fasce
  `{ key: 'mattina'|'pomeriggio', station, from: '06:30', to: '09:00', destinations: [...], busStop: 'tiburtina'|'calabria', label }`.
- `ALERT_DELAY_MIN = 10`, `CHANGE_DELTA_MIN = 5`.
- `partenzeUrl(station, date)`: URL completo con data in formato `Date.toString()` (ora di Roma).
- `queryTimes(band, now)`: istanti da interrogare per coprire le partenze della fascia ancora future
  (da `max(now, inizio fascia)` a passi di 60 min fino alla fine fascia; 1–3 chiamate).
- `selectTrains(partenze[], band)`: dedup per `numeroTreno`, filtro per orario programmato in fascia
  (ora di Roma) e destinazione ammessa; normalizza in
  `{ numero, categoria, destinazione, orario: 'HH:MM', partenzaMs, ritardo, soppresso }`, ordinati per orario.
- `isAlert(train)`: `soppresso || ritardo >= ALERT_DELAY_MIN`.
- `worstLabel(trains)`: `null` se nessuno in allerta; `'SOPPR'` se c'è una soppressione; altrimenti
  `"+N'"` col ritardo massimo.
- `bandForBusStop(key)` / `bandAt(now)`: fascia abbinata alla fermata bus / fascia di controllo attiva.
- `diffSnapshots(prev, curr)`: confronta due liste normalizzate e restituisce le variazioni significative:
  - treno che entra o esce dall'allerta (es. `R 20455 rientrato: +4'`);
  - soppressione nuova o revocata;
  - ritardo di un treno già in allerta che cambia di `≥ CHANGE_DELTA_MIN` in su o in giù.
  Lista vuota = nessun commento.

### 3.2 Widget e vista (repo pubblico)

- `src/scriptable/trains.js`: `fetchTrains(band)` esegue le chiamate di `queryTimes` con `Request`,
  header `User-Agent` Safari iOS, timeout ~5 s, e restituisce `selectTrains(...)` oppure `null` su
  qualunque errore. Nessuna cache.
- `main.js`: avvia `fetchTrains(bandForBusStop(key))` **in parallelo** a `loadFeed()`; il risultato entra
  nel modello come `model.trains = { band, list } | null`. Se la fascia abbinata è già finita (`queryTimes` vuoto) non parte nessuna chiamata e la lista è vuota.
- `widget.js`: nell'intestazione, prima di `agg. HH:MM`, testo `🚆+15'` / `🚆SOPPR` in colore `warn`
  se `worstLabel` non è `null`. Nessun indicatore se i treni non sono disponibili.
- `view.html`: sotto la griglia bus, sezione "Treni {label}" con tutti i treni della fascia ancora da
  partire: `HH:MM  REG 20455  in orario | +3' | +15' (warn) | SOPPRESSO (warn)`. Se `model.trains`
  è `null`: riga "treni non disponibili". Si aggiorna col refresh a 30 s già esistente.
- `config.js`: `VT_BASE`, `VT_UA`.

### 3.3 Repo privato `treni-fara`

- `.github/workflows/check.yml`
  - `schedule`: `*/10 4-8 * * 1-5` e `*/10 14-17 * * 1-5` (UTC; copre ora solare e legale, incluso il run di chiusura) + `workflow_dispatch`.
  - `permissions: { contents: read, issues: write }`; nessun segreto, si usa `GITHUB_TOKEN`.
  - Passi: checkout del repo privato, checkout di `Springfield33/MoovitWebAppCustom` in `bus/`,
    setup Node 24, `node notify.mjs`.
- `notify.mjs` (importa `./bus/src/core/trains.js`):
  1. Determina l'ora di Roma. Intervalli di controllo: **mattina 06:00–09:00**, **pomeriggio
     16:00–18:30** (30' prima della fascia). Fuori da questi e non nel "run di chiusura" → esce con 0.
  2. Scarica le partenze (`fetch`, UA browser). Risposta non-200 o non JSON → **exit 1** (mail
     "run failed" = sistema cieco, non "ritardo").
  3. Cerca la issue aperta con titolo che inizia per `🚆 AAAA-MM-GG mattina|pomeriggio`.
     Lo snapshot precedente è salvato nel corpo della issue (o nell'ultimo commento) in un blocco
     `<!-- snapshot:{json} -->`.
  4. Decisione:
     - nessuna issue e almeno un treno in allerta → **apre** la issue: titolo con la data, la fascia e
       il riepilogo (es. `🚆 2026-10-08 mattina — R 20455 +15', R 20459 SOPPRESSO`), corpo con tabella
       di tutti i treni della fascia + snapshot;
     - issue aperta e `diffSnapshots` non vuoto → **commento** con le variazioni, tabella aggiornata e
       nuovo snapshot;
     - issue aperta, primo run dopo la fine della fascia (mattina ≥ 09:00, pomeriggio ≥ 18:30, entro
       l'ora successiva) → commento di riepilogo e **chiusura**;
     - altrimenti nessuna azione.
- `.github/workflows/keepalive.yml`: mensile, aggiorna e committa un file `keepalive` per evitare la
  disattivazione dei workflow schedulati dopo 60 giorni di inattività.
- Consumo stimato: ~54 run/giorno lun–ven, ~1200 minuti/mese su 2000 gratuiti per repo privati.

## 4. Gestione errori

| Situazione | Widget / vista | Notifiche |
|---|---|---|
| Viaggiatreno giù o 403 | nessuna icona; vista: "treni non disponibili" | run fallito → mail "run failed" |
| Risposta vuota (fascia senza treni futuri) | nessuna icona | nessuna azione (o chiusura se a fine fascia) |
| Cron GitHub in ritardo o saltato | — | avviso al run successivo |
| Errore nei treni | non deve mai impedire il rendering dei bus | — |

## 5. Test e verifiche

Verifiche **prima** dell'implementazione (determinano la fattibilità):
1. Viaggiatreno raggiungibile dagli IP di GitHub Actions (workflow usa e getta nel repo privato). Se
   bloccato, le notifiche vanno ripensate; il widget non ne è toccato.
2. Viaggiatreno in HTTP da Scriptable sull'iPhone (snippet manuale). Se rifiutato, cercare alternativa.
3. Notifica mail all'owner per issue aperte da `github-actions[bot]` in un repo privato.

Test automatici (`node --test`):
- `trains.js`: URL e formato data (ora solare e legale); `queryTimes`; `selectTrains` con **fixture reali**
  di partenze Fara e Tiburtina (da riscaricare durante l'implementazione, idealmente includendo un
  treno in ritardo); `isAlert` sulla soglia; `worstLabel`; `diffSnapshots` per tutti i casi della 3.1.
- `notify.mjs`: client GitHub finto (apre / commenta / non fa nulla / chiude), estrazione snapshot dal
  corpo, finestre orarie con ora di Roma.
- Widget e vista: anteprima con `scripts/preview-view.mjs` e prova sull'iPhone.
- Il bundle (`test/bundle.test.mjs`) include il nuovo modulo.
