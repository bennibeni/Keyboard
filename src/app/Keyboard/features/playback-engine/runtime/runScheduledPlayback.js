import { clamp, msPerBeat as msPerBeatFromBpm } from "../../../shared/music/math";
import { createSystemClock } from "./clock";

function sleepMs(clock, ms) {
  return new Promise((resolve) => clock.setTimeout(resolve, ms));
}

function eventTimeBeats(event) {
  return Number(event?.tBeat ?? event?.t) || 0;
}

function eventDurBeats(event) {
  return Number(event?.durBeat ?? event?.dur) || 1;
}

function sortByTime(events) {
  return [...(events || [])].sort(
    (a, b) => eventTimeBeats(a) - eventTimeBeats(b),
  );
}

export async function runScheduledPlayback({
  events,
  bpm,
  // DI: live bpm getter, injected instead of hardcoded - lets the caller
  // swap in whatever "current bpm" means for it (a ref, a store read...)
  // without this module knowing anything about React or state management.
  getBpm = null,
  loop = false,
  holdRatio = 1.0,
  shouldContinue = () => true,
  shouldPause = () => false,
  onStep = null,
  playChord,
  spacingGuardMs = 12,
  pausePollMs = 60,
  waitSliceMs = 25,
  // DI: the timing clock (nowMs/setTimeout/clearTimeout) is a dependency,
  // not a hardcoded global - defaults to the real wall clock
  // (createSystemClock()) so existing callers don't change, but a test
  // can inject a fake clock to simulate time passing without waiting.
  clock = null,
  // Optional live getter for the audio engine's own clock (AudioContext.
  // currentTime, in seconds - see audio-engine's now()). When provided,
  // each event's playChord call is stamped with `audioStartAt`: the
  // engine's own "now" read at the exact moment we decide to fire the
  // event. This is what lets a chord's notes land on the SAME sample-
  // accurate instant regardless of any async skew in how playChord
  // resolves each note (see usePlaySong.js) - the wall-clock timing below
  // still decides WHEN to fire, but the actual audio onset is pinned to
  // the audio clock, not to whenever the JS callback happens to run.
  // DI: same idea as `clock` above, but for the audio engine's clock
  // specifically - optional because not every caller needs sample-
  // accurate scheduling (e.g. a caller with no audio engine at all).
  getAudioNow = null,
}) {
  if (typeof playChord !== "function") {
    throw new Error("runScheduledPlayback: playChord must be a function");
  }

  const clk =
    clock && typeof clock.nowMs === "function" ? clock : createSystemClock();
  const evs0 = sortByTime(events);
  if (!evs0.length) return;

  // Se getBpm è fornita, il bpm può cambiare durante l'esecuzione (letto
  // live ad ogni ricalibrazione); altrimenti si usa il valore fisso `bpm`
  // passato all'avvio, come prima.
  const readBpm = typeof getBpm === "function" ? getBpm : () => bpm;

  // Modello "origine": a originWall (wall-clock ms) la posizione nel
  // brano era originBeat, e da lì avanza al ritmo corrente di msPerBeat.
  // Ricalibrato (originWall/originBeat aggiornati, msPerBeat sostituito)
  // ad ogni cambio di bpm e ad ogni ripresa da pausa: così un cambio di
  // tempo si applica solo in avanti, senza spostare retroattivamente le
  // note già suonate né farne accavallare di future.
  let msPerBeat = msPerBeatFromBpm(readBpm());
  let originWall = clk.nowMs();
  let originBeat = 0;

  function beatAtWall(wallMs) {
    return originBeat + (wallMs - originWall) / msPerBeat;
  }

  function wallAtBeat(beatPos) {
    return originWall + (beatPos - originBeat) * msPerBeat;
  }

  function syncTempoIfChanged() {
    const nextMsPerBeat = msPerBeatFromBpm(readBpm());
    if (nextMsPerBeat === msPerBeat) return;
    const now = clk.nowMs();
    originBeat = beatAtWall(now);
    originWall = now;
    msPerBeat = nextMsPerBeat;
  }

  async function waitIfPaused() {
    if (!shouldPause()) return;

    // Congela la posizione in beat raggiunta al momento della pausa.
    const frozenBeat = beatAtWall(clk.nowMs());

    while (shouldContinue() && shouldPause()) {
      await sleepMs(clk, clamp(pausePollMs, 20, 250));
    }
    if (!shouldContinue()) return;

    // Alla ripresa: l'origine riparte da "adesso" con la stessa posizione
    // in beat congelata alla pausa, e col bpm eventualmente cambiato nel
    // frattempo (questo è il momento in cui un cambio di bpm fatto in
    // pausa comincia davvero ad avere effetto sulla riproduzione).
    originBeat = frozenBeat;
    originWall = clk.nowMs();
    msPerBeat = msPerBeatFromBpm(readBpm());
  }

  async function sleepPausable(ms) {
    let remaining = Math.max(0, ms);
    while (shouldContinue() && remaining > 0) {
      await waitIfPaused();
      if (!shouldContinue()) break;
      const step = Math.min(remaining, clamp(waitSliceMs, 10, 80));
      await sleepMs(clk, step);
      remaining -= step;
      syncTempoIfChanged();
    }
  }

  while (shouldContinue()) {
    // Nuovo giro (modalità loop): l'origine riparte da beat 0, col bpm
    // corrente al momento di questo giro.
    originWall = clk.nowMs();
    originBeat = 0;
    msPerBeat = msPerBeatFromBpm(readBpm());

    for (let i = 0; i < evs0.length; i++) {
      if (!shouldContinue()) break;

      const ev = evs0[i];
      const next = evs0[i + 1] || null;

      const tBeats = eventTimeBeats(ev);
      const durBeats = eventDurBeats(ev);

      while (shouldContinue()) {
        await waitIfPaused();
        if (!shouldContinue()) break;
        syncTempoIfChanged();
        const waitToStart = wallAtBeat(tBeats) - clk.nowMs();
        if (waitToStart <= 0) break;
        await sleepMs(clk, Math.min(waitToStart, clamp(waitSliceMs, 10, 80)));
      }
      if (!shouldContinue()) break;

      await waitIfPaused();
      if (!shouldContinue()) break;
      syncTempoIfChanged();

      if (typeof onStep === "function") onStep(i, ev);

      const spacingMs = next
        ? Math.max(0, (eventTimeBeats(next) - tBeats) * msPerBeat)
        : Math.max(0, durBeats * msPerBeat);

      const nominalHold = clamp(
        Math.round(durBeats * msPerBeat * clamp(holdRatio, 0.2, 2.5)),
        150,
        20000,
      );
      const safeSpacing =
        spacingMs > 0
          ? Math.max(0, spacingMs - clamp(spacingGuardMs, 0, 200))
          : 0;
      const stopAfterMs = clamp(
        Math.min(nominalHold, safeSpacing || nominalHold),
        150,
        20000,
      );

      const t0 = clk.nowMs();
      const audioStartAt =
        typeof getAudioNow === "function" ? getAudioNow() : null;
      await playChord({
        label: ev?.label || `Event ${i + 1}`,
        stopAfterMs,
        eventIndex: i,
        event: ev,
        audioStartAt,
      });

      const remaining = spacingMs - (clk.nowMs() - t0);
      if (remaining > 0) {
        await sleepPausable(remaining);
      }
    }

    if (!loop) break;
  }
}
