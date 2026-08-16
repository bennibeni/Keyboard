# audio-engine

Uno standalone Web Audio engine, **non legato a nessuna cartella Rxx**.
Pensato per essere importato/copiato in futuro da R02/R03/R04 (o altre app)
al posto di reinventarlo ogni volta — R03 e R04 hanno ciascuno la propria
copia minima nata come soluzione rapida e specifica. Questo è il passo
verso qualcosa di condiviso e più robusto.

## Cosa c'è

Due engine paralleli, stessa forma di API (`playNote`/`stopNote`/`stopAll`/
`getActiveVoices`/`setMasterGain`/`dispose`), scelta esplicita del
chiamante — nessun routing/fallback automatico tra i due (ancora):

### `createSynthEngine` — oscillatore

- Sintetizzatore polifonico (sine/square/sawtooth/triangle)
- Tracking reale delle voci attive: ogni nota restituisce un `voiceId` che
  puoi fermare in anticipo
- Voice stealing quando si supera `maxVoices`
- Note a durata fissa o "held" (nessuna durata, resta accesa finché non la
  fermi tu)
- `playNote()` è **sincrono**

### `createSampleEngine` — campioni `.wav`

- Risolve il campione più vicino per ogni nota MIDI: prova il pitch esatto,
  poi 4 ancore per ottava (C, D#, F#, A — schema sparso standard), poi le
  ottave vicine; il resto è pitch-shift via `playbackRate`
- Cache sia della risoluzione URL (quali file esistono davvero, via
  HEAD/GET) sia dei buffer decodificati — ogni pitch viene scaricato e
  decodificato una sola volta per sessione
- `preload(midis)` per scaldare la cache prima che parta la riproduzione
  (altrimenti la primissima nota di ogni pitch paga un vero round-trip di
  rete)
- `playNote()` è **asincrono** (`await` consigliato per restare sincronizzati
  con eventi/accordi) e lancia un errore se non trova nessun campione
  riproducibile per quella nota
- `now()` espone l'orologio dell'`AudioContext` senza esporre il contesto
  stesso — usalo per sincronizzare più note allo stesso istante futuro
  (`startAt: engine.now() + delaySec`) invece di lasciare che ognuna legga
  `ctx.currentTime` autonomamente quando la propria risoluzione asincrona
  termina, cosa che su un accordo con più note può farle partire con
  qualche millisecondo di scarto l'una dall'altra
- Stessa logica di stealing/tracking/release di `createSynthEngine`

## Cosa NON fa (ancora)

- Nessun routing/fallback automatico tra sample e synth (quello che in R02
  è `resolvePlaybackRoute.js` + `usePlaybackEngine.js`) — se `playNote()`
  di `createSampleEngine` fallisce, la gestione dell'errore/fallback resta
  compito del chiamante
- Nessuna gestione di accordi/eventi a livello di brano (resta compito del
  chiamante, come già fa `usePlayCanonInD.js` in R04)

## API

```js
import { createSynthEngine, createSampleEngine } from "./audio-engine";

// Oscillatore
const synth = createSynthEngine({ waveform: "sine", maxVoices: 16 });
await synth.unlock(); // dentro un gesture handler dell'utente
const voiceId = synth.playNote(69, { durationMs: 400, velocity: 0.8 });
synth.setMasterGain(0.9);
synth.stopAll();
synth.dispose();

// Campioni
const piano = createSampleEngine({
  sampleBasePath: "/samples/piano",
  ext: "wav",
  maxVoices: 32,
});
await piano.unlock();
await piano.preload([60, 64, 67]); // scalda la cache prima di suonare
const id = await piano.playNote(64, { durationMs: 600, velocity: 0.9 });
piano.stopNote(id);
```

## Note di design

- `context.js` usa un singleton su `window` (chiave `__audioEngineSharedCtx`),
  non una variabile a livello di modulo — resta un vero singleton anche se
  il modulo finisse caricato da più chunk di bundle diversi. Sia
  `createSynthEngine` sia `createSampleEngine` condividono lo stesso
  `AudioContext` attraverso questo singleton, anche se creati come istanze
  separate.
- Naming dei file campione: stessa convenzione di R02 (`{sampleBasePath}/
  {NotaConDiesis}.{ext}`, es. `C4.wav`, `Cs4.wav` — il diesis diventa `s`
  perché non è un carattere valido nei nomi file), quindi compatibile con
  sample set esistenti senza doverli rinominare.
- Nessuna dipendenza da `shared/music/math.js` o da altro codice delle
  cartelle Rxx — è completamente autonomo.
