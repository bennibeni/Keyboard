# Pattern preesistenti — Keyboard (R06)

Questo documento cataloga i design pattern **già presenti** nel codice di
`Keyboard` prima degli interventi descritti in `pattern-architecture.md`.
Nessuno dei file qui elencati è stato modificato: si tratta di una mappa
descrittiva, non di un refactor.

---

## 1. Adapter + Factory/Singleton — motore di riproduzione

**File:** `app/Keyboard/features/playback-engine/runtime/pianoEngine.js`

`getEngineForRoute(route)` restituisce o il piano sample-engine o un
synth-engine (uno per waveform), ma sempre con la stessa forma:
`{unlock, now, setMasterGain, playNote, stopNote, stopAll, dispose}`
(più `preload`, presente solo sul sample-engine). Il chiamante
(`usePlaySong.js`, oggi tramite `playbackEngineProxy.js`) non deve mai
sapere quale dei due motori sta effettivamente suonando.

- **Adapter**: l'unificazione di interfaccia tra due implementazioni
  eterogenee (buffer audio campionati vs. oscillatore sintetico).
- **Factory + Singleton**: `getPianoEngineSingleton()` crea il piano
  engine una sola volta per l'intera vita dell'app;
  `getSynthEngineSingleton(waveform)` fa lo stesso ma con una mappa
  *una istanza per waveform* — due brani che usano lo stesso timbro
  synth condividono lo stesso motore invece di crearne uno a testa.

```js
export function getEngineForRoute(route) {
  if (route?.engine === "synth") return getSynthEngineSingleton(route.waveform);
  return getPianoEngineSingleton();
}
```

Questo è il layer che il Proxy descritto in `pattern-architecture.md`
(`playbackEngineProxy.js`) avvolge, senza sostituirlo.

---

## 2. Strategy / Router dichiarativo — scelta del motore per brano

**File:**
`app/Keyboard/features/playback-engine/model/resolveEngineRoute.js`

Decide, per un dato brano, se instradarlo su piano-campionato o su
synth, con due meccanismi indipendenti e sovrapponibili:

1. **Automatico**: match testuale su parole chiave nei metadati del
   brano (`moog`, `synth`, `organ`, `lead`, `portamento`, `glide`, …).
2. **Override manuale**: la mappa `ENGINE_OVERRIDES`, indicizzata per
   id di catalogo, che forza la scelta in entrambe le direzioni
   (anche per forzare un brano "sospetto synth" a suonare piano).

Un terzo interruttore (`routingEnabled`, da `SETTINGS.engineRoutingEnabled`)
disattiva l'intero meccanismo: tutti i brani suonano piano samples,
usato per A/B testing "synth vs. piano" senza toccare il codice.

Questo è un caso di **Strategy** reso puramente dichiarativo: la
"strategia" non è un oggetto con un metodo `execute()`, ma il risultato
di una funzione pura (`resolveEngineRoute(seq, {songId, routingEnabled})`)
che il chiamante consuma come dato, non come comportamento da invocare.

---

## 3. Observer (pub/sub) — building block condiviso, con un'eccezione

**File:** `app/Keyboard/shared/state/createPubSubStore.js`

Store minimale, compatibile con l'hook nativo React
`useSyncExternalStore` (`subscribe(fn)` + `getSnapshot()`), senza alcuna
conoscenza di dominio: chi lo usa decide cosa contiene lo snapshot.

**Chi lo riusa:**
- `MetronomeService.js` (vedi punto 4) — lo istanzia con
  `createPubSubStore({beatsCount, beatIdx, kinds, running})` e lo
  aggiorna con `_emit()`.
- `NowPlayingStore.js` (`app/Keyboard/features/playback-engine/runtime/NowPlayingStore.js`)
  — **consolidato** su `createPubSubStore` (era in precedenza
  un'implementazione duplicata a mano, vedi nota storica sotto).

### Nota storica

Fino a una revisione precedente, `NowPlayingStore.js` implementava **la
stessa forma a mano** (una classe con `listeners = new Set()`,
`subscribe`, `getSnapshot`, e un metodo che notificava i listener)
invece di riusare `createPubSubStore`. Era lo stesso pattern Observer
applicato due volte con due implementazioni distinte. È stato
consolidato: oggi `NowPlayingStore` delega a `createPubSubStore`
internamente, mantenendo invariata la sua API pubblica
(`subscribe`, `getSnapshot`, `commitStep`, `reset`) — nessun
consumatore (`useNowPlaying.js`, `usePlaySong.js`,
`useMetronomeClick.js`) ha dovuto essere modificato.

---

## 4. Facade + Mediator locale — il metronomo

**File:** `app/Keyboard/features/metronome/runtime/MetronomeService.js`

La classe `MetronomeService` orchestra tre collaboratori che non si
parlano mai direttamente tra loro:
- `createSynthEngine` (il click sintetico, forma d'onda quadra)
- `createWavClickEngine` (i campioni WAV per il click, se disponibili)
- `clickSounds.js` (mapping accento → velocity/durata/nota)
- `createPubSubStore` (per pubblicare lo stato verso la UI)

Espone un'API minimale (`enable`, `disable`, `tickBeat`, `setGain`,
`reset`, `now`) dietro cui nasconde la complessità di tutti questi
pezzi — un **Facade**. Al tempo stesso gioca un ruolo di **Mediator in
piccolo**, dato che è l'unico punto che sa come far reagire i vari
collaboratori a un singolo evento (`tickBeat` decide se suonare il wav
o il click sintetico, a seconda di cosa `wavEngine.play(...)`
riesce a fare, e in entrambi i casi aggiorna lo store).

Singleton anche qui: `getMetronomeService()` ne mantiene una sola
istanza per l'intera app.

---

## 5. State machine esplicita (FSM) — stato del transport

**File:**
`app/Keyboard/features/transport/hooks/useTransportController.js`

Stati: `idle | playing | paused | ready | error`.
Eventi: `PLAY | PAUSE | RESUME | STOP | FINISH | FAIL`.

La tabella di transizione è un oggetto dati puro:

```js
const FSM = {
  idle:    { PLAY: "playing" },
  playing: { PAUSE: "paused", STOP: "idle", FINISH: "ready", FAIL: "error" },
  paused:  { RESUME: "playing", STOP: "idle", FINISH: "ready", FAIL: "error" },
  ready:   { PLAY: "playing", STOP: "idle" },
  error:   { PLAY: "playing", STOP: "idle" },
};
```

Il reducer di `useReducer` non fa che consultare questa tabella,
rendendo esplicite (e facilmente verificabili a colpo d'occhio) tutte
le transizioni valide — a differenza di due `useState` tenuti
sincronizzati "a mano" (come nella versione precedente, secondo il
commento nel file stesso).

---

## 6. Singleton — motori e servizi condivisi

Ricorre più volte nell'app, sempre con la stessa forma
(`let _instance = null; function getX() { if (!_instance) ...; return _instance; }`):

| Singleton | File | Cosa condivide |
|---|---|---|
| `getKeyboardInstrument()` | `features/keyboard/runtime/keyboardInstrument.js` | Il sample-engine per i tasti premuti dal vivo |
| `getPianoEngineSingleton()` | `features/playback-engine/runtime/pianoEngine.js` | Il sample-engine per la riproduzione di brani |
| `getSynthEngineSingleton(waveform)` | `features/playback-engine/runtime/pianoEngine.js` | Un synth-engine per waveform |
| `getMetronomeService()` | `features/metronome/runtime/MetronomeService.js` | Lo stato/orchestrazione del metronomo |
| `getNowPlayingStore()` | `features/playback-engine/runtime/NowPlayingStore.js` | Beat corrente + note attive del brano in riproduzione |

In tutti i casi la motivazione è la stessa: questi oggetti incapsulano
risorse costose o stato che deve essere condiviso da più componenti
React nello stesso momento (un `AudioContext`, un set di voci attive,
una sottoscrizione), quindi vivono per tutta la durata dell'app invece
che per il ciclo di vita di un singolo componente.

---

## Come si relaziona alle catene introdotte in questa sessione

| Pattern preesistente | Interagisce con... |
|---|---|
| Adapter/Factory (`pianoEngine.js`) | Avvolto da `playbackEngineProxy.js` (Proxy, vedi `pattern-architecture.md`) |
| Strategy/Router (`resolveEngineRoute.js`) | Consumato da `usePlaySong.js`, a monte del Proxy |
| Observer (`createPubSubStore.js`) | Riusato sia da `MetronomeService.js` sia da `NowPlayingStore.js` (dopo il consolidamento); il Mediator (`useKeyboardMediator.js`) non lo tocca direttamente, ma orchestra gli hook che ne consumano gli snapshot (`useMetronomeClick`, `useNowPlaying`) |
| Facade/Mediator locale (`MetronomeService.js`) | Chiamato da `useMetronomeClick`, a sua volta chiamato dal Mediator di pagina |
| FSM (`useTransportController.js`) | Alla base di `useDemoTransport`, esposto come `transportVm` dal Mediator di pagina |
| Singleton (vari) | Tutti i motori Singleton sono i "veri soggetti" avvolti dai due Proxy |
