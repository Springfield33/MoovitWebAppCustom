# Treni Fara Sabina ↔ Tiburtina — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Icona `🚆+N'`/`🚆SOPPR` nel widget bus e sezione treni nella vista quando i regionali Fara Sabina ↔ Tiburtina della fascia sono in ritardo ≥ 10' o soppressi, più issue private (mail/push GitHub) da un repo privato `treni-fara`.

**Architecture:** La logica pura sta in `src/core/trains.js` nel repo pubblico `MoovitWebAppCustom` ed è inclusa nel bundle Scriptable, che interroga Viaggiatreno direttamente dall'iPhone. Il repo privato `Springfield33/treni-fara` fa il checkout del repo pubblico in `bus/`, importa lo stesso modulo e, con un cron GitHub Actions, apre/commenta/chiude una issue per fascia e giorno.

**Tech Stack:** Node 24 (ESM, `node --test`, `fetch` nativo), Scriptable (iOS), GitHub Actions, API REST GitHub, API Viaggiatreno (HTTP, JSON). Nessuna nuova dipendenza npm.

**Spec:** `docs/superpowers/specs/2026-10-08-treni-fara-tiburtina-design.md`

## Global Constraints

- Node 24; **nessuna nuova dipendenza** in nessuno dei due repo.
- Allerta: `soppresso || ritardo >= 10` (`ALERT_DELAY_MIN = 10`). Variazione significativa: `≥ 5` minuti (`CHANGE_DELTA_MIN = 5`).
- Fascia **mattina**: da `S08214` (Fara Sabina-Montelibretti), partenze 06:30–09:00, destinazioni `FIUMICINO AEROPORTO`, `ROMA TIBURTINA`, `ROMA TERMINI`, `ROMA OSTIENSE`; fermata bus abbinata `tiburtina`.
- Fascia **pomeriggio**: da `S08217` (Roma Tiburtina), partenze 16:30–18:30, destinazioni `FARA SABINA-MONTELIBRETTI`, `POGGIO MIRTETO`, `ORTE`; fermata bus abbinata `calabria`.
- Controllo notifiche: da 30' prima dell'inizio fascia alla fine fascia; chiusura issue nei 60' dopo la fine fascia.
- Viaggiatreno: base `http://www.viaggiatreno.it/infomobilita/resteasy/viaggiatreno` (HTTP), header `User-Agent` Safari iOS obbligatorio (senza: 403 Akamai).
- Bundler (`scripts/bundle.mjs`): elimina le righe che iniziano con `import` e toglie `export ` a inizio riga, e rifiuta nomi top-level duplicati tra i file. Quindi **import su una sola riga** e **nomi top-level unici** in tutto `src/`.
- Testi visibili all'utente in italiano. Messaggi di commit in stile `feat:`/`test:`/`docs:`/`ci:` in italiano, chiusi da `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Repo privato: `Springfield33/treni-fara`, cartella locale `C:\Users\aboccassini\Documents\VSCode\treni-fara`; nessun segreto (solo `GITHUB_TOKEN`).
- Prima di lavorare sul repo bus: `git pull` (il workflow notturno committa `data/data.json` su `main`).

## Review Focus

- **Treni già partiti che spariscono dal tabellone**: non devono generare un commento "rientrato". `diffSnapshots` ignora i treni presenti in `prev` e assenti in `curr` (test in Task 4).
- **Viaggiatreno risponde HTML/403 o JSON non-array**: il widget non mostra l'icona e la vista mostra "Treni non disponibili"; `notify.mjs` termina con errore (exit ≠ 0). `fetchBand` e `selectTrains` lanciano un errore su input non-array (test in Task 3; il catch di `loadTrains` in Task 5).
- **Chiamate sovrapposte** (fino a 3 per fascia, ogni tabellone copre ~1,5 h): lo stesso treno arriva più volte e va contato una sola volta (test di dedup in Task 3 e in `run` Task 9).
- **Ora solare/legale**: `bandAt`, `queryTimes` e `vtDate` devono usare l'ora di Roma sia in ottobre (+02:00) sia a dicembre (+01:00) (test in Task 2).
- **Ritardo negativo o `provvedimento` assente**: un treno in anticipo è "in orario" e non in allerta; `provvedimento` mancante non vuol dire soppresso (test in Task 3).

---

## File Structure

Repo pubblico `MoovitWebAppCustom`:

| File | Azione | Responsabilità |
|---|---|---|
| `src/core/schedule.js` | modifica | esportare `pad2` e `romeOffsetMs` (oggi interni) |
| `src/core/trains.js` | crea | configurazione fasce, URL Viaggiatreno, finestre orarie, selezione/normalizzazione treni, allerta, diff |
| `src/core/model.js` | modifica | `autoStop(nowMs)`, parametro `trains` in `buildModel` |
| `src/scriptable/config.js` | modifica | `VT_TIMEOUT_S` |
| `src/scriptable/trains.js` | crea | `loadTrains(keys, nowMs)` con `Request` di Scriptable |
| `src/scriptable/main.js` | modifica | fetch treni in parallelo al feed bus |
| `src/scriptable/widget.js` | modifica | icona nell'intestazione |
| `src/view.html` | modifica | sezione treni |
| `scripts/bundle.mjs` | modifica | `ORDER` + export `selectTrains`, `worstLabel` |
| `scripts/preview-view.mjs` | modifica | treni demo (fixture) o live |
| `test/trains.test.mjs` | crea | test del modulo treni |
| `test/fixtures/vt-tiburtina.json`, `test/fixtures/vt-fara.json` | crea | tabelloni reali dell'8/10/2026 ridotti |
| `test/model.test.mjs`, `test/bundle.test.mjs` | modifica | nuovi casi |
| `README.md` | modifica | sezione treni |

Repo privato `treni-fara`:

| File | Responsabilità |
|---|---|
| `package.json`, `.gitignore`, `README.md` | progetto ESM senza dipendenze; `bus/` ignorato |
| `lib/format.mjs` | titolo/corpi issue, tabella markdown, snapshot nascosto |
| `lib/github.mjs` | client REST minimale (trova/crea/commenta/chiude issue, ultimo snapshot) |
| `lib/run.mjs` | decisione di un run: fuori fascia / apri / commenta / chiudi / niente |
| `notify.mjs` | entry point: `fetch` Viaggiatreno + client GitHub + `run` |
| `test/*.test.mjs` | test con client e fetch finti |
| `.github/workflows/check.yml` | cron lun–ven + `workflow_dispatch` con ora simulata |
| `.github/workflows/probe.yml` | solo Task 1, poi rimosso |

In locale `bus/` dentro `treni-fara` è una junction verso `..\MoovitWebAppCustom`, così i test usano il codice non ancora pubblicato; in CI è un checkout.

---

### Task 1: Verifiche di fattibilità (bloccante)

Nessun codice di prodotto. Se una verifica fallisce, **fermarsi e riportare** all'utente: il design va rivisto.

**Files:**
- Create (repo privato): `.github/workflows/probe.yml`

**Interfaces:**
- Consumes: niente.
- Produces: repo `Springfield33/treni-fara` esistente e clonato in `C:\Users\aboccassini\Documents\VSCode\treni-fara`; esito delle tre verifiche.

- [ ] **Step 1: Far creare il repo privato all'utente**

`gh` non è installato. Chiedere all'utente di creare su github.com il repo **privato** `Springfield33/treni-fara`, vuoto, senza README. Poi:

```bash
cd /c/Users/aboccassini/Documents/VSCode && mkdir treni-fara && cd treni-fara && git init -b main && git remote add origin https://github.com/Springfield33/treni-fara.git
```

- [ ] **Step 2: Scrivere il workflow di prova**

`.github/workflows/probe.yml`:

```yaml
name: probe
on: workflow_dispatch
permissions:
  issues: write
jobs:
  probe:
    runs-on: ubuntu-latest
    steps:
      - name: Viaggiatreno dagli IP di Actions
        run: |
          UA='Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
          B=http://www.viaggiatreno.it/infomobilita/resteasy/viaggiatreno
          curl -s -o auto.txt -w 'autocompleta: HTTP %{http_code}\n' -A "$UA" "$B/autocompletaStazione/FARA"
          cat auto.txt
          D=$(TZ=Europe/Rome LC_ALL=C date '+%a %b %d %Y %H:%M:%S GMT%z' | sed 's/ /%20/g;s/+/%2B/g')
          curl -s -o part.json -w 'partenze: HTTP %{http_code}\n' -A "$UA" "$B/partenze/S08217/$D"
          head -c 400 part.json; echo
          grep -q '"numeroTreno"' part.json
      - name: Issue di prova
        run: gh issue create --repo "$GITHUB_REPOSITORY" --title "Prova notifica treni" --body "Se ricevi una mail per questa issue, le notifiche funzionano."
        env:
          GH_TOKEN: ${{ github.token }}
```

- [ ] **Step 3: Commit e push**

```bash
git add .github/workflows/probe.yml
git commit -m "ci: workflow di prova Viaggiatreno e notifiche

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push -u origin main
```

- [ ] **Step 4: Far lanciare il workflow e verificare**

Chiedere all'utente: *Actions → probe → Run workflow*. Atteso:
- step 1 verde, con `autocompleta: HTTP 200` e la riga `FARA SABINA-MONTELIBRETTI|S08214`; `partenze: HTTP 200` e un JSON con `"numeroTreno"`;
- issue "Prova notifica treni" creata, e **mail ricevuta** dall'utente. Se la mail non arriva: su github.com, repo → *Watch* → *All Activity*, poi rilanciare. Se ancora niente, fermarsi.

Se lo step 1 dà 403, fermarsi: Akamai blocca gli IP di GitHub e le notifiche vanno ripensate.

- [ ] **Step 5: Verifica Scriptable in HTTP sull'iPhone**

Dare all'utente questo script da incollare in un nuovo script Scriptable ed eseguire:

```js
const req = new Request('http://www.viaggiatreno.it/infomobilita/resteasy/viaggiatreno/autocompletaStazione/FARA');
req.headers = { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' };
try {
  const s = await req.loadString();
  console.log(req.response.statusCode + '\n' + s);
} catch (e) {
  console.error(String(e));
}
```

Atteso nel log: `200` e `FARA SABINA-MONTELIBRETTI|S08214`. Se fallisce per ATS/HTTP, fermarsi e riportare.

- [ ] **Step 6: Chiudere la issue di prova**

Chiedere all'utente di chiuderla, oppure lasciarla: verrà ignorata perché il titolo non inizia con `🚆`. `probe.yml` si rimuove nel Task 10.

---

### Task 2: `trains.js` — configurazione, URL e finestre orarie

**Files:**
- Modify: `src/core/schedule.js` (aggiungere `export` a `pad2` e `romeOffsetMs`)
- Create: `src/core/trains.js`
- Test: `test/trains.test.mjs`

**Interfaces:**
- Consumes: `romeParts(ms)`, `romeDayKey(ms)`, `serviceBaseMs(key)`, `pad2(n)`, `romeOffsetMs(ms)` da `src/core/schedule.js`.
- Produces:
  - `VT_BASE: string`, `VT_UA: string`, `ALERT_DELAY_MIN = 10`, `CHANGE_DELTA_MIN = 5`
  - `TRAIN_BANDS: Array<{ key: 'mattina'|'pomeriggio', label: string, station: string, from: number, to: number, busStop: string, destinations: string[] }>` (`from`/`to` = minuti dalla mezzanotte, ora di Roma)
  - `romeMinutes(ms) → number`, `dayStartMs(ms) → number` (mezzanotte di Roma del giorno di `ms`)
  - `vtDate(ms) → string` (es. `'Thu Oct 08 2026 16:30:00 GMT+0200'`)
  - `partenzeUrl(station, ms) → string`
  - `queryTimes(band, nowMs) → number[]`
  - `bandForBusStop(key) → band | null`
  - `bandAt(nowMs) → { band, phase: 'check'|'close' } | null`

- [ ] **Step 1: Scrivere i test che falliscono**

`test/trains.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  VT_BASE, TRAIN_BANDS, vtDate, partenzeUrl, queryTimes, bandForBusStop, bandAt,
} from '../src/core/trains.js';

const [MATTINA, POMERIGGIO] = TRAIN_BANDS;
// Ore di Roma dell'8/10/2026 (ora legale, +02:00); per dicembre (+01:00) i test usano istanti UTC espliciti.
const rome = (h, m) => Date.UTC(2026, 9, 8, h - 2, m);

test('fasce configurate come da spec', () => {
  assert.deepEqual([MATTINA.key, MATTINA.station, MATTINA.from, MATTINA.to, MATTINA.busStop], ['mattina', 'S08214', 390, 540, 'tiburtina']);
  assert.deepEqual([POMERIGGIO.key, POMERIGGIO.station, POMERIGGIO.from, POMERIGGIO.to, POMERIGGIO.busStop], ['pomeriggio', 'S08217', 990, 1110, 'calabria']);
  assert.ok(MATTINA.destinations.includes('FIUMICINO AEROPORTO'));
  assert.ok(POMERIGGIO.destinations.includes('FARA SABINA-MONTELIBRETTI'));
});

test('vtDate: formato Date.toString() in ora di Roma, legale e solare', () => {
  assert.equal(vtDate(Date.UTC(2026, 9, 8, 14, 30)), 'Thu Oct 08 2026 16:30:00 GMT+0200');
  assert.equal(vtDate(Date.UTC(2026, 11, 7, 5, 30)), 'Mon Dec 07 2026 06:30:00 GMT+0100');
});

test('partenzeUrl: spazi e + codificati come nelle chiamate verificate', () => {
  assert.equal(
    partenzeUrl('S08217', Date.UTC(2026, 9, 8, 14, 30)),
    VT_BASE + '/partenze/S08217/Thu%20Oct%2008%202026%2016:30:00%20GMT%2B0200',
  );
  assert.ok(VT_BASE.startsWith('http://www.viaggiatreno.it/'));
});

test('queryTimes: copre le partenze future della fascia a passi di 60 minuti', () => {
  assert.deepEqual(queryTimes(POMERIGGIO, rome(16, 0)), [rome(16, 30), rome(17, 30)]);
  assert.deepEqual(queryTimes(POMERIGGIO, rome(17, 45)), [rome(17, 45)]);
  assert.deepEqual(queryTimes(POMERIGGIO, rome(18, 31)), []);
  assert.deepEqual(queryTimes(MATTINA, rome(5, 0)), [rome(6, 30), rome(7, 30), rome(8, 30)]);
  assert.deepEqual(queryTimes(MATTINA, Date.UTC(2026, 11, 7, 6, 0)), [Date.UTC(2026, 11, 7, 6, 0), Date.UTC(2026, 11, 7, 7, 0)]);
});

test('bandForBusStop: fermata bus → fascia treni', () => {
  assert.equal(bandForBusStop('tiburtina'), MATTINA);
  assert.equal(bandForBusStop('calabria'), POMERIGGIO);
  assert.equal(bandForBusStop('altro'), null);
});

test('bandAt: controllo da 30\' prima, chiusura per 60\' dopo la fascia', () => {
  const at = ms => { const r = bandAt(ms); return r && `${r.band.key}:${r.phase}`; };
  assert.equal(at(rome(5, 59)), null);
  assert.equal(at(rome(6, 0)), 'mattina:check');
  assert.equal(at(rome(8, 59)), 'mattina:check');
  assert.equal(at(rome(9, 0)), 'mattina:close');
  assert.equal(at(rome(9, 59)), 'mattina:close');
  assert.equal(at(rome(10, 0)), null);
  assert.equal(at(rome(16, 0)), 'pomeriggio:check');
  assert.equal(at(rome(18, 30)), 'pomeriggio:close');
  assert.equal(at(rome(19, 30)), null);
  assert.equal(at(Date.UTC(2026, 11, 7, 5, 0)), 'mattina:check'); // 06:00 ora solare
  assert.equal(at(Date.UTC(2026, 11, 7, 4, 59)), null);
});
```


- [ ] **Step 2: Eseguire i test e verificare che falliscano**

Run: `node --test test/trains.test.mjs`
Expected: FAIL con `Cannot find module '.../src/core/trains.js'`.

- [ ] **Step 3: Esportare gli helper da `schedule.js`**

In `src/core/schedule.js` sostituire `function pad2(n) {` con `export function pad2(n) {` e `function romeOffsetMs(ms) {` con `export function romeOffsetMs(ms) {`.

- [ ] **Step 4: Implementare `src/core/trains.js` (prima parte)**

```js
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
```

(`romeDayKey` e `hhmm` servono nel Task 3: importarli già ora va bene.)

- [ ] **Step 5: Eseguire tutti i test**

Run: `npm test`
Expected: PASS, compresi i test esistenti (in particolare `bundle.test.mjs`: `trains.js` non è ancora nel bundle).

- [ ] **Step 6: Commit**

```bash
git add src/core/schedule.js src/core/trains.js test/trains.test.mjs
git commit -m "feat: modulo treni con fasce, URL Viaggiatreno e finestre orarie

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: `trains.js` — selezione, allerta e fetch della fascia

**Files:**
- Modify: `src/core/trains.js`
- Create: `test/fixtures/vt-tiburtina.json`, `test/fixtures/vt-fara.json`
- Test: `test/trains.test.mjs`

**Interfaces:**
- Consumes: `romeDayKey`, `hhmm`, `romeMinutes`, `queryTimes`, `partenzeUrl` (Task 2).
- Produces (tipo `Train = { numero: number, categoria: string, destinazione: string, orario: 'HH:MM', partenzaMs: number, ritardo: number, soppresso: boolean }`):
  - `selectTrains(partenze: any[], band, nowMs) → Train[]` (lancia un errore se `partenze` non è un array)
  - `isAlert(t) → boolean`
  - `trainState(t) → 'SOPPRESSO' | "+N'" | 'in orario'`
  - `trainLabel(t) → 'REG 20621 (10:46)'`
  - `worstLabel(trains) → null | 'SOPPR' | "+N'"`
  - `trainsEntry(trains) → { list: Array<Train & { state: string, late: boolean }>, alert: string | null }`
  - `fetchBand(band, nowMs, getJson: (url) => Promise<any>) → Promise<Train[]>`

- [ ] **Step 1: Salvare le fixture reali ridotte**

I tabelloni sono stati scaricati l'8/10/2026 alle ~10:28 nella scratchpad della sessione. Ridurli ai campi utili:

```bash
S="C:/Users/ABOCCA~1/AppData/Local/Temp/claude/C--Users-aboccassini-Documents-VSCode-MoovitWebAppCustom/9e7c06ea-c9a6-46cd-b101-7a5623db23b1/scratchpad"
node -e '
const fs = require("fs");
const keep = ["numeroTreno","categoriaDescrizione","destinazione","codOrigine","orarioPartenza","compOrarioPartenza","ritardo","provvedimento","nonPartito"];
const trim = (src, dst) => fs.writeFileSync(dst, JSON.stringify(JSON.parse(fs.readFileSync(src)).map(t => Object.fromEntries(keep.map(k => [k, t[k]]))), null, 1) + "\n");
trim(process.argv[1] + "/tib.json", "test/fixtures/vt-tiburtina.json");
trim(process.argv[1] + "/fara_1630.json", "test/fixtures/vt-fara.json");
' "$S"
```

Se la scratchpad non c'è più, riscaricare (`curl -A "<VT_UA>" "<partenzeUrl(...)>"`) e **adattare le aspettative dello Step 2** ai treni effettivi. Contenuto atteso delle fixture originali:
- `vt-tiburtina.json` (36 treni, tabellone Tiburtina dalle 10:30): tra gli altri `20613` 10:16 FARA SABINA-MONTELIBRETTI rit 8; `20615` 10:31 FARA rit 4; `20621` 10:46 FARA rit 13; `20481` 11:01 FARA rit 5; `20451` 10:31 FIUMICINO AEROPORTO rit 2; `4519` 10:37 ROMA TERMINI rit −2; `20635` 11:46 ORTE rit 0; `9301` ` FR` 09:27 ROMA TERMINI rit 59. Tutti con `provvedimento` 0.
- `vt-fara.json` (12 treni da Fara dalle 16:30, tutti rit 0): verso FIUMICINO AEROPORTO `20503` 16:20, `20521` 16:35, `20523` 16:50, `20527` 17:05, `20517` 17:20, `20531` 17:35, `20533` 17:50, `20535` 18:05; verso nord `20677` 16:41 ORTE, `20679` 16:56 POGGIO MIRTETO, `20683` 17:26 ORTE, `20687` 17:56 ORTE.

- [ ] **Step 2: Scrivere i test che falliscono**

Aggiungere in testa a `test/trains.test.mjs` gli import mancanti (unica riga `import { ... } from '../src/core/trains.js'` estesa con `selectTrains, isAlert, trainState, trainLabel, worstLabel, trainsEntry, fetchBand`) e:

```js
import { readFileSync } from 'node:fs';

const TIB = JSON.parse(readFileSync(new URL('./fixtures/vt-tiburtina.json', import.meta.url)));
const FARA = JSON.parse(readFileSync(new URL('./fixtures/vt-fara.json', import.meta.url)));
const FIX_NOW = Date.UTC(2026, 9, 8, 8, 28); // 10:28 Roma, quando sono state scaricate
const TEST_POM = { ...POMERIGGIO, from: 615, to: 660 }; // 10:15–11:00 verso Fara
const TEST_MAT = { ...MATTINA, from: 990, to: 1080 };   // 16:30–18:00 verso Roma

test('selectTrains: fascia e destinazione, ordinati, normalizzati', () => {
  const list = selectTrains(TIB, TEST_POM, FIX_NOW);
  assert.deepEqual(list.map(t => `${t.orario} ${t.numero} ${t.ritardo}`), ['10:16 20613 8', '10:31 20615 4', '10:46 20621 13']);
  assert.deepEqual(list[2], {
    numero: 20621, categoria: 'REG', destinazione: 'FARA SABINA-MONTELIBRETTI',
    orario: '10:46', partenzaMs: Date.UTC(2026, 9, 8, 8, 46), ritardo: 13, soppresso: false,
  });
});

test('selectTrains: da Fara tiene solo i treni verso Roma', () => {
  const list = selectTrains(FARA, TEST_MAT, FIX_NOW);
  assert.deepEqual(list.map(t => t.numero), [20521, 20523, 20527, 20517, 20531, 20533]);
});

test('selectTrains: dedup tra chiamate sovrapposte, altro giorno escluso', () => {
  assert.equal(selectTrains([...TIB, ...TIB], TEST_POM, FIX_NOW).length, 3);
  assert.equal(selectTrains(TIB, TEST_POM, FIX_NOW + 86400000).length, 0);
});

test('selectTrains: input non-array → errore', () => {
  assert.throws(() => selectTrains({ error: 'x' }, TEST_POM, FIX_NOW), /Viaggiatreno/);
  assert.throws(() => selectTrains(null, TEST_POM, FIX_NOW), /Viaggiatreno/);
});

test('soppressione, anticipo e provvedimento assente', () => {
  const base = TIB.find(t => t.numeroTreno === 20615);
  const [sopp] = selectTrains([{ ...base, provvedimento: 1 }], TEST_POM, FIX_NOW);
  const [early] = selectTrains([{ ...base, ritardo: -3 }], TEST_POM, FIX_NOW);
  const [noProv] = selectTrains([{ ...base, provvedimento: undefined }], TEST_POM, FIX_NOW);
  assert.equal(sopp.soppresso, true);
  assert.equal(noProv.soppresso, false);
  assert.equal(trainState(sopp), 'SOPPRESSO');
  assert.equal(trainState(early), 'in orario');
  assert.equal(isAlert(early), false);
  assert.equal(isAlert(sopp), true);
});

test('isAlert, trainState, trainLabel, worstLabel', () => {
  const [a, b, c] = selectTrains(TIB, TEST_POM, FIX_NOW); // +8, +4, +13
  assert.equal(isAlert(a), false);
  assert.equal(isAlert({ ...a, ritardo: 10 }), true);
  assert.equal(isAlert(c), true);
  assert.equal(trainState(b), "+4'");
  assert.equal(trainLabel(c), 'REG 20621 (10:46)');
  assert.equal(worstLabel([a, b]), null);
  assert.equal(worstLabel([a, b, c]), "+13'");
  assert.equal(worstLabel([c, { ...b, soppresso: true }]), 'SOPPR');
  assert.equal(worstLabel([]), null);
});

test('trainsEntry: aggiunge stato e allerta per la vista', () => {
  const e = trainsEntry(selectTrains(TIB, TEST_POM, FIX_NOW));
  assert.equal(e.alert, "+13'");
  assert.deepEqual(e.list.map(t => [t.state, t.late]), [["+8'", false], ["+4'", false], ["+13'", true]]);
});

test('fetchBand: una chiamata per queryTimes, risultati uniti e filtrati', async () => {
  const urls = [];
  const list = await fetchBand(TEST_POM, Date.UTC(2026, 9, 8, 8, 0), async url => { urls.push(url); return TIB; });
  assert.equal(urls.length, 1); // 10:15–11:00 → una sola chiamata
  assert.match(urls[0], /\/partenze\/S08217\/Thu%20Oct%2008%202026%2010:15:00%20GMT%2B0200$/);
  assert.equal(list.length, 3);
  await assert.rejects(fetchBand(TEST_POM, Date.UTC(2026, 9, 8, 8, 0), async () => '<html>'), /Viaggiatreno/);
  assert.deepEqual(await fetchBand(TEST_POM, Date.UTC(2026, 9, 8, 12, 0), async () => { throw new Error('non chiamare'); }), []);
});
```

- [ ] **Step 3: Eseguire i test e verificare che falliscano**

Run: `node --test test/trains.test.mjs`
Expected: FAIL con `does not provide an export named 'selectTrains'`.

- [ ] **Step 4: Implementare**

Aggiungere a `src/core/trains.js`:

```js
const BAD_RESPONSE = 'Risposta Viaggiatreno inattesa';

export function selectTrains(partenze, band, nowMs) {
  if (!Array.isArray(partenze)) throw new Error(BAD_RESPONSE);
  const today = romeDayKey(nowMs);
  const seen = new Set();
  const out = [];
  for (const t of partenze) {
    const ms = Number(t && t.orarioPartenza);
    if (!ms || seen.has(t.numeroTreno) || romeDayKey(ms) !== today) continue;
    const m = romeMinutes(ms);
    const dest = String(t.destinazione || '').trim().toUpperCase();
    if (m < band.from || m > band.to || !band.destinations.includes(dest)) continue;
    seen.add(t.numeroTreno);
    out.push({
      numero: t.numeroTreno, categoria: String(t.categoriaDescrizione || '').trim(), destinazione: dest,
      orario: hhmm(ms), partenzaMs: ms, ritardo: Number(t.ritardo) || 0, soppresso: Number(t.provvedimento || 0) !== 0,
    });
  }
  return out.sort((a, b) => a.partenzaMs - b.partenzaMs || a.numero - b.numero);
}

export function isAlert(t) {
  return t.soppresso || t.ritardo >= ALERT_DELAY_MIN;
}

export function trainState(t) {
  return t.soppresso ? 'SOPPRESSO' : t.ritardo > 0 ? `+${t.ritardo}'` : 'in orario';
}

export function trainLabel(t) {
  return `${t.categoria} ${t.numero} (${t.orario})`;
}

export function worstLabel(trains) {
  const bad = trains.filter(isAlert);
  if (!bad.length) return null;
  if (bad.some(t => t.soppresso)) return 'SOPPR';
  return `+${Math.max(...bad.map(t => t.ritardo))}'`;
}

export function trainsEntry(trains) {
  return { list: trains.map(t => ({ ...t, state: trainState(t), late: isAlert(t) })), alert: worstLabel(trains) };
}

export async function fetchBand(band, nowMs, getJson) {
  const pages = await Promise.all(queryTimes(band, nowMs).map(t => getJson(partenzeUrl(band.station, t))));
  if (pages.some(p => !Array.isArray(p))) throw new Error(BAD_RESPONSE);
  return selectTrains(pages.flat(), band, nowMs);
}
```

- [ ] **Step 5: Eseguire tutti i test**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/core/trains.js test/trains.test.mjs test/fixtures/vt-tiburtina.json test/fixtures/vt-fara.json
git commit -m "feat: selezione treni, allerta e fetch della fascia

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: `trains.js` — `diffSnapshots`

**Files:**
- Modify: `src/core/trains.js`
- Test: `test/trains.test.mjs`

**Interfaces:**
- Consumes: `Train`, `isAlert`, `trainState`, `trainLabel`, `CHANGE_DELTA_MIN` (Task 2–3).
- Produces: `diffSnapshots(prev: Train[], curr: Train[]) → string[]` (messaggi in ordine di `curr`; vuoto = niente da notificare).

- [ ] **Step 1: Scrivere i test che falliscono**

Aggiungere `diffSnapshots` all'import e:

```js
const T = (numero, orario, ritardo, soppresso = false) => ({ numero, categoria: 'REG', destinazione: 'FARA SABINA-MONTELIBRETTI', orario, partenzaMs: 0, ritardo, soppresso });

test('diffSnapshots: ingresso in allerta e nuova soppressione', () => {
  assert.deepEqual(diffSnapshots([], [T(1, '16:31', 4), T(2, '16:46', 13)]), ["REG 2 (16:46): +13'"]);
  assert.deepEqual(diffSnapshots([T(1, '16:31', 4)], [T(1, '16:31', 4, true)]), ['REG 1 (16:31): SOPPRESSO']);
  assert.deepEqual(diffSnapshots([T(2, '16:46', 13)], [T(2, '16:46', 13, true)]), ["REG 2 (16:46): +13' → SOPPRESSO"]);
});

test('diffSnapshots: miglioramenti', () => {
  assert.deepEqual(diffSnapshots([T(2, '16:46', 13)], [T(2, '16:46', 4)]), ["REG 2 (16:46) rientrato: +4'"]);
  assert.deepEqual(diffSnapshots([T(2, '16:46', 0, true)], [T(2, '16:46', 3)]), ["REG 2 (16:46): soppressione revocata, +3'"]);
  assert.deepEqual(diffSnapshots([T(2, '16:46', 0, true)], [T(2, '16:46', 15)]), ["REG 2 (16:46): soppressione revocata, +15'"]);
  assert.deepEqual(diffSnapshots([T(2, '16:46', 25)], [T(2, '16:46', 15)]), ["REG 2 (16:46): +25' → +15'"]);
});

test('diffSnapshots: variazioni sotto i 5 minuti e treni partiti ignorati', () => {
  assert.deepEqual(diffSnapshots([T(2, '16:46', 13)], [T(2, '16:46', 17)]), []);
  assert.deepEqual(diffSnapshots([T(2, '16:46', 13)], [T(2, '16:46', 18)]), ["REG 2 (16:46): +13' → +18'"]);
  assert.deepEqual(diffSnapshots([T(1, '16:31', 4), T(2, '16:46', 3)], [T(1, '16:31', 9)]), []);
  assert.deepEqual(diffSnapshots([T(2, '16:46', 30)], []), []); // partito: sparito dal tabellone
});
```

- [ ] **Step 2: Eseguire i test e verificare che falliscano**

Run: `node --test test/trains.test.mjs`
Expected: FAIL con `does not provide an export named 'diffSnapshots'`.

- [ ] **Step 3: Implementare**

```js
// Variazioni da notificare tra due fotografie della fascia. I treni spariti dal tabellone (già partiti) si ignorano.
export function diffSnapshots(prev, curr) {
  const before = new Map(prev.map(t => [t.numero, t]));
  const out = [];
  for (const c of curr) {
    const p = before.get(c.numero);
    const was = !!p && isAlert(p);
    const is = isAlert(c);
    const label = trainLabel(c);
    if (!was && is) out.push(`${label}: ${trainState(c)}`);
    else if (was && !is) out.push(p.soppresso ? `${label}: soppressione revocata, ${trainState(c)}` : `${label} rientrato: ${trainState(c)}`);
    else if (was && is) {
      if (c.soppresso && !p.soppresso) out.push(`${label}: ${trainState(p)} → SOPPRESSO`);
      else if (!c.soppresso && p.soppresso) out.push(`${label}: soppressione revocata, ${trainState(c)}`);
      else if (!c.soppresso && Math.abs(c.ritardo - p.ritardo) >= CHANGE_DELTA_MIN) out.push(`${label}: ${trainState(p)} → ${trainState(c)}`);
    }
  }
  return out;
}
```

- [ ] **Step 4: Eseguire tutti i test**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/trains.js test/trains.test.mjs
git commit -m "feat: confronto tra fotografie dei treni per le notifiche

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Integrazione Scriptable — modello, fetch e icona nel widget

**Files:**
- Modify: `src/core/model.js`, `src/scriptable/config.js`, `src/scriptable/main.js`, `src/scriptable/widget.js`, `scripts/bundle.mjs`
- Create: `src/scriptable/trains.js`
- Test: `test/model.test.mjs`, `test/bundle.test.mjs`

**Interfaces:**
- Consumes: `bandForBusStop`, `fetchBand`, `trainsEntry`, `VT_UA` (Task 2–3).
- Produces:
  - `autoStop(nowMs) → 'tiburtina' | 'calabria'` (in `model.js`)
  - `buildModel(data, feed, nowMs, trains = {})`, con `model.trains = trains` di tipo `{ [stopKey]: { list, alert } | null }` (chiave assente = fascia non richiesta)
  - `loadTrains(keys: string[], nowMs) → Promise<{ [stopKey]: { list, alert } | null }>` (Scriptable)
  - il bundle esporta anche `selectTrains` e `worstLabel`

- [ ] **Step 1: Scrivere i test che falliscono**

In `test/model.test.mjs` cambiare l'import in `import { buildModel, autoStop } from '../src/core/model.js';` e aggiungere:

```js
test('trains: passati nel modello così come sono, default vuoto', () => {
  const tr = { calabria: { list: [], alert: null }, tiburtina: null };
  assert.deepEqual(buildModel(data(), null, NOW).trains, {});
  assert.equal(buildModel(data(), null, NOW, tr).trains, tr);
});

test('autoStop coincide con model.auto', () => {
  assert.equal(autoStop(Date.UTC(2026, 9, 6, 6, 0)), 'tiburtina');
  assert.equal(autoStop(Date.UTC(2026, 9, 6, 10, 0)), 'calabria');
});
```

In `test/bundle.test.mjs` aggiungere:

```js
// in testa: import { readFileSync } from 'node:fs';

test('il bundle include la logica treni', () => {
  const api = load(bundle({ pagesBase: BASE }));
  const tib = JSON.parse(readFileSync(new URL('./fixtures/vt-tiburtina.json', import.meta.url)));
  const band = { key: 't', station: 'S08217', from: 615, to: 660, destinations: ['FARA SABINA-MONTELIBRETTI'] };
  const list = api.selectTrains(tib, band, Date.UTC(2026, 9, 8, 8, 28));
  assert.equal(api.worstLabel(list), "+13'");
});
```

(Aggiungere `readFileSync` all'import esistente di `node:fs`.)

- [ ] **Step 2: Eseguire i test e verificare che falliscano**

Run: `npm test`
Expected: FAIL (`autoStop` non esportato; `api.selectTrains is not a function`).

- [ ] **Step 3: Modello**

In `src/core/model.js`:

```js
export function autoStop(nowMs) {
  return romeParts(nowMs).h < 12 ? 'tiburtina' : 'calabria';
}

export function buildModel(data, feed, nowMs, trains = {}) {
```

e nel `return` sostituire `auto: romeParts(nowMs).h < 12 ? 'tiburtina' : 'calabria', stops` con `auto: autoStop(nowMs), stops, trains`.

- [ ] **Step 4: Fetch lato Scriptable**

`src/scriptable/config.js`, aggiungere la riga:

```js
const VT_TIMEOUT_S = 5;
```

`src/scriptable/trains.js`:

```js
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
```

- [ ] **Step 5: `main.js`**

Sostituire il corpo del `try` in `src/scriptable/main.js` con:

```js
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
```

e l'import in `import { buildModel, autoStop } from '../core/model.js';`.

- [ ] **Step 6: Icona nel widget**

In `src/scriptable/widget.js`, in `buildWidget`, subito dopo `head.addSpacer();`:

```js
  const tr = (model.trains || {})[key];
  if (tr && tr.alert) wText(head, '🚆' + tr.alert + ' ', 11, W_COLORS.warn);
```

- [ ] **Step 7: Bundle**

In `scripts/bundle.mjs`:

```js
export const ORDER = [
  'src/core/schedule.js', 'src/core/b64.js', 'src/core/pbf.js', 'src/core/merge.js', 'src/core/trains.js', 'src/core/model.js',
  'src/scriptable/config.js', 'src/scriptable/cache.js', 'src/scriptable/trains.js', 'src/scriptable/widget.js',
  'src/scriptable/view.js', 'src/scriptable/main.js',
];
```

e `parts.push('module.exports = { main, buildModel, decodeFeed, selectTrains, worstLabel };', '');`.

- [ ] **Step 8: Eseguire tutti i test e il bundle**

Run: `npm test && node scripts/bundle.mjs`
Expected: PASS; `Bundle scritto in dist/` senza errori di nomi duplicati.

- [ ] **Step 9: Commit**

```bash
git add src/core/model.js src/scriptable/config.js src/scriptable/trains.js src/scriptable/main.js src/scriptable/widget.js scripts/bundle.mjs test/model.test.mjs test/bundle.test.mjs
git commit -m "feat: treni nel widget, icona in caso di ritardo o soppressione

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Sezione treni nella vista e anteprima

**Files:**
- Modify: `src/view.html`, `scripts/preview-view.mjs`
- Test: `test/bundle.test.mjs`

**Interfaces:**
- Consumes: `model.trains[TAB]` = `{ list: [{ orario, categoria, numero, destinazione, state, late }], alert } | null | undefined` (Task 5); `TRAIN_BANDS`, `bandForBusStop`, `selectTrains`, `fetchBand`, `trainsEntry`, `VT_UA` (Task 2–3).
- Produces: sezione `#trSec` in `view.html`; `node scripts/preview-view.mjs [tab] [--live]` con treni (demo da fixture senza `--live`, reali con `--live`).

- [ ] **Step 1: Test che fallisce**

In `test/bundle.test.mjs`, nel primo test dopo `assert.match(code, /function init\(model, tab\)/);` aggiungere:

```js
  assert.match(code, /id=\\"trSec\\"/); // sezione treni nella vista incorporata
```

Run: `node --test test/bundle.test.mjs` → FAIL.

- [ ] **Step 2: Markup e stile**

In `src/view.html`, prima di `<footer id="foot"></footer>`:

```html
  <section id="trSec" hidden>
    <h2><span id="trTitle"></span><span id="trNote"></span></h2>
    <ul class="tr" id="trList"></ul>
  </section>
```

Nel `<style>`, prima di `footer{...}`:

```css
ul.tr{list-style:none;margin:0;padding:0}
ul.tr li{display:grid;grid-template-columns:3.2rem 1fr auto;gap:.5rem;align-items:baseline;background:var(--card);border-left:4px solid var(--rule);border-radius:2px;padding:.4rem .6rem;margin-bottom:.3rem;font-variant-numeric:tabular-nums}
ul.tr li span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--muted);font-size:.9rem}
ul.tr li em{font-style:normal;font-weight:700}
ul.tr li.late{border-left-color:var(--warn)}
ul.tr li.late em{color:var(--warn)}
ul.tr li.na{display:block;color:var(--muted)}
```

- [ ] **Step 3: Rendering**

Nello `<script>` di `view.html`, dopo la costante `SUB`:

```js
const TRAIN_TITLE = { tiburtina: 'Treni Fara Sabina → Tiburtina', calabria: 'Treni Tiburtina → Fara Sabina' };
```

In fondo a `render()`, prima della riga `$('foot').textContent = ...`:

```js
  const tr = (M.trains || {})[TAB];
  $('trSec').hidden = tr === undefined;
  $('trTitle').textContent = TRAIN_TITLE[TAB] || 'Treni';
  $('trNote').textContent = tr && tr.alert ? 'ritardi in fascia' : '';
  $('trList').innerHTML = !tr ? '<li class="na">Treni non disponibili.</li>'
    : !tr.list.length ? '<li class="na">Nessun treno in fascia.</li>'
    : tr.list.map(t => `<li class="${t.late ? 'late' : ''}"><b>${t.orario}</b><span>${esc(t.categoria)} ${t.numero} · ${esc(t.destinazione)}</span><em>${esc(t.state)}</em></li>`).join('');
```

- [ ] **Step 4: Anteprima con treni**

Sostituire `scripts/preview-view.mjs` con:

```js
// Genera dist/preview.html: la vista con dati veri, da aprire nel browser del PC.
// Uso: node scripts/preview-view.mjs [tiburtina|calabria] [--live]
// Senza --live i treni sono una demo dalle fixture dell'8/10/2026 (stessa lista per entrambe le schede).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { buildModel } from '../src/core/model.js';
import { decodeFeed } from '../src/core/pbf.js';
import { TRAIN_BANDS, bandForBusStop, selectTrains, fetchBand, trainsEntry, VT_UA } from '../src/core/trains.js';

const RT_URL = 'https://romamobilita.it/sites/default/files/rome_rtgtfs_trip_updates_feed.pb';
const tab = process.argv.find(a => a === 'tiburtina' || a === 'calabria') || 'calabria';
const live = process.argv.includes('--live');
const data = JSON.parse(readFileSync('data/data.json', 'utf8'));
const now = Date.now();
let feed = null;
const trains = {};
if (live) {
  const res = await fetch(RT_URL);
  feed = decodeFeed(new Uint8Array(await res.arrayBuffer()), { routes: ['490', '495'] });
  const getJson = async url => (await fetch(url, { headers: { 'User-Agent': VT_UA, Accept: 'application/json' } })).json();
  for (const key of Object.keys(data.stops)) {
    try { trains[key] = trainsEntry(await fetchBand(bandForBusStop(key), now, getJson)); } catch (e) { trains[key] = null; }
  }
} else {
  const fixture = JSON.parse(readFileSync('test/fixtures/vt-tiburtina.json', 'utf8'));
  const demo = { ...TRAIN_BANDS[1], from: 615, to: 720 };
  const list = selectTrains(fixture, demo, Date.UTC(2026, 9, 8, 8, 28));
  list[1] = { ...list[1], soppresso: true };
  for (const key of Object.keys(data.stops)) trains[key] = trainsEntry(list);
}
const model = buildModel(data, feed, now, trains);
const html = readFileSync('src/view.html', 'utf8')
  .replace('</body>', `<script>init(${JSON.stringify(model)}, ${JSON.stringify(tab)});</script>\n</body>`);
mkdirSync('dist', { recursive: true });
writeFileSync('dist/preview.html', html);
console.log(`Scritto dist/preview.html (scheda ${tab}, tempo reale ${model.rtOk ? 'sì' : 'no'}, treni ${live ? 'live' : 'demo'})`);
```

- [ ] **Step 5: Test e verifica visiva**

Run: `npm test` → PASS.
Run: `node scripts/preview-view.mjs calabria` e aprire `dist/preview.html` nel Browser pane (`preview_start` con `url` `file:///.../dist/preview.html`, oppure leggerla con `get_page_text`). Atteso: sezione "Treni Tiburtina → Fara Sabina" con 7 righe (10:16–11:46 verso Fara/Orte), `+13'` e `SOPPRESSO` evidenziati in rosso mattone, nota "ritardi in fascia"; nessuno scroll orizzontale a 375 px; in tema scuro i colori restano leggibili.
Run: `node scripts/preview-view.mjs tiburtina --live` → nessun errore; sezione presente (lista vuota fuori fascia, oppure "Treni non disponibili" se Viaggiatreno blocca).

- [ ] **Step 6: Commit**

```bash
git add src/view.html scripts/preview-view.mjs test/bundle.test.mjs
git commit -m "feat: sezione treni nella vista di dettaglio

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Pubblicazione del widget e prova sull'iPhone

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: tutto il repo bus aggiornato (Task 2–6).
- Produces: `Bus490495.js` aggiornato su Pages; `src/core/trains.js` su `main` (lo usa il repo privato in CI).

- [ ] **Step 1: README**

In `README.md`, dopo la prima frase di introduzione, aggiungere:

```markdown
Se i regionali **Fara Sabina ↔ Tiburtina** della fascia abbinata (mattina 6:30–9:00 da Fara, pomeriggio
16:30–18:30 da Tiburtina) hanno un ritardo ≥ 10' o una soppressione, il widget mostra `🚆+N'` / `🚆SOPPR`
e la vista elenca i treni della fascia. Dati: Viaggiatreno, chiamato direttamente dall'iPhone.
```

- [ ] **Step 2: Test, commit, pull e push**

```bash
npm test
git add README.md
git commit -m "docs: treni nel README

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git pull --rebase && git push
```

Il push su `main` fa partire `update-data`, che pubblica il nuovo bundle su Pages.

- [ ] **Step 3: Verificare la pubblicazione**

Attendere il workflow (chiedere all'utente di controllare *Actions → update-data*, verde), poi:

```bash
curl -s https://springfield33.github.io/MoovitWebAppCustom/Bus490495.js | grep -c "selectTrains"
```

Expected: un numero ≥ 1.

- [ ] **Step 4: Prova sull'iPhone (utente)**

Chiedere all'utente di aprire `scriptable:///run/Bus?update=1`, poi verificare:
- la vista mostra la sezione treni della scheda attiva (dentro o fuori fascia: lista o "Nessun treno in fascia");
- il widget è uguale a prima se non ci sono ritardi; se c'è un ritardo ≥ 10' in fascia compare `🚆+N'` arancione.

Se la sezione dice sempre "Treni non disponibili", diagnosticare con l'output del Task 1 Step 5 prima di proseguire.

---

### Task 8: Repo privato — formattazione issue

Lavorare in `C:\Users\aboccassini\Documents\VSCode\treni-fara`.

**Files:**
- Create: `package.json`, `.gitignore`, `lib/format.mjs`, `test/format.test.mjs`

**Interfaces:**
- Consumes: `trainLabel`, `trainState`, `isAlert` da `../bus/src/core/trains.js`; `romeDayKey`, `fmtMin` da `../bus/src/core/schedule.js`.
- Produces:
  - `romeIsoDay(nowMs) → 'YYYY-MM-DD'`
  - `issuePrefix(nowMs, band) → '🚆 2026-10-08 pomeriggio'`
  - `issueTitle(prefix, trains) → "🚆 … — REG 20621 +13', REG 20615 SOPPRESSO"` (solo treni in allerta)
  - `trainsTable(trains) → string` (markdown)
  - `embedSnapshot(trains) → '<!-- snapshot:[…] -->'`, `extractSnapshot(text) → Train[] | null`
  - `openBody(band, trains)`, `commentBody(changes, trains)`, `closeBody(trains | null)` → string

- [ ] **Step 1: Scaffolding e junction verso il repo bus**

`package.json`:

```json
{
  "name": "treni-fara",
  "private": true,
  "type": "module",
  "scripts": { "test": "node --test" }
}
```

`.gitignore`:

```
node_modules/
bus/
```

Junction (PowerShell), così `bus/` punta al repo pubblico locale:

```powershell
New-Item -ItemType Junction -Path C:\Users\aboccassini\Documents\VSCode\treni-fara\bus -Target C:\Users\aboccassini\Documents\VSCode\MoovitWebAppCustom
```

- [ ] **Step 2: Scrivere i test che falliscono**

`test/format.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TRAIN_BANDS } from '../bus/src/core/trains.js';
import { romeIsoDay, issuePrefix, issueTitle, trainsTable, embedSnapshot, extractSnapshot, openBody, commentBody, closeBody } from '../lib/format.mjs';

const POM = TRAIN_BANDS[1];
const T = (numero, orario, ritardo, soppresso = false) => ({ numero, categoria: 'REG', destinazione: 'FARA SABINA-MONTELIBRETTI', orario, partenzaMs: 1, ritardo, soppresso });
const LIST = [T(20615, '16:31', 4), T(20621, '16:46', 13), T(20629, '17:16', 0, true)];

test('giorno e prefisso in ora di Roma', () => {
  assert.equal(romeIsoDay(Date.UTC(2026, 9, 8, 22, 30)), '2026-10-09'); // 00:30 del 9 a Roma
  assert.equal(issuePrefix(Date.UTC(2026, 9, 8, 14, 0), POM), '🚆 2026-10-08 pomeriggio');
});

test('titolo con i soli treni in allerta', () => {
  assert.equal(issueTitle('🚆 2026-10-08 pomeriggio', LIST), "🚆 2026-10-08 pomeriggio — REG 20621 +13', REG 20629 SOPPRESSO");
});

test('tabella markdown con allerta in grassetto', () => {
  assert.equal(trainsTable(LIST), [
    '| Partenza | Treno | Destinazione | Stato |',
    '|---|---|---|---|',
    "| 16:31 | REG 20615 | FARA SABINA-MONTELIBRETTI | +4' |",
    "| 16:46 | REG 20621 | FARA SABINA-MONTELIBRETTI | **+13'** |",
    '| 17:16 | REG 20629 | FARA SABINA-MONTELIBRETTI | **SOPPRESSO** |',
  ].join('\n'));
  assert.equal(trainsTable([]), '_Nessun treno in fascia._');
});

test('snapshot: andata e ritorno, testo senza snapshot o corrotto → null', () => {
  assert.deepEqual(extractSnapshot(`ciao\n\n${embedSnapshot(LIST)}\n`), LIST);
  assert.equal(extractSnapshot('nessuno'), null);
  assert.equal(extractSnapshot('<!-- snapshot:{rotto -->'), null);
  assert.equal(extractSnapshot(null), null);
});

test('corpi di apertura, commento e chiusura', () => {
  const open = openBody(POM, LIST);
  assert.match(open, /^\*\*Tiburtina → Fara Sabina\*\* · partenze 16:30–18:30/);
  assert.deepEqual(extractSnapshot(open), LIST);
  const c = commentBody(["REG 20621 (16:46): +13' → +20'"], LIST);
  assert.match(c, /^- REG 20621 \(16:46\): \+13' → \+20'\n/);
  assert.deepEqual(extractSnapshot(c), LIST);
  assert.match(closeBody(LIST), /^Fascia terminata\. Ultima situazione:/);
  assert.equal(closeBody(null), 'Fascia terminata.');
});
```

- [ ] **Step 3: Eseguire i test e verificare che falliscano**

Run: `npm test`
Expected: FAIL con `Cannot find module '.../lib/format.mjs'`.

- [ ] **Step 4: Implementare `lib/format.mjs`**

```js
// Testi delle issue: titolo, tabella treni e fotografia nascosta per il confronto successivo.
import { trainState, isAlert } from '../bus/src/core/trains.js';
import { romeDayKey, fmtMin } from '../bus/src/core/schedule.js';

const SNAP_RE = /<!-- snapshot:(.*?) -->/s;

export function romeIsoDay(nowMs) {
  const k = romeDayKey(nowMs);
  return `${k.slice(0, 4)}-${k.slice(4, 6)}-${k.slice(6, 8)}`;
}

export function issuePrefix(nowMs, band) {
  return `🚆 ${romeIsoDay(nowMs)} ${band.key}`;
}

export function issueTitle(prefix, trains) {
  return `${prefix} — ${trains.filter(isAlert).map(t => `${t.categoria} ${t.numero} ${trainState(t)}`).join(', ')}`;
}

export function trainsTable(trains) {
  if (!trains.length) return '_Nessun treno in fascia._';
  const rows = trains.map(t => {
    const st = isAlert(t) ? `**${trainState(t)}**` : trainState(t);
    return `| ${t.orario} | ${t.categoria} ${t.numero} | ${t.destinazione} | ${st} |`;
  });
  return ['| Partenza | Treno | Destinazione | Stato |', '|---|---|---|---|', ...rows].join('\n');
}

export function embedSnapshot(trains) {
  return `<!-- snapshot:${JSON.stringify(trains)} -->`;
}

export function extractSnapshot(text) {
  const m = SNAP_RE.exec(text || '');
  if (!m) return null;
  try {
    const v = JSON.parse(m[1]);
    return Array.isArray(v) ? v : null;
  } catch (e) {
    return null;
  }
}

export function openBody(band, trains) {
  return `**${band.label}** · partenze ${fmtMin(band.from)}–${fmtMin(band.to)}\n\n${trainsTable(trains)}\n\n${embedSnapshot(trains)}`;
}

export function commentBody(changes, trains) {
  return `${changes.map(c => `- ${c}`).join('\n')}\n\n${trainsTable(trains)}\n\n${embedSnapshot(trains)}`;
}

export function closeBody(trains) {
  return trains ? `Fascia terminata. Ultima situazione:\n\n${trainsTable(trains)}` : 'Fascia terminata.';
}
```


- [ ] **Step 5: Eseguire i test**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add package.json .gitignore lib/format.mjs test/format.test.mjs
git commit -m "feat: testi delle issue treni

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Repo privato — client GitHub e decisione del run

**Files:**
- Create: `lib/github.mjs`, `lib/run.mjs`, `test/github.test.mjs`, `test/run.test.mjs`

**Interfaces:**
- Consumes: `bandAt`, `fetchBand`, `isAlert`, `diffSnapshots` (repo bus); `issuePrefix`, `issueTitle`, `openBody`, `commentBody`, `closeBody`, `extractSnapshot` (Task 8).
- Produces:
  - `createGitHub({ token, repo, fetchImpl = fetch }) → { findOpenIssue(prefix) → Promise<{ number, title, body } | null>, lastSnapshot(issue) → Promise<Train[] | null>, createIssue(title, body) → Promise<{ number }>, comment(number, body), close(number) }`
  - `run({ nowMs, getJson, gh }) → Promise<string>` (esito leggibile per il log)

- [ ] **Step 1: Test del client GitHub (falliscono)**

`test/github.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGitHub } from '../lib/github.mjs';

function fakeFetch(routes) {
  const calls = [];
  const impl = async (url, opts = {}) => {
    calls.push([opts.method || 'GET', url, opts.body ? JSON.parse(opts.body) : undefined, opts.headers]);
    const key = `${opts.method || 'GET'} ${url.replace('https://api.github.com/repos/o/r', '')}`;
    const r = routes[key];
    if (r === undefined) return { ok: false, status: 404, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => r };
  };
  return { impl, calls };
}

test('findOpenIssue: ignora le PR e cerca per prefisso', async () => {
  const { impl, calls } = fakeFetch({ 'GET /issues?state=open&per_page=100': [
    { number: 3, title: '🚆 2026-10-08 pomeriggio — x', pull_request: {} },
    { number: 2, title: 'Prova notifica treni' },
    { number: 1, title: '🚆 2026-10-08 pomeriggio — REG 1 +12\'', body: 'b' },
  ] });
  const gh = createGitHub({ token: 'tok', repo: 'o/r', fetchImpl: impl });
  assert.equal((await gh.findOpenIssue('🚆 2026-10-08 pomeriggio')).number, 1);
  assert.equal(await gh.findOpenIssue('🚆 2026-10-08 mattina'), null);
  assert.equal(calls[0][3].Authorization, 'Bearer tok');
});

test('lastSnapshot: ultimo commento con snapshot, altrimenti il corpo', async () => {
  const { impl } = fakeFetch({
    'GET /issues/1/comments?per_page=100': [{ body: '<!-- snapshot:[{"numero":1}] -->' }, { body: 'commento a mano' }],
    'GET /issues/2/comments?per_page=100': [],
  });
  const gh = createGitHub({ token: 't', repo: 'o/r', fetchImpl: impl });
  assert.deepEqual(await gh.lastSnapshot({ number: 1, body: '<!-- snapshot:[] -->' }), [{ numero: 1 }]);
  assert.deepEqual(await gh.lastSnapshot({ number: 2, body: '<!-- snapshot:[{"numero":2}] -->' }), [{ numero: 2 }]);
});

test('scritture e errori HTTP', async () => {
  const { impl, calls } = fakeFetch({ 'POST /issues': { number: 7 }, 'POST /issues/7/comments': {}, 'PATCH /issues/7': {} });
  const gh = createGitHub({ token: 't', repo: 'o/r', fetchImpl: impl });
  assert.equal((await gh.createIssue('T', 'B')).number, 7);
  await gh.comment(7, 'C');
  await gh.close(7);
  assert.deepEqual(calls.map(c => [c[0], c[2]]), [['POST', { title: 'T', body: 'B' }], ['POST', { body: 'C' }], ['PATCH', { state: 'closed', state_reason: 'completed' }]]);
  await assert.rejects(gh.findOpenIssue('x'), /GitHub GET .* 404/);
});
```

Run: `npm test` → FAIL (`lib/github.mjs` mancante).

- [ ] **Step 2: Implementare `lib/github.mjs`**

```js
// Client minimale per le issue del repository corrente (API REST, GITHUB_TOKEN).
import { extractSnapshot } from './format.mjs';

const API = 'https://api.github.com';

export function createGitHub({ token, repo, fetchImpl = fetch }) {
  async function call(method, path, body) {
    const res = await fetchImpl(`${API}/repos/${repo}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new Error(`GitHub ${method} ${path}: ${res.status}`);
    return res.json();
  }
  return {
    async findOpenIssue(prefix) {
      const list = await call('GET', '/issues?state=open&per_page=100');
      return list.find(i => !i.pull_request && i.title.startsWith(prefix)) || null;
    },
    async lastSnapshot(issue) {
      const comments = await call('GET', `/issues/${issue.number}/comments?per_page=100`);
      for (const c of [...comments].reverse()) {
        const s = extractSnapshot(c.body);
        if (s) return s;
      }
      return extractSnapshot(issue.body);
    },
    createIssue: (title, body) => call('POST', '/issues', { title, body }),
    comment: (number, body) => call('POST', `/issues/${number}/comments`, { body }),
    close: number => call('PATCH', `/issues/${number}`, { state: 'closed', state_reason: 'completed' }),
  };
}
```

Run: `npm test` → PASS per `github.test.mjs`.

- [ ] **Step 3: Test di `run` (falliscono)**

`test/run.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { run } from '../lib/run.mjs';
import { embedSnapshot } from '../lib/format.mjs';

// Partenze Viaggiatreno finte dell'8/10/2026 (ora legale, +02:00).
const vt = (numeroTreno, hm, destinazione, ritardo, provvedimento = 0) => {
  const [h, m] = hm.split(':').map(Number);
  return { numeroTreno, categoriaDescrizione: 'REG', destinazione, orarioPartenza: Date.UTC(2026, 9, 8, h - 2, m), ritardo, provvedimento };
};
const BOARD = [
  vt(20615, '16:31', 'FARA SABINA-MONTELIBRETTI', 4),
  vt(20621, '16:46', 'FARA SABINA-MONTELIBRETTI', 13),
  vt(20451, '16:31', 'FIUMICINO AEROPORTO', 20),
];
const AT_1620 = Date.UTC(2026, 9, 8, 14, 20);
const AT_1840 = Date.UTC(2026, 9, 8, 16, 40);

function fakeGh(issue = null, snapshot = null) {
  const calls = [];
  return {
    calls,
    findOpenIssue: async p => { calls.push(['find', p]); return issue; },
    lastSnapshot: async () => snapshot,
    createIssue: async (title, body) => { calls.push(['create', title, body]); return { number: 1 }; },
    comment: async (n, body) => { calls.push(['comment', n, body]); },
    close: async n => { calls.push(['close', n]); },
  };
}
const board = b => { const urls = []; const fn = async url => { urls.push(url); return b; }; fn.urls = urls; return fn; };

test('fuori fascia: nessuna chiamata', async () => {
  const gh = fakeGh();
  const getJson = board(BOARD);
  assert.equal(await run({ nowMs: Date.UTC(2026, 9, 8, 10, 0), getJson, gh }), 'fuori fascia');
  assert.deepEqual([gh.calls, getJson.urls], [[], []]);
});

test('nessuna issue e nessun ritardo: niente', async () => {
  const gh = fakeGh();
  const out = await run({ nowMs: AT_1620, getJson: board([vt(20615, '16:31', 'FARA SABINA-MONTELIBRETTI', 4)]), gh });
  assert.equal(out, 'nessun ritardo');
  assert.deepEqual(gh.calls.map(c => c[0]), ['find']);
});

test('primo ritardo: apre la issue (due chiamate sovrapposte, treni contati una volta)', async () => {
  const gh = fakeGh();
  const getJson = board(BOARD);
  assert.equal(await run({ nowMs: AT_1620, getJson, gh }), 'aperta #1');
  assert.equal(getJson.urls.length, 2);
  const [, title, body] = gh.calls.find(c => c[0] === 'create');
  assert.equal(title, "🚆 2026-10-08 pomeriggio — REG 20621 +13'");
  assert.equal((body.match(/20621/g) || []).length, 2); // riga in tabella + snapshot
  assert.doesNotMatch(body, /20451/); // Fiumicino: direzione sbagliata
});

test('issue aperta senza variazioni: niente', async () => {
  const snap = [{ numero: 20621, categoria: 'REG', destinazione: 'FARA SABINA-MONTELIBRETTI', orario: '16:46', partenzaMs: 0, ritardo: 11, soppresso: false }];
  const gh = fakeGh({ number: 5, body: embedSnapshot(snap) }, snap);
  assert.equal(await run({ nowMs: AT_1620, getJson: board(BOARD), gh }), 'nessuna variazione');
});

test('issue aperta e ritardo cresciuto di 5\': commento', async () => {
  const snap = [{ numero: 20621, categoria: 'REG', destinazione: 'FARA SABINA-MONTELIBRETTI', orario: '16:46', partenzaMs: 0, ritardo: 13, soppresso: false }];
  const gh = fakeGh({ number: 5 }, snap);
  const b = [vt(20621, '16:46', 'FARA SABINA-MONTELIBRETTI', 20)];
  assert.equal(await run({ nowMs: AT_1620, getJson: board(b), gh }), 'commento su #5');
  assert.match(gh.calls.find(c => c[0] === 'comment')[2], /^- REG 20621 \(16:46\): \+13' → \+20'/);
});

test('dopo la fascia: chiude la issue senza chiamare Viaggiatreno', async () => {
  const gh = fakeGh({ number: 5 }, []);
  const getJson = board(BOARD);
  assert.equal(await run({ nowMs: AT_1840, getJson, gh }), 'chiusa #5');
  assert.deepEqual(gh.calls.map(c => c[0]), ['find', 'comment', 'close']);
  assert.equal(getJson.urls.length, 0);
  assert.equal(await run({ nowMs: AT_1840, getJson, gh: fakeGh() }), 'nessuna issue da chiudere');
});

test('Viaggiatreno risponde male: errore propagato', async () => {
  await assert.rejects(run({ nowMs: AT_1620, getJson: board('<html>Access Denied</html>'), gh: fakeGh() }), /Viaggiatreno/);
});
```

Run: `npm test` → FAIL (`lib/run.mjs` mancante).

- [ ] **Step 4: Implementare `lib/run.mjs`**

```js
// Un controllo: decide se aprire, commentare o chiudere la issue della fascia corrente.
import { bandAt, fetchBand, isAlert, diffSnapshots } from '../bus/src/core/trains.js';
import { issuePrefix, issueTitle, openBody, commentBody, closeBody } from './format.mjs';

export async function run({ nowMs, getJson, gh }) {
  const at = bandAt(nowMs);
  if (!at) return 'fuori fascia';
  const prefix = issuePrefix(nowMs, at.band);
  const issue = await gh.findOpenIssue(prefix);
  if (at.phase === 'close') {
    if (!issue) return 'nessuna issue da chiudere';
    await gh.comment(issue.number, closeBody(await gh.lastSnapshot(issue)));
    await gh.close(issue.number);
    return `chiusa #${issue.number}`;
  }
  const trains = await fetchBand(at.band, nowMs, getJson);
  if (!issue) {
    if (!trains.some(isAlert)) return 'nessun ritardo';
    const created = await gh.createIssue(issueTitle(prefix, trains), openBody(at.band, trains));
    return `aperta #${created.number}`;
  }
  const changes = diffSnapshots((await gh.lastSnapshot(issue)) || [], trains);
  if (!changes.length) return 'nessuna variazione';
  await gh.comment(issue.number, commentBody(changes, trains));
  return `commento su #${issue.number}`;
}
```

- [ ] **Step 5: Eseguire i test**

Run: `npm test`
Expected: PASS (format, github, run).

- [ ] **Step 6: Commit**

```bash
git add lib/github.mjs lib/run.mjs test/github.test.mjs test/run.test.mjs
git commit -m "feat: client GitHub e logica di apertura, commento e chiusura

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Repo privato — entry point, workflow e messa in servizio

**Files:**
- Create: `notify.mjs`, `.github/workflows/check.yml`, `README.md`
- Delete: `.github/workflows/probe.yml`

**Interfaces:**
- Consumes: `run` (Task 9), `createGitHub` (Task 9), `VT_UA` (repo bus).
- Produces: controllo automatico lun–ven; `workflow_dispatch` con input `now` (ISO) per simulare un orario.

- [ ] **Step 1: `notify.mjs`**

```js
// Entry point del workflow: controlla i treni della fascia corrente e aggiorna la issue.
import { VT_UA } from './bus/src/core/trains.js';
import { createGitHub } from './lib/github.mjs';
import { run } from './lib/run.mjs';

async function getJson(url) {
  const res = await fetch(url, { headers: { 'User-Agent': VT_UA, Accept: 'application/json' }, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`Viaggiatreno HTTP ${res.status} per ${url}`);
  return res.json().catch(() => { throw new Error(`Risposta Viaggiatreno inattesa per ${url}`); });
}

const nowMs = process.env.NOW ? Date.parse(process.env.NOW) : Date.now();
if (Number.isNaN(nowMs)) throw new Error(`NOW non valido: ${process.env.NOW}`);
const gh = createGitHub({ token: process.env.GITHUB_TOKEN, repo: process.env.GITHUB_REPOSITORY });
console.log(await run({ nowMs, getJson, gh }));
```

Un'eccezione non gestita fa uscire Node con codice 1: il run fallisce e GitHub manda la mail "run failed".

- [ ] **Step 2: Prova locale fuori fascia**

Run: `node notify.mjs` con `NOW=2026-10-08T12:00:00+02:00` (PowerShell: `$env:NOW='2026-10-08T12:00:00+02:00'; node notify.mjs; Remove-Item Env:NOW`).
Expected: stampa `fuori fascia` senza chiamate di rete (nessun token necessario).

- [ ] **Step 3: Workflow `check.yml`**

```yaml
name: check

on:
  schedule:
    - cron: '*/10 4-8 * * 1-5'    # mattina: 06:00–09:00 + chiusura, ora legale e solare
    - cron: '*/10 14-17 * * 1-5'  # pomeriggio: 16:00–18:30 + chiusura
  workflow_dispatch:
    inputs:
      now:
        description: 'Ora simulata ISO, es. 2026-10-08T16:20:00+02:00 (vuoto = adesso)'
        required: false

permissions:
  contents: read
  issues: write

concurrency:
  group: check
  cancel-in-progress: false

jobs:
  check:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - uses: actions/checkout@v7
      - uses: actions/checkout@v7
        with:
          repository: Springfield33/MoovitWebAppCustom
          path: bus
      - uses: actions/setup-node@v7
        with:
          node-version: 24
      - run: node notify.mjs
        env:
          GITHUB_TOKEN: ${{ github.token }}
          NOW: ${{ inputs.now }}
```

- [ ] **Step 4: README e rimozione della prova**

`README.md`:

```markdown
# treni-fara

Avvisi privati sui regionali Fara Sabina ↔ Roma Tiburtina. Nei giorni feriali, ogni 10 minuti nelle fasce
(mattina 06:00–09:00 per le partenze 06:30–09:00 da Fara, pomeriggio 16:00–18:30 per le partenze
16:30–18:30 da Tiburtina), il workflow `check` legge Viaggiatreno e, se un treno ha ritardo ≥ 10' o è
soppresso, apre una issue `🚆 AAAA-MM-GG fascia`. Ogni variazione di almeno 5' (in peggio o in meglio)
diventa un commento; a fine fascia la issue si chiude. Le notifiche sono le mail/push standard di GitHub.

Un run **fallito** vuol dire che il controllo non vede i treni (Viaggiatreno giù o bloccato), non che c'è un ritardo.

La logica sta in `src/core/trains.js` del repo pubblico `Springfield33/MoovitWebAppCustom`, che il workflow
scarica in `bus/`. In locale `bus/` è una junction verso quel repo:

    New-Item -ItemType Junction -Path bus -Target ..\MoovitWebAppCustom
    npm test

Prova manuale: *Actions → check → Run workflow*, con `now` per simulare un orario.
```

```bash
git rm .github/workflows/probe.yml
git add notify.mjs .github/workflows/check.yml README.md
git commit -m "feat: workflow di controllo treni e notifiche via issue

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push
```

- [ ] **Step 5: Prova end-to-end**

Il repo bus con `trains.js` deve essere già su `main` (Task 7). Chiedere all'utente di lanciare *Actions → check → Run workflow*:
1. con `now` = ora corrente se si è in fascia, altrimenti `now` vuoto → atteso run verde con `fuori fascia`, `nessun ritardo` oppure `aperta #N`;
2. con `now` = un orario dentro la fascia di oggi (es. `2026-MM-GGT16:20:00+02:00` / `+01:00` d'inverno) **solo se** è ancora prima di quell'ora: il tabellone di un orario passato è vuoto, quindi atteso `nessun ritardo`.

Non c'è un modo affidabile di forzare un ritardo vero. L'apertura della issue è coperta dai test (Task 9); la verifica reale avviene al primo ritardo effettivo. Chiedere all'utente di segnalare la prima issue ricevuta, o la sua assenza in un giorno con ritardi noti.

- [ ] **Step 6: Aggiornare la memoria**

Aggiornare `bus-roma-scriptable.md` nella memoria (o crearne una nuova `treni-fara.md` e collegarla): repo privato `Springfield33/treni-fara`, junction `bus/`, verifiche di fattibilità superate, eventuali punti rimandati (significato dei valori di `provvedimento`, destinazioni da aggiungere).
