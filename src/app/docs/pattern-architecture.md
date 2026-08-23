# Pattern architetturali — Keyboard (R06)

Questo documento descrive tre catene di design pattern introdotte nell'app
`Keyboard` (route R06 del monorepo), ciascuna isolata in file dedicati e
segnalata nel codice con un commento `// PATTERN: ...`. Le tre catene sono
indipendenti tra loro ma si compongono: il Mediator orchestra le feature a
livello di pagina, il Proxy si frappone tra la logica applicativa e i
motori audio, il Container/View separa la logica dalla presentazione
dentro la feature `keyboard`.

---

## 1. Catena Mediator — orchestrazione tra feature

**Pattern:** Mediator (GoF)

**File coinvolti:**
- `app/Keyboard/mediator/useKeyboardMediator.js` (il Mediator)
- `app/page.js` (la View che lo consuma)

### Problema che risolve

Prima del refactor, `page.js` conteneva sia tutto lo stato cross-feature
(brano selezionato, import MIDI, bpm, metronomo, loop, scale, routing)
sia le regole di coordinamento tra le feature (es. "selezionare un brano
dal catalogo deve azzerare un import MIDI attivo", e viceversa). Le
feature stesse (`song-selector`, `midi-import`, `transport`,
`playback-engine`, `metronome`, `tempo`, `keyboard`, `settings`) non si
conoscono a vicenda: ognuna espone solo callback opache (`onChange`,
`onImported`, ecc.).

### Ruoli

- **Colleghi**: ogni feature folder sotto `app/Keyboard/features/*`.
  Nessuno di questi sa che le altre feature esistono.
- **Mediator**: `useKeyboardMediator.js`. È l'unico punto che conosce le
  regole di reazione tra colleghi (es. `handleSelectSong` azzera
  l'import attivo; `activeSeq`/`activeSongId` decidono se il brano
  attivo viene dal catalogo o da un import). Espone alla View un unico
  view-model raggruppato per pannello (`vm.songSelector`,
  `vm.transportBar`, `vm.keyboardRoll`, ecc.).
- **View**: `page.js`. Chiama `useKeyboardMediator()` una sola volta e
  distribuisce `vm.<sezione>` ai vari `<Panel>`. Non prende mai
  decisioni di coordinamento in autonomia: se due feature devono
  reagire tra loro, quella regola va aggiunta al Mediator, mai a
  `page.js`.

### Flusso

```
page.js
  └─ useKeyboardMediator()
       ├─ useSongSelector()        (song-library)
       ├─ useDemoTransport()       (feature: transport)
       ├─ usePlaySong({...})       (feature: playback-engine)
       ├─ useMetronomeClick({...}) (feature: metronome)
       ├─ useSongBpmSync(...)      (shared/hooks)
       └─ ritorna { songSelector, midiImport, transportBar,
                     nowPlaying, keyboardRoll, tempo,
                     metronome, settings }
page.js renderizza <Panel><XyzPanel {...vm.xyz} /></Panel> per ognuna
```

---

## 2. Catena Proxy — defaulting davanti ai motori audio

**Pattern:** Proxy (con defaulting), sullo stesso modello di
`PianoKeyboardProxy.js` nella route R15.

**File coinvolti:**
- `app/Keyboard/features/keyboard/runtime/keyboardEngineProxy.js`
  (Proxy per l'input dal vivo — tasti premuti con mouse/tastiera)
- `app/Keyboard/features/keyboard/hooks/usePlayableKeyboard.js`
  (chiamante)
- `app/Keyboard/features/playback-engine/runtime/playbackEngineProxy.js`
  (Proxy per la riproduzione di un brano)
- `app/Keyboard/features/playback-engine/hooks/usePlaySong.js`
  (chiamante)
- `app/Keyboard/settings.js` (sorgente dei valori di default)

### Problema che risolve

I motori audio grezzi (`createSampleEngine`/`createSynthEngine` da
`@app/audio-engine`, avvolti da `keyboardInstrument.js` e
`pianoEngine.js`) non hanno alcuna opinione su cosa sia un buon default
per un parametro applicativo (velocity di un tasto premuto dal vivo,
tempo di rilascio, gain generale). Prima del refactor questi numeri
erano incollati nei chiamanti (`0.85`, `35`, `45`, `140` in
`usePlayableKeyboard.js`; `SETTINGS.masterGain.value` importato
direttamente in `usePlaySong.js`), e un gap di interfaccia
(`preload` assente sul synth) doveva essere gestito dal chiamante con un
`typeof engine.preload === "function"`.

### Ruoli

- **Vero soggetto**: l'istanza del motore audio (sample engine o synth
  engine), ottenuta rispettivamente da `getKeyboardInstrument()` e da
  `getEngineForRoute(route)`.
- **Proxy**: `keyboardEngineProxy.js` e `playbackEngineProxy.js`.
  Entrambi:
  1. Inoltrano ogni chiamata al motore reale, senza reimplementare
     logica audio.
  2. Iniettano i default mancanti leggendoli da `SETTINGS`
     (`keyVelocity`, `keyReleaseMs`, `keyLateVoiceGraceMs`,
     `keyLateVoiceReleaseMs` per il primo; `masterGain` per il
     secondo), permettendo comunque un override per chiamata.
  3. Normalizzano piccoli gap di interfaccia (`preload` sempre
     disponibile come no-op sul percorso synth, `noteOffLate` per la
     nota "in ritardo" quando il campione era ancora in decodifica).
- **Chiamante**: `usePlayableKeyboard.js` e `usePlaySong.js`. Non
  conoscono più i valori numerici di default né i dettagli
  dell'engine sottostante — chiamano `engine.noteOn(midi)`,
  `engine.noteOff(voiceId)`, `engine.preload(midis)`, ecc.

### Nota sul DI escape hatch

`usePlaySong.js` accetta un parametro `engine` (`engineOverride`) usato
nei test per iniettare un motore alternativo. Quel percorso **bypassa
il Proxy deliberatamente**: un motore di test riceve i valori così come
vengono passati, senza defaulting. Per questo `usePlaySong.js` continua
a passare `SETTINGS.masterGain.value` esplicitamente a
`setMasterGain(...)` invece di affidarsi al default del Proxy — se
l'argomento fosse omesso, un motore di test grezzo (non avvolto dal
Proxy) riceverebbe `undefined` e finirebbe a volume zero.

### Flusso (esempio: tasto premuto dal vivo)

```
usePlayableKeyboard.js
  press(midi, token)
    └─ engineRef.current.noteOn(midi)      // Proxy
         ├─ default velocity da SETTINGS.keyVelocity
         └─ inoltra a engine.playNote(midi, {velocity})  // motore reale
```

```
usePlaySong.js
  effect di riproduzione
    └─ engine.preload(uniqueMidis)         // Proxy
         └─ se synth: no-op, altrimenti inoltra a engine.preload(midis)
```

---

## 3. Catena Container/View — separazione logica/presentazione

**Pattern:** Container/Wrapper component

**File coinvolti:**
- `app/Keyboard/features/keyboard/components/KeyboardPanel.js`
  (Container)
- `app/Keyboard/features/keyboard/components/KeyboardPanelView.js`
  (View, "dumb")
- `app/Keyboard/features/keyboard/components/KeyboardRollSection.js`
  (Container)
- `app/Keyboard/features/keyboard/components/KeyboardRollSectionView.js`
  (View, "dumb")

### Problema che risolve

`KeyboardPanel.js` e `KeyboardRollSection.js` mischiavano, nello stesso
file, hook con effetti collaterali (input dal vivo, sottoscrizione al
brano in riproduzione, calcolo di geometria/viewport) e markup di
presentazione. Questo rendeva impossibile riutilizzare o testare la
sola UI senza un `AudioContext` o uno store attivo.

### Ruoli

- **Container** (`KeyboardPanel.js`, `KeyboardRollSection.js`): possiede
  tutta la logica "smart" — hook con stato/effetti
  (`usePlayableKeyboard`, `useKeyboardPanelVm`, `useNowPlaying`),
  derivazioni (`combinedActiveMidis`, `beatsPerBar`,
  `buildNoteTimeline`), e la risoluzione del render-prop `children` in
  un nodo `overlay` semplice. Passa tutto alla View come props piatte.
- **View** (`KeyboardPanelView.js`, `KeyboardRollSectionView.js`):
  nessun hook di logica (solo `memo` per il rendering). Riceve valori
  e callback già pronti e produce solo JSX — markup diretto nel primo
  caso, composizione di altri componenti (`KeyboardPanel` +
  `FallingNotesPanel`) nel secondo.

### Flusso

```
KeyboardRollSection.js (Container)
  ├─ useNowPlaying()              → currentBeat, activeMidis
  ├─ buildNoteTimeline(events)    → timeline
  ├─ resolveTimeSignatureAt(...)  → beatsPerBar
  └─ <KeyboardRollSectionView activeMidis timeline currentBeat
                               beatsPerBar startMidi endMidi
                               keyW whiteH blackW blackH />

KeyboardRollSectionView.js (View)
  └─ <KeyboardPanel activeMidis startMidi endMidi keyW whiteH
                     blackW blackH>
       {(geo) => <FallingNotesPanel timeline currentBeat
                                     beatsPerBar {...geo} />}
     </KeyboardPanel>

KeyboardPanel.js (Container)
  ├─ usePlayableKeyboard(...)     → press, release, activeMidis
  ├─ useKeyboardPanelVm(...)      → geometria, viewport, activeSet
  ├─ risolve children(geo) → overlay
  └─ <KeyboardPanelView keyCount whites blacks activeSet
                         current* labelSize overlay viewportRef
                         onPress onRelease />

KeyboardPanelView.js (View)
  └─ markup: sezione, tasti bianchi/neri (WhiteKey/BlackKey), overlay
```

### Nota sull'API pubblica

In entrambi i casi l'interfaccia pubblica del componente (props
accettate, comportamento del render-prop `children`) è rimasta
identica a prima dello split — nessun consumatore esterno
(`page.js`, `index.js` della feature) ha dovuto essere modificato.

---

## Tabella riassuntiva

| Catena | File "smart" / vero soggetto | File "proxy" / "container" | File "view" / chiamante finale |
|---|---|---|---|
| Mediator | feature folders (colleghi) | `useKeyboardMediator.js` | `page.js` |
| Proxy (input live) | `keyboardInstrument.js` (sample engine) | `keyboardEngineProxy.js` | `usePlayableKeyboard.js` |
| Proxy (playback) | `pianoEngine.js` (piano/synth) | `playbackEngineProxy.js` | `usePlaySong.js` |
| Container/View (tastiera) | `useKeyboardPanelVm.js`, `usePlayableKeyboard.js` | `KeyboardPanel.js` | `KeyboardPanelView.js` |
| Container/View (roll) | `useNowPlaying.js`, `buildNoteTimeline.js` | `KeyboardRollSection.js` | `KeyboardRollSectionView.js` |
