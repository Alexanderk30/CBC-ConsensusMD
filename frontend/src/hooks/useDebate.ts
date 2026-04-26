import { useEffect, useReducer, useRef, useState } from 'react';
import type { DebateEvent, PatientCase } from '../types';
import { initialState, reduceEvent, type DebateState } from '../events';
import { DEMO_SEQUENCES, playSequence, type DemoVariant } from '../demo/demoSequences';

export type PlaybackMode = 'auto' | 'step';

export interface UseDebateResult {
  state: DebateState;
  start: (caseId: string, maxRounds?: number) => void;
  startWithCase: (patientCase: PatientCase, maxRounds?: number) => void;
  playDemo: (variant: DemoVariant) => void;
  cancel: () => void;
  /** Set when the debate was launched via startWithCase (the form path).
   *  The case is sent inline in the WS payload but never written to disk,
   *  so /cases/{caseId} would 404 — DebateTheatre renders the chart panel
   *  from this prop instead of fetching. Null for prepared / demo runs. */
  inlineCase: PatientCase | null;
  // Playback control — when mode === 'step', incoming events are queued
  // instead of dispatched. The user advances one event at a time via
  // `advance()`. Switching back to auto flushes the queue.
  playbackMode: PlaybackMode;
  pendingCount: number;
  setPlaybackMode: (mode: PlaybackMode) => void;
  advance: () => void;
}

interface StartAction { type: 'start'; caseId: string }
interface EventAction { type: 'event'; event: DebateEvent }
interface ResetAction { type: 'reset' }
interface ErrorAction { type: 'error'; message: string }
interface ConnectingAction { type: 'connecting' }
type Action = StartAction | EventAction | ResetAction | ErrorAction | ConnectingAction;

function reducer(state: DebateState, action: Action): DebateState {
  switch (action.type) {
    case 'start':
      return {
        ...initialState,
        phase: 'debating',
        caseId: action.caseId,
      };
    case 'connecting':
      return { ...initialState, phase: 'connecting', caseId: state.caseId };
    case 'event':
      return reduceEvent(state, action.event);
    case 'reset':
      return initialState;
    case 'error':
      // Don't flip from a successful terminal state to error. Spurious
      // wasClean=false closes sometimes arrive AFTER debate_complete
      // (Starlette/Railway proxy close-handshake race), and we don't want
      // that to stamp a red error banner over a converged verdict.
      if (state.phase === 'complete') return state;
      return { ...state, phase: 'error', error: action.message };
  }
}

/** Open a WebSocket to /ws/debate, dispatch `start_debate`, and accumulate
 *  event messages into a reducer-managed DebateState. */
/** If the backend goes silent during an active debate for this long
 *  (no `message` events on the open WebSocket), surface a "stuck"
 *  error rather than spin forever. Calibrated comfortably above the
 *  longest single-agent call (~120s for Opus on a hard case) — bumps
 *  shorter than that risked false positives during normal Round-3
 *  reasoning. */
const WS_STUCK_TIMEOUT_MS = 180_000;

export function useDebate(): UseDebateResult {
  const [state, dispatch] = useReducer(reducer, initialState);
  const socketRef = useRef<WebSocket | null>(null);
  const demoCancelRef = useRef<(() => void) | null>(null);
  const stuckTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Playback control is local UI state, not domain state — so it stays
  // outside the reducer. Refs mirror state for closure-safe access inside
  // long-lived event handlers (WS message, demo timer).
  const [playbackMode, setPlaybackModeState] = useState<PlaybackMode>('auto');
  const [pendingEvents, setPendingEvents] = useState<DebateEvent[]>([]);
  const [inlineCase, setInlineCase] = useState<PatientCase | null>(null);
  const playbackModeRef = useRef<PlaybackMode>('auto');
  // Sync the ref outside render so long-lived event handlers (WS message,
  // demo timer) can read the current mode via closure-safe ref access.
  useEffect(() => {
    playbackModeRef.current = playbackMode;
  }, [playbackMode]);

  /** Single entry point for events arriving from any source (WS or demo
   *  timer). In auto mode the event dispatches immediately; in step mode
   *  it queues and waits for the user to call advance(). */
  const ingest = (event: DebateEvent) => {
    if (playbackModeRef.current === 'step') {
      setPendingEvents((q) => [...q, event]);
    } else {
      dispatch({ type: 'event', event });
    }
  };

  const advance = () => {
    setPendingEvents((q) => {
      if (!q.length) return q;
      const [head, ...rest] = q;
      // Defer dispatch out of the setState updater so React doesn't
      // re-enter the same render pass.
      queueMicrotask(() => dispatch({ type: 'event', event: head }));
      return rest;
    });
  };

  const setPlaybackMode = (mode: PlaybackMode) => {
    if (mode === 'auto' && playbackModeRef.current === 'step') {
      // Flush queued events through the reducer in order before flipping
      // the flag, so the UI catches up without losing any frames.
      setPendingEvents((q) => {
        for (const ev of q) dispatch({ type: 'event', event: ev });
        return [];
      });
    }
    playbackModeRef.current = mode;
    setPlaybackModeState(mode);
  };

  const clearStuckTimer = () => {
    if (stuckTimerRef.current !== null) {
      clearTimeout(stuckTimerRef.current);
      stuckTimerRef.current = null;
    }
  };

  const armStuckTimer = (ws: WebSocket) => {
    clearStuckTimer();
    stuckTimerRef.current = setTimeout(() => {
      // Only fire for the still-active socket — a stale timer from a
      // socket the user already cancelled should be a no-op.
      if (socketRef.current !== ws) return;
      ws.close();
      dispatch({
        type: 'error',
        message: `No event received for ${Math.round(WS_STUCK_TIMEOUT_MS / 1000)}s — the debate appears stuck. Reset and try again.`,
      });
    }, WS_STUCK_TIMEOUT_MS);
  };

  useEffect(() => {
    return () => {
      socketRef.current?.close();
      demoCancelRef.current?.();
      clearStuckTimer();
    };
  }, []);

  const openSocket = (
    caseId: string,
    payload: Record<string, unknown>,
  ) => {
    socketRef.current?.close();
    demoCancelRef.current?.();
    clearStuckTimer();
    setPendingEvents([]);
    dispatch({ type: 'connecting' });

    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const url = `${proto}://${window.location.host}/ws/debate`;
    const ws = new WebSocket(url);
    socketRef.current = ws;

    ws.addEventListener('open', () => {
      dispatch({ type: 'start', caseId });
      ws.send(JSON.stringify(payload));
      armStuckTimer(ws);
    });

    ws.addEventListener('message', (ev) => {
      armStuckTimer(ws);
      try {
        const data = JSON.parse(ev.data) as DebateEvent;
        ingest(data);
      } catch (err) {
        dispatch({ type: 'error', message: `invalid server JSON: ${err}` });
      }
    });

    ws.addEventListener('error', () => {
      // Only surface errors for the active socket — a cancelled/replaced
      // socket's error is not interesting to the user.
      if (socketRef.current === ws) {
        clearStuckTimer();
        dispatch({ type: 'error', message: 'WebSocket connection error' });
      }
    });

    ws.addEventListener('close', (ev) => {
      // Same guard: if we've moved on (cancel, new debate, unmount), don't
      // flip the UI into an error state for a socket the user no longer cares
      // about. Previously this was gated on `state.phase === 'debating'` from
      // a stale closure that always saw pre-connecting phase, so the branch
      // never fired on real network drops.
      if (socketRef.current !== ws) return;
      clearStuckTimer();
      if (!ev.wasClean) {
        dispatch({ type: 'error', message: 'WebSocket closed unexpectedly' });
      }
    });
  };

  const start = (caseId: string, maxRounds = 4) => {
    setInlineCase(null);
    openSocket(caseId, { action: 'start_debate', case_id: caseId, max_rounds: maxRounds });
  };

  const startWithCase = (patientCase: PatientCase, maxRounds = 4) => {
    setInlineCase(patientCase);
    openSocket(patientCase.case_id, { action: 'start_debate', case: patientCase, max_rounds: maxRounds });
  };

  /** Replay a scripted sequence without touching the backend/API. Feeds
   *  events through the same reducer as a live debate, so the scene renders
   *  identically. */
  const playDemo = (variant: DemoVariant) => {
    socketRef.current?.close();
    socketRef.current = null;
    demoCancelRef.current?.();
    setPendingEvents([]);
    setInlineCase(null);

    const seq = DEMO_SEQUENCES[variant];
    const caseId = (seq[0]?.[1] as { case_id?: string })?.case_id ?? `demo-${variant}`;
    dispatch({ type: 'start', caseId });

    // For the converge and deadlock dry-runs in auto mode, pace each card
    // (specialist / antagonist / consensus output) exactly 3 seconds apart
    // so the video walkthrough lands on predictable beats. Other variants
    // (converge-skip), step mode, and the live WebSocket path keep the
    // encoded delays — this override only touches the two recorded dry-runs.
    const cardBeatMs =
      playbackModeRef.current === 'auto' && (variant === 'converge' || variant === 'deadlock')
        ? 3000
        : undefined;

    demoCancelRef.current = playSequence(seq, ingest, { cardBeatMs });
  };

  const cancel = () => {
    socketRef.current?.close();
    socketRef.current = null;
    demoCancelRef.current?.();
    demoCancelRef.current = null;
    clearStuckTimer();
    setPendingEvents([]);
    setInlineCase(null);
    dispatch({ type: 'reset' });
  };

  return {
    state,
    start,
    startWithCase,
    playDemo,
    cancel,
    inlineCase,
    playbackMode,
    pendingCount: pendingEvents.length,
    setPlaybackMode,
    advance,
  };
}
