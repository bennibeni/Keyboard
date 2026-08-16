import normalizeMusicSeqToCanonical from "./normalizeMusicSeqToCanonical";

// SONG_CATALOG: solo metadati leggeri caricati all'avvio.
// Il campo `load` è un thunk che importa il modulo del brano on-demand,
// evitando di mettere ~1MB di dati JSON nel bundle iniziale della pagina.
// Next.js code-splits automaticamente i dynamic import() in chunk separati.
export const SONG_CATALOG = [
  {
    id: "canon-full",
    label: "Canon in D - Full",
    load: () =>
      import("../songs/canon-in-d_music-seq").then((m) =>
        normalizeMusicSeqToCanonical(m.json),
      ),
  },
  {
    id: "take-five",
    label: "Take Five - Dave Brubeck Quartet",
    load: () =>
      import("../songs/take-five-dave-brubeck").then((m) =>
        normalizeMusicSeqToCanonical(m.json),
      ),
  },
  {
    id: "progressione-01",
    label: "Progressione I - bVI - iv - V - 01",
    load: () =>
      import("../songs/progressione-i-bVI-iv-V-01.canonical").then((m) =>
        normalizeMusicSeqToCanonical(m.json),
      ),
  },
  {
    id: "progressione-02",
    label: "Progressione I - bVI - iv - V - 02",
    load: () =>
      import("../songs/progressione-i-bVI-iv-V-02.canonical").then((m) =>
        normalizeMusicSeqToCanonical(m.json),
      ),
  },
  {
    id: "progressione-03",
    label: "Progressione I - bVI - iv - V - 03",
    load: () =>
      import("../songs/progressione-i-bVI-iv-V-03.canonical").then((m) =>
        normalizeMusicSeqToCanonical(m.json),
      ),
  },
  {
    id: "progressione-04",
    label: "Progressione I - bVI - iv - V - 04",
    load: () =>
      import("../songs/progressione-i-bVI-iv-V-04.canonical").then((m) =>
        normalizeMusicSeqToCanonical(m.json),
      ),
  },
  {
    id: "someone-like-you",
    label: "Someone Like You - Easy Piano",
    load: () =>
      import("../songs/someone-like-you-easy-piano.canonical").then((m) =>
        normalizeMusicSeqToCanonical(m.json),
      ),
  },
  {
    id: "passacaglia-canonical",
    label: "Passacaglia - Johan Halvorsen",
    load: () =>
      import("../songs/passacaglia-canonical").then((m) =>
        normalizeMusicSeqToCanonical(m.json),
      ),
  },
  {
    id: "amazing-grace",
    label: "Amazing Grace",
    load: () =>
      import("../songs/amazing-grace").then((m) =>
        normalizeMusicSeqToCanonical(m.json),
      ),
  },
  {
    id: "lucky-man-vintage-moog-pro",
    label: "Lucky Man - Vintage Moog Pro",
    load: () =>
      import("../songs/lucky-man-vintage-moog-pro").then((m) =>
        normalizeMusicSeqToCanonical(m.json),
      ),
  },
  {
    id: "highway-star",
    label: "Highway Star - Organ Solo",
    load: () =>
      import("../songs/highway-star").then((m) =>
        normalizeMusicSeqToCanonical(m.json),
      ),
  },
  {
    id: "child-in-time",
    label: "Child in Time",
    load: () =>
      import("../songs/child-in-time").then((m) =>
        normalizeMusicSeqToCanonical(m.json),
      ),
  },
  {
    id: "k545-movement-1",
    label: "Mozart K.545 – Movement 1",
    load: () =>
      import("../songs/k545-movement-1").then((m) =>
        normalizeMusicSeqToCanonical(m.json),
      ),
  },
  {
    id: "k545-movement-2",
    label: "Mozart K.545 – Movement 2",
    load: () =>
      import("../songs/k545-movement-2").then((m) =>
        normalizeMusicSeqToCanonical(m.json),
      ),
  },
  {
    id: "k545-movement-3",
    label: "Mozart K.545 – Movement 3",
    load: () =>
      import("../songs/k545-movement-3").then((m) =>
        normalizeMusicSeqToCanonical(m.json),
      ),
  },
];

export const DEFAULT_SONG_ID = SONG_CATALOG[0].id;
