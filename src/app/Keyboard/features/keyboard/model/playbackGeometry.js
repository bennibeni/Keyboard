export const START_MIDI = 24;
export const END_MIDI = 96;
export const KEY_W = 28;
export const WHITE_H = 148;
export const BLACK_W = 18;
export const BLACK_H = 92;

// Larghezza naturale del pannello "Keyboard + roll" (tasti bianchi + padding
// lg:p-6 + bordo di KeyboardPanelView): è la larghezza di riferimento della
// colonna di tutti i pannelli (vedi Shell in shared/ui/playbackScreenUi.js).
const BLACK_PCS = new Set([1, 3, 6, 8, 10]);
let whiteKeys = 0;
for (let m = START_MIDI; m <= END_MIDI; m += 1) if (!BLACK_PCS.has(m % 12)) whiteKeys += 1;
export const KEYBOARD_PANEL_WIDTH = whiteKeys * KEY_W + 2 * 24 + 2;
