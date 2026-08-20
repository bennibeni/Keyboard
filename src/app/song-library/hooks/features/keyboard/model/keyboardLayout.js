import { isBlackMidi, midiToNoteName } from "../../../shared/music/midi";

// Pure keyboard layout helpers shared by keyboard feature components.

export function buildKeyboardLayout({ startMidi = 24, endMidi = 96 }) {
  const whites = [];
  const blacks = [];
  let whiteIndex = 0;

  for (let midi = startMidi; midi <= endMidi; midi += 1) {
    const isBlack = isBlackMidi(midi);
    const name = midiToNoteName(midi);

    if (isBlack) {
      blacks.push({
        midi,
        name,
        label: null,
        isBlack: true,
        leftWhiteIndex: Math.max(0, whiteIndex - 1),
      });
      continue;
    }

    whites.push({
      midi,
      name,
      label: name.startsWith("C") ? name : "",
      isBlack: false,
      whiteIndex,
    });

    whiteIndex += 1;
  }

  return { whites, blacks };
}
