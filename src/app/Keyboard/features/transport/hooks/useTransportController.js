"use client";

import { useCallback, useMemo, useReducer } from "react";
import { deriveTransportUi } from "./transportUi";

// States: idle | playing | paused | ready | error
// Events: PLAY | PAUSE | RESUME | STOP | FINISH | FAIL
const FSM = {
  idle: { PLAY: "playing" },
  playing: { PAUSE: "paused", STOP: "idle", FINISH: "ready", FAIL: "error" },
  paused: { RESUME: "playing", STOP: "idle", FINISH: "ready", FAIL: "error" },
  ready: { PLAY: "playing", STOP: "idle" },
  error: { PLAY: "playing", STOP: "idle" },
};

// useReducer instead of useState+a hand-rolled `next()` transition helper -
// this FSM table *is* the reducer's transition logic, and `runId` (which
// changes alongside `state` on PLAY/STOP/FAIL, not independently) is
// exactly the "multiple state values that change together" case
// useReducer is for, per
// https://jsdev.space/react-hook-usereducer/. Previously this was two
// separate useState calls kept in sync by convention (call setRunId
// right after setState, every time) - a reducer makes that coupling
// explicit and impossible to update in only one place by mistake.
function transportReducer(current, action) {
  const nextState = FSM[current.state]?.[action.type] ?? current.state;
  // PLAY/STOP/FAIL bump runId unconditionally - even if the FSM ignores
  // the event because there's no transition defined for the current
  // state (e.g. PLAY while already "playing") - same as the original
  // unconditional setRunId((n) => n + 1) call that always ran regardless
  // of whether the state transition actually happened.
  const bumpsRunId =
    action.type === "PLAY" || action.type === "STOP" || action.type === "FAIL";
  return {
    state: nextState,
    runId: bumpsRunId ? current.runId + 1 : current.runId,
  };
}

const INITIAL_TRANSPORT = { state: "idle", runId: 0 };

export function useTransportController() {
  const [transport, dispatch] = useReducer(transportReducer, INITIAL_TRANSPORT);

  const markPlay = useCallback(() => dispatch({ type: "PLAY" }), []);
  const markPause = useCallback(() => dispatch({ type: "PAUSE" }), []);
  const markResume = useCallback(() => dispatch({ type: "RESUME" }), []);
  const markStop = useCallback(() => dispatch({ type: "STOP" }), []);
  const markFinish = useCallback(() => dispatch({ type: "FINISH" }), []);
  const markFail = useCallback(() => dispatch({ type: "FAIL" }), []);

  const transportUi = useMemo(
    () => deriveTransportUi(transport.state),
    [transport.state],
  );

  return {
    state: transport.state,
    runId: transport.runId,
    ...transportUi,
    markPlay,
    markPause,
    markResume,
    markStop,
    markFinish,
    markFail,
  };
}

export default useTransportController;
