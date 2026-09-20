// Tonalità: da armatura di chiave (fifths + mode) a {tonic, mode}, e
// riconoscimento del modo quando MusicXML non lo dichiara.

const MAJOR_TONICS = ["Cb", "Gb", "Db", "Ab", "Eb", "Bb", "F", "C", "G", "D", "A", "E", "B", "F#", "C#"];
const MINOR_TONICS = ["Ab", "Eb", "Bb", "F", "C", "G", "D", "A", "E", "B", "F#", "C#", "G#", "D#", "A#"];
// Distanza (in semitoni sopra la tonica maggiore) dei modi ecclesiastici.
const MODE_OFFSET = { ionian: 0, dorian: 2, phrygian: 4, lydian: 5, mixolydian: 7, aeolian: 9, locrian: 11 };
const PC_NAMES_SHARP = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const PC_NAMES_FLAT = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

export function tonicFromFifths(fifths, mode) {
  const f = Math.max(-7, Math.min(7, Math.round(fifths)));
  const m = mode ?? "major";
  if (m === "major" || m === "ionian") return MAJOR_TONICS[f + 7];
  if (m === "minor" || m === "aeolian") return MINOR_TONICS[f + 7];
  if (m in MODE_OFFSET) {
    const majorTonic = MAJOR_TONICS[f + 7];
    const pc = pitchClassOf(majorTonic);
    const target = (pc + MODE_OFFSET[m]) % 12;
    return (f >= 0 ? PC_NAMES_SHARP : PC_NAMES_FLAT)[target];
  }
  return MAJOR_TONICS[f + 7]; // "none" e modi sconosciuti
}

function pitchClassOf(name) {
  const base = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[name[0]];
  const acc = name.endsWith("#") ? 1 : name.endsWith("b") ? -1 : 0;
  return (base + acc + 12) % 12;
}

// Profili di Krumhansl-Kessler.
const KK_MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const KK_MINOR = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

function correlation(hist, profile, tonicPc) {
  const n = 12;
  const a = hist;
  const b = Array.from({ length: n }, (_, k) => profile[(k - tonicPc + 12) % 12]);
  const ma = a.reduce((s, x) => s + x, 0) / n;
  const mb = b.reduce((s, x) => s + x, 0) / n;
  let num = 0;
  let da = 0;
  let db = 0;
  for (let k = 0; k < n; k += 1) {
    num += (a[k] - ma) * (b[k] - mb);
    da += (a[k] - ma) ** 2;
    db += (b[k] - mb) ** 2;
  }
  return da > 0 && db > 0 ? num / Math.sqrt(da * db) : 0;
}

// Quando <mode> manca, l'armatura lascia due candidati: la maggiore e la
// sua relativa minore. Si sceglie confrontando l'istogramma delle altezze
// (pesato per durata) con i profili Krumhansl-Kessler: con due soli
// candidati il risultato è molto più stabile del key-finding a 24 tonalità.
export function inferMode(fifths, pitchClassHistogram) {
  const majorTonic = tonicFromFifths(fifths, "major");
  const minorTonic = tonicFromFifths(fifths, "minor");
  const rMajor = correlation(pitchClassHistogram, KK_MAJOR, pitchClassOf(majorTonic));
  const rMinor = correlation(pitchClassHistogram, KK_MINOR, pitchClassOf(minorTonic));
  const isMajor = rMajor >= rMinor;
  return {
    mode: isMajor ? "major" : "minor",
    tonic: isMajor ? majorTonic : minorTonic,
    confidence: Math.round(Math.max(rMajor, rMinor) * 1000) / 1000,
  };
}
