import normalizeMusicSeqToCanonical from "./normalizeMusicSeqToCanonical";

// SONG_CATALOG: solo metadati leggeri caricati all'avvio.
// Il campo `load` è un thunk che importa il modulo del brano on-demand,
// evitando di mettere ~1MB di dati JSON nel bundle iniziale della pagina.
// Next.js code-splits automaticamente i dynamic import() in chunk separati.
//
// `key` è una DUPLICAZIONE leggera di song.meta.key (vedi i singoli file
// in songs/) - lo stesso dato esiste anche dentro il seq caricato
// pigramente, ma qui serve un'istantanea immediata, disponibile PRIMA di
// caricare il brano, così il selettore di tonalità in SongSelectorPanel.js
// sa subito se la trasposizione è disponibile per il brano scelto senza
// dover aspettare un caricamento. Se cambi la tonalità dichiarata in un
// file di songs/, aggiorna anche qui - non c'è un controllo automatico di
// coerenza tra le due copie.
export const SONG_CATALOG = [
  {
    id: "canon-full",
    label: "Canon in D - Full",
    key: { tonic: "D", mode: "major" },
    load: () =>
      import("../songs/canon-in-d_music-seq").then((m) =>
        normalizeMusicSeqToCanonical(m.json),
      ),
  },
  {
    id: "take-five",
    label: "Take Five - Dave Brubeck Quartet",
    key: { tonic: "E", mode: "minor" },
    load: () =>
      import("../songs/take-five-dave-brubeck").then((m) =>
        normalizeMusicSeqToCanonical(m.json),
      ),
  },
  {
    id: "progressione-01",
    label: "Progressione I - bVI - iv - V - 01",
    key: { tonic: "C", mode: "minor" },
    load: () =>
      import("../songs/progressione-i-bVI-iv-V-01.canonical").then((m) =>
        normalizeMusicSeqToCanonical(m.json),
      ),
  },
  {
    id: "progressione-02",
    label: "Progressione I - bVI - iv - V - 02",
    key: { tonic: "C", mode: "minor" },
    load: () =>
      import("../songs/progressione-i-bVI-iv-V-02.canonical").then((m) =>
        normalizeMusicSeqToCanonical(m.json),
      ),
  },
  {
    id: "progressione-03",
    label: "Progressione I - bVI - iv - V - 03",
    key: { tonic: "C", mode: "minor" },
    load: () =>
      import("../songs/progressione-i-bVI-iv-V-03.canonical").then((m) =>
        normalizeMusicSeqToCanonical(m.json),
      ),
  },
  {
    id: "progressione-04",
    label: "Progressione I - bVI - iv - V - 04",
    key: { tonic: "C", mode: "minor" },
    load: () =>
      import("../songs/progressione-i-bVI-iv-V-04.canonical").then((m) =>
        normalizeMusicSeqToCanonical(m.json),
      ),
  },
  {
    id: "someone-like-you",
    label: "Someone Like You - Easy Piano",
    key: { tonic: "A", mode: "major" },
    load: () =>
      import("../songs/someone-like-you-easy-piano.canonical").then((m) =>
        normalizeMusicSeqToCanonical(m.json),
      ),
  },
  {
    id: "passacaglia-canonical",
    label: "Passacaglia - Johan Halvorsen",
    key: { tonic: "A", mode: "minor" },
    load: () =>
      import("../songs/passacaglia-canonical").then((m) =>
        normalizeMusicSeqToCanonical(m.json),
      ),
  },
  {
    id: "amazing-grace",
    label: "Amazing Grace",
    key: { tonic: "G", mode: "major" },
    load: () =>
      import("../songs/amazing-grace").then((m) =>
        normalizeMusicSeqToCanonical(m.json),
      ),
  },
  {
    id: "lucky-man-vintage-moog-pro",
    label: "Lucky Man - Vintage Moog Pro",
    // Tonalità non determinabile con sufficiente confidenza (assolo Moog
    // improvvisato, correlazione Krumhansl-Schmuckler troppo ambigua tra
    // Re minore e Re maggiore) - vedi transposeSeq.js: senza un tonic
    // dichiarato, il selettore di tonalità resta disabilitato per questo
    // brano.
    key: null,
    load: () =>
      import("../songs/lucky-man-vintage-moog-pro").then((m) =>
        normalizeMusicSeqToCanonical(m.json),
      ),
  },
  {
    id: "highway-star",
    label: "Highway Star - Organ Solo",
    key: { tonic: "D", mode: "minor" },
    load: () =>
      import("../songs/highway-star").then((m) =>
        normalizeMusicSeqToCanonical(m.json),
      ),
  },
  {
    id: "child-in-time",
    label: "Child in Time",
    key: { tonic: "A", mode: "minor" },
    load: () =>
      import("../songs/child-in-time").then((m) =>
        normalizeMusicSeqToCanonical(m.json),
      ),
  },
  {
    id: "k545-movement-1",
    label: "Mozart K.545 – Movement 1",
    key: { tonic: "C", mode: "major" },
    load: () =>
      import("../songs/k545-movement-1").then((m) =>
        normalizeMusicSeqToCanonical(m.json),
      ),
  },
  {
    id: "k545-movement-2",
    label: "Mozart K.545 – Movement 2",
    key: { tonic: "G", mode: "major" },
    load: () =>
      import("../songs/k545-movement-2").then((m) =>
        normalizeMusicSeqToCanonical(m.json),
      ),
  },
  {
    id: "k545-movement-3",
    label: "Mozart K.545 – Movement 3",
    key: { tonic: "C", mode: "major" },
    load: () =>
      import("../songs/k545-movement-3").then((m) =>
        normalizeMusicSeqToCanonical(m.json),
      ),
  },
];

export const DEFAULT_SONG_ID = SONG_CATALOG[0].id;
