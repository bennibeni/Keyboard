"use client";

import { memo, useMemo } from "react";
import { getPanelFrameProps } from "../../../shared/ui/panelSpecs";
import { PanelFrame } from "../../../shared/ui/playbackScreenUi";
import { useNowPlaying } from "../../playback-engine/hooks/useNowPlaying";
import {
  SPLIT_MIDI,
  activeNotesAt,
  buildSpelledTimeline,
  diatonicStep,
  noteLabel,
  spellMidi,
} from "../model/activeNotes";

const LINE = 10; // distanza tra le righe del pentagramma
const STEP = LINE / 2;
const OCTAVE = 7 * STEP;
const VIEW_W = 520; // larghezza logica del disegno: l'SVG si adatta al pannello
const FIRST_X = 76;
const MAX_GAP = 40;
const LINE_COLOR = "#536c76";
// Altezza FISSA del disegno: righe a y=40..80, al massimo 3 tagli addizionali
// sopra (y>=10) e sotto (y<=110). Le note più lontane si scrivono un'ottava
// (o due) più vicine con 8va/15ma o 8vb/15mb, così il pannello non cambia
// altezza e non sposta la tastiera sottostante.
const VIEW_TOP = -14;
const VIEW_H = 152;
const MIN_Y = 10;
const MAX_Y = 110;
const LABEL_Y = VIEW_TOP + VIEW_H - 6;

// Rigo: riga inferiore a y=80. Chiave di violino: Mi4 sulla riga inferiore;
// chiave di basso: Sol2.
const CLEFS = {
  treble: { glyph: "𝄞", glyphY: 83, glyphSize: 58, bottomStep: diatonicStep({ letter: "E", octave: 4 }), color: "#168ba7", label: "Violino" },
  bass: { glyph: "𝄢", glyphY: 70, glyphSize: 46, bottomStep: diatonicStep({ letter: "G", octave: 2 }), color: "#b55e13", label: "Basso" },
};

// Porta y dentro [MIN_Y, MAX_Y] spostando di ottave; ritorna anche l'indicazione.
function fitToStaff(y) {
  let shift = 0;
  while (y > MAX_Y + 0.1) { y -= OCTAVE; shift -= 1; }
  while (y < MIN_Y - 0.1) { y += OCTAVE; shift += 1; }
  const mark = shift === 0 ? null : shift === -1 ? "8vb" : shift === 1 ? "8va" : shift < 0 ? "15mb" : "15ma";
  // shift < 0: nota reale più bassa di quella scritta; > 0: più alta
  return { y, mark, below: shift < 0 };
}

function Staff({ clef, notes }) {
  const c = CLEFS[clef];
  const gap = notes.length > 0 ? Math.min(MAX_GAP, (VIEW_W - FIRST_X - 16) / notes.length) : MAX_GAP;
  const placed = notes.map((n, i) => {
    const sp = spellMidi(n.midi, n.spelling);
    const fitted = fitToStaff(80 - (diatonicStep(sp) - c.bottomStep) * STEP);
    return { ...n, sp, ...fitted, x: FIRST_X + 8 + i * gap, label: noteLabel(sp, sp.octave) };
  });
  const names = placed.map((p) => p.label);
  const small = gap < 30;

  return (
    <svg
      className="block h-auto w-full"
      viewBox={`0 ${VIEW_TOP} ${VIEW_W} ${VIEW_H}`}
      role="img"
      aria-label={`Chiave di ${c.label.toLowerCase()}: ${names.length ? names.join(", ") : "nessuna nota"}`}
    >
      {[40, 50, 60, 70, 80].map((y) => (
        <line key={y} x1="8" x2={VIEW_W - 8} y1={y} y2={y} stroke={LINE_COLOR} />
      ))}
      <text x="12" y={c.glyphY} fontSize={c.glyphSize} fontFamily="serif" fill="#1f2d33">
        {c.glyph}
      </text>
      {placed.map((p) => {
        const ledgers = [];
        for (let ly = 90; ly <= p.y + 0.1; ly += LINE) ledgers.push(ly);
        for (let ly = 30; ly >= p.y - 0.1; ly -= LINE) ledgers.push(ly);
        const acc = p.sp.alter > 0 ? "♯" : p.sp.alter < 0 ? "♭" : "";
        return (
          <g key={p.midi}>
            {ledgers.map((ly) => (
              <line key={ly} x1={p.x - 11} x2={p.x + 11} y1={ly} y2={ly} stroke={LINE_COLOR} />
            ))}
            {acc ? (
              <text x={p.x - 20} y={p.y + 5} fontSize="16" fill="#1f2d33">
                {acc}
              </text>
            ) : null}
            <ellipse cx={p.x} cy={p.y} rx="6.5" ry="4.6" transform={`rotate(-18 ${p.x} ${p.y})`} fill={c.color} />
            {p.mark ? (
              <text
                x={p.x}
                y={p.below ? p.y + 17 : p.y - 10}
                textAnchor="middle"
                fontSize="10"
                fontStyle="italic"
                fontWeight="700"
                fill="#1f2d33"
              >
                {p.mark}
              </text>
            ) : null}
            <text x={p.x} y={LABEL_Y} textAnchor="middle" fontSize={small ? 9 : 11} fill="#3f4f56">
              {p.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// Pentagrammi compatti con le note che suonano adesso (anche quelle tenute),
// divise per registro come in R25: basso sotto il Do4, violino dal Do4 incluso.
function ActiveStavesPanel({ events = [], isActive = false }) {
  const { tBeat } = useNowPlaying();
  const timeline = useMemo(() => buildSpelledTimeline(events), [events]);
  const notes = useMemo(
    () => (isActive ? activeNotesAt(timeline, tBeat) : []),
    [timeline, tBeat, isActive],
  );
  const treble = notes.filter((n) => n.midi >= SPLIT_MIDI);
  const bass = notes.filter((n) => n.midi < SPLIT_MIDI);

  return (
    <PanelFrame {...getPanelFrameProps("staves")} titleRight="Note attive">
      <div className="flex flex-col gap-1 rounded-2xl border border-white/70 bg-white/90 px-2 py-1 shadow-sm">
        <Staff clef="treble" notes={treble} />
        <Staff clef="bass" notes={bass} />
      </div>
    </PanelFrame>
  );
}

export default memo(ActiveStavesPanel);
