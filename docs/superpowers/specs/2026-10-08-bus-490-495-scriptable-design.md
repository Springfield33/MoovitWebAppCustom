# Bus 490/495 — Tiburtina e Calabria su iPhone (Scriptable + GitHub)

Data: 2026-10-08 · Stato: design approvato in chat, in revisione scritta

## 1. Obiettivo

Consultare dall'iPhone i passaggi delle linee ATAC **490** e **495** in due fermate:

| Fermata | stop_id | Direzione GTFS | Verso | Fascia griglia |
|---|---|---|---|---|
| Staz.ne Tiburtina (capolinea, partenze) | `82007` (da confermare sul GTFS statico) | 0 | Cornelia / Valle Aurelia | 07:00–09:00 |
| Calabria | `71406` | 1 | Staz.ne Tiburtina | 16:00–18:00 |

Per ciascuna fermata: **prossimi passaggi in tempo reale** (con ritardo) e **griglia oraria** della fascia.
Uso tipico: mattina parte da Tiburtina, pomeriggio torna da Calabria.

Criteri di successo:
- widget sulla Home che mostra i prossimi 3 passaggi della fermata pertinente all'ora;
- vista completa (tap sul widget) con 5 prossimi passaggi, griglia e schede Tiburtina | Calabria;
- orari programmati aggiornati automaticamente ogni notte, senza interventi manuali;
- è sempre chiaro se un passaggio è **live** o **programmato**, e se i dati sono vecchi.

Fuori ambito: altre linee/fermate, notifiche push, pagina web pubblica, Android.

## 2. Fonti dati (open data Roma Servizi per la Mobilità)

- GTFS statico: `https://romamobilita.it/sites/default/files/rome_static_gtfs.zip` (~46 MB, aggiornato spesso).
- GTFS-RT trip updates: `https://romamobilita.it/sites/default/files/rome_rtgtfs_trip_updates_feed.pb` — **verificato l'8/10/2026**: risponde 200, nessun header CORS, contiene `routeId` `490`/`495`, `stopId` `71406` (direzione 1) e `82007` (seq. 1, direzione 0), con `time` assoluto e `delay` in secondi (anche negativo).

Fatti dal GTFS statico (handoff): `route_id` = nome linea; servizio definito in `calendar_dates.txt` con `exception_type=1`; orari possono superare `24:00`.

## 3. Architettura

```
GitHub (repo pubblico "bus-roma")
  ├─ scripts/build-data.mjs        ← genera data.json
  ├─ .github/workflows/update-data.yml  (cron notturno ~04:00 Europe/Rome + manuale)
  └─ GitHub Pages: data.json, Bus490495.js
          │  (1 volta al giorno, con cache)
iPhone – Scriptable
  ├─ "Bus" (loader, ~10 righe, installato a mano una volta)
  └─ Bus490495.js (scaricato dal loader): widget + vista WebView
          │  (ad ogni refresh)
  romamobilita.it feed trip updates (.pb)
```

Nessun server proprio. Il telefono legge direttamente il feed RT (Scriptable non ha vincoli CORS).

## 4. Componenti

### 4.1 `scripts/build-data.mjs` (Node, gira su GitHub Actions)

1. Scarica lo zip, lo estrae con `unzip`.
2. `trips.txt`: tiene le corse con `route_id` ∈ {490, 495} → `service_id`, `direction_id`.
3. `stop_times.txt` letto **riga per riga** (stream): tiene i passaggi di quelle corse alle fermate configurate, filtrando per direzione:
   - Calabria: `stop_id` 71406, direzione 1;
   - Tiburtina: `stop_id` ricavato dal GTFS (prima fermata delle corse in direzione 0, atteso `82007`); esclude corse per cui la fermata è l'ultima (solo arrivo).
4. `calendar_dates.txt` (`exception_type=1`): mappa data → schema orario (stessa logica dell'handoff: deduplica schemi identici).
5. Validazione: ogni fermata deve avere passaggi e la data odierna (Europe/Rome) deve essere presente. Altrimenti exit ≠ 0 → nessuna pubblicazione (resta l'ultimo `data.json` valido; GitHub manda email di errore).

Configurazione fermate (id, direzione, fascia griglia) in un oggetto in testa allo script.

### 4.2 Formato `data.json` (~15–20 KB)

```json
{
  "v": 1,
  "generated": "2026-10-08T02:00:00Z",
  "range": ["20261005", "20261111"],
  "stops": {
    "tiburtina": { "ids": ["82007"], "name": "STAZ.NE TIBURTINA (MB)", "dir": 0, "grid": [420, 540],
                   "d": { "20261008": 0 }, "p": [[[405, 490], [412, 495]]] },
    "calabria":  { "ids": ["71406"], "name": "CALABRIA", "dir": 1, "grid": [960, 1080],
                   "d": { "20261008": 0 }, "p": [[[963, 490]]] }
  }
}
```

- `ids`: stop_id della fermata (array: a Tiburtina potrebbero esserci più pali di partenza); `dir`: direction_id usata per filtrare il tempo reale.
- `d`: data `YYYYMMDD` → indice in `p`.
- `p`: schemi; ogni schema è lista ordinata `[minuti_dalla_mezzanotte_del_giorno_di_servizio, linea]` (può superare 1440).
- `grid`: fascia [inizio, fine) in minuti.

### 4.3 Workflow `update-data.yml`

- Trigger: `schedule` notturno + `workflow_dispatch`.
- Passi: checkout → Node LTS → test → `build-data` → `bundle` → commit di `data.json`/`dist` **solo se cambiati** → deploy GitHub Pages.
- Il commit periodico mantiene il repo "attivo" (GitHub disabilita i cron dopo 60 giorni di inattività); in ogni caso l'app segnala dati vecchi (§4.6).
- Rischio da verificare per primo: raggiungibilità di `romamobilita.it` dai runner GitHub.

### 4.4 Decoder GTFS-RT (`src/core/pbf.js`)

Decoder protobuf minimale (nessuna dipendenza), legge solo le corse delle linee richieste (le altre vengono saltate senza decodificarle, per stare nei limiti di memoria del widget). Il feed scaricato in Scriptable passa da base64 (`Data.toBase64String`) a `Uint8Array` per non creare array JS da ~1 M elementi. Campi letti:
- `FeedMessage.header.timestamp`, `FeedMessage.entity[]`;
- `TripUpdate.trip`: `trip_id`, `route_id`, `direction_id`, `schedule_relationship` (CANCELED);
- `TripUpdate.stop_time_update[]`: `stop_sequence`, `stop_id`, `arrival`/`departure` (`delay`, `time`), `schedule_relationship` (SKIPPED).

Gestisce varint a 64 bit (time) e int32 negativi (delay). Campi sconosciuti saltati per wire type.

### 4.5 Logica passaggi (`src/core/schedule.js`, `src/core/merge.js`)

- **Programmati**: unione dei giorni di servizio ieri/oggi/domani (orari > 1440 riportati al giorno civile corretto); prossimi N dall'istante attuale; griglia della fascia del giorno corrente.
- **RT**: entità con linea 490/495, `stop_id` della fermata, direzione corretta. Orario previsto = `departure.time` se presente, altrimenti `arrival.time`.
- **Unione**: orario programmato RT = previsto − delay; abbinato al passaggio programmato con stessa linea e scarto ≤ ±2 min → diventa *live* (previsto + ritardo). RT senza abbinamento → aggiunti come *live*. Corse CANCELED o fermata SKIPPED → mostrate barrate "soppressa". Ordinamento per orario previsto; primi N.
- **Feed non valido**: errore di rete/decodifica o `header.timestamp` più vecchio di 5 minuti → solo programmati + avviso.

### 4.6 Script Scriptable (`src/scriptable/` → bundle `dist/Bus490495.js`)

- **Cache**: `data.json` nella cartella documenti locale di Scriptable (`FileManager.local()`, più affidabile di iCloud per i widget); riscaricato se più vecchio di 24 h o se manca la data odierna; usato offline se il download fallisce. Feed RT mai in cache.
- **Selezione fermata**: prima delle 12:00 Tiburtina, dopo Calabria; il *Parameter* del widget (`tiburtina`/`calabria`) la forza.
- **Widget (medio)**: fondo scuro, testo ambra monospace di sistema; nome fermata, "agg. HH:MM", prossimi **3** passaggi con linea colorata (490 blu, 495 rosso mattone), orario, countdown relativo (aggiornato da iOS), `●` live / `prog.`; tap → vista completa. Refresh deciso da iOS (indicativamente 5–15 min).
- **Vista completa (WebView)**: riuso del design dell'artifact (LED ambra, font Doto): schede Tiburtina | Calabria con selezione automatica, prossimi **5** con countdown, "IN ARRIVO" entro 2 min, live/programmato e ritardo (`+6'`, `−2'`), griglia della fascia (passate in grigio, prossima evidenziata, ritardo accanto alle live), tema chiaro/scuro. Aggiornamento ogni 30 s mentre è aperta: lo script ricalcola i dati e li passa alla pagina con `evaluateJavaScript`.
- **Avvisi** (widget e vista): "⚠ tempo reale non disponibile"; "⚠ orari non aggiornati" se la data odierna manca o `generated` > 3 giorni.

### 4.7 Loader "Bus" (installato a mano una volta)

~10 righe: scarica `Bus490495.js` da GitHub Pages al più una volta al giorno, lo salva in cache e lo esegue; se GitHub non risponde usa la copia in cache. Gli aggiornamenti dello script arrivano con un push, senza toccare l'iPhone.

## 5. Struttura repository

```
bus-roma/
├─ src/core/{pbf.js, schedule.js, merge.js}
├─ src/scriptable/        (widget, WebView, cache, main)
├─ src/view.html
├─ scripts/{build-data.mjs, bundle.mjs}
├─ loader/Bus.js
├─ test/                  (node:test + fixture)
├─ dist/                  (Bus490495.js, data.json — pubblicati su Pages)
└─ .github/workflows/update-data.yml
```

## 6. Test

In Node (`node:test`), locali e in CI:
- **pbf**: fixture `.pb` reale del feed; confronto campo per campo con `gtfs-realtime-bindings` (devDependency).
- **build-data**: mini-GTFS di prova (corse oltre mezzanotte, direzione errata, capolinea solo arrivo, date mancanti); validazione che fallisce correttamente.
- **merge/schedule**: abbinamento ±2 min, soppresse, feed vecchio, cavallo di mezzanotte, ieri/oggi/domani.
- **Riferimento**: Calabria 06/10/2026 fascia 16–18 = `16:03(490) 16:13(490) 16:15(495) 16:23(490) 16:33(490) 16:33(495) 16:43(490) 16:52(495) 16:54(490) 17:04(490) 17:05(495) 17:14(490) 17:18(495) 17:24(490) 17:24(495) 17:31(495) 17:34(490) 17:43(495) 17:44(490) 17:54(490) 17:56(495)` (se il feed corrente copre ancora quella data).

Su iPhone (manuale, checklist): widget in entrambe le fasce orarie e con Parameter, vista completa e schede, modalità aereo (fallback programmato), tema scuro.

## 7. Installazione per l'utente

1. Crea il repo GitHub pubblico `bus-roma`, push, abilita GitHub Pages (sorgente: GitHub Actions), lancia il workflow a mano la prima volta.
2. Installa Scriptable dall'App Store; crea lo script "Bus" incollando il loader.
3. Aggiungi alla Home un widget Scriptable medio, script "Bus" (Parameter opzionale).
