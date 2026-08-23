"use client";

import { createSynthEngine } from "@app/audio-engine";
import { SETTINGS } from "../../../settings";
import { createPubSubStore } from "../../../shared/state/createPubSubStore";
import { clickParamsForKind } from "../model/clickSounds";
import { createWavClickEngine } from "./createWavClickEngine";

// Square wave for a percussive click character, matching R03's original
// click engine's timbre. maxVoices=4 is plenty for a single click stream
// that never overlaps itself.
const clickEngine = createSynthEngine({ waveform: "square", maxVoices: 4 });
const wavEngine = createWavClickEngine({
  strongUrl: SETTINGS.metronomeStrongUrl.value,
  midUrl: SETTINGS.metronomeMidUrl.value,
  weakUrl: SETTINGS.metronomeWeakUrl.value,
});

// This class's job is now specifically orchestration: track beat/bar
// position, trigger the click sound (delegated to clickSounds.js) at the
// right moment, and publish the resulting state (delegated to
// createPubSubStore.js) for useMetronomeSubscription to read via
// useSyncExternalStore. It no longer owns the pub/sub mechanics or the
// click's actual pitch/velocity/duration - those live in their own
// single-purpose modules.
class MetronomeService {
  constructor() {
    this._store = createPubSubStore({
      beatsCount: 0,
      beatIdx: null,
      kinds: [],
      running: false,
    });
    this._enabled = false;
    this.beatsCount = 0;
    this.beatIdx = null;
    this.kinds = [];
    this._lastBeat = -1;

    this.subscribe = this._store.subscribe;
    this.getSnapshot = this._store.getSnapshot;
    this.enable = this.enable.bind(this);
    this.disable = this.disable.bind(this);
    this.setGain = this.setGain.bind(this);
    this.tickBeat = this.tickBeat.bind(this);
    this.reset = this.reset.bind(this);
    this.now = this.now.bind(this);
  }

  _emit() {
    this._store.setSnapshot({
      beatsCount: this.beatsCount,
      beatIdx: this.beatIdx,
      kinds: this.kinds,
      running: this._enabled,
    });
  }

  async enable(beatsCount) {
    this._enabled = true;
    if (beatsCount != null) this.beatsCount = beatsCount;
    this._lastBeat = -1;
    await Promise.allSettled([
      clickEngine.unlock(),
      wavEngine.unlock().then(() => wavEngine.loadOnce()),
    ]);
    this._emit();
  }

  disable() {
    this._enabled = false;
    this.beatIdx = null;
    this._lastBeat = -1;
    this._emit();
  }

  reset() {
    this.beatIdx = null;
    this._lastBeat = -1;
    this._emit();
  }

  // kinds is the full accent pattern for the current bar (one entry per
  // beat position, e.g. ["strong","weak","medium","weak"] for 4/4) - used
  // to color every pill in BeatPills, not just the one currently firing.
  // audioStartAt (AudioContext seconds, from createMetronomeBeatLoop's
  // lookahead) pins the click's actual onset to the audio clock instead
  // of whenever this call happens to execute - null falls back to "now"
  // (clickEngine.playNote's own default), same as before this existed.
  tickBeat(beatInBar, beatsCount, kind = "weak", kinds = null, audioStartAt = null) {
    if (!this._enabled) return;
    if (beatsCount != null) this.beatsCount = beatsCount;
    if (Array.isArray(kinds)) this.kinds = kinds;
    if (beatInBar === this._lastBeat) return;
    this._lastBeat = beatInBar;
    this.beatIdx = beatInBar;

    const click = clickParamsForKind(kind);
    const delaySeconds = Number.isFinite(audioStartAt)
      ? Math.max(0, audioStartAt - clickEngine.now())
      : 0;
    const playedWav = wavEngine.play(kind, {
      velocity: click.velocity,
      startAt: wavEngine.now() + delaySeconds,
    });

    if (!playedWav) {
      clickEngine.playNote(click.midi, {
        durationMs: click.durationMs,
        velocity: click.velocity,
        startAt: audioStartAt,
      });
    }

    this._emit();
  }

  // Exposes the click engine's own audio clock so callers (the beat
  // loop) can compute future scheduling instants - see
  // createMetronomeBeatLoop's getAudioNow.
  now() {
    return clickEngine.now();
  }

  setGain(g) {
    clickEngine.setMasterGain(g);
    wavEngine.setMasterGain(g);
  }

  dispose() {
    this.disable();
  }
}

let _instance = null;
export function getMetronomeService() {
  if (!_instance) _instance = new MetronomeService();
  return _instance;
}

export default getMetronomeService;
