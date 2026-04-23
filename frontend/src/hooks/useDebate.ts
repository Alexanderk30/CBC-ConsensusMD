import { useEffect, useReducer, useRef } from 'react';
import type { DebateEvent } from '../types';
import { initialState, reduceEvent, type DebateState } from '../events';

export interface UseDebateResult {
  state: DebateState;
  start: (caseId: string, maxRounds?: number) => void;
  cancel: () => void;
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
      return { ...state, phase: 'error', error: action.message };
  }
}

/** Open a WebSocket to /ws/debate, dispatch `start_debate`, and accumulate
 *  event messages into a reducer-managed DebateState. */
export function useDebate(): UseDebateResult {
  const [state, dispatch] = useReducer(reducer, initialState);
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    return () => {
      socketRef.current?.close();
    };
  }, []);

  const start = (caseId: string, maxRounds = 4) => {
    socketRef.current?.close();
    dispatch({ type: 'connecting' });

    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const url = `${proto}://${window.location.host}/ws/debate`;
    const ws = new WebSocket(url);
    socketRef.current = ws;

    ws.addEventListener('open', () => {
      dispatch({ type: 'start', caseId });
      ws.send(JSON.stringify({ action: 'start_debate', case_id: caseId, max_rounds: maxRounds }));
    });

    ws.addEventListener('message', (ev) => {
      try {
        const data = JSON.parse(ev.data) as DebateEvent;
        dispatch({ type: 'event', event: data });
      } catch (err) {
        dispatch({ type: 'error', message: `invalid server JSON: ${err}` });
      }
    });

    ws.addEventListener('error', () => {
      dispatch({ type: 'error', message: 'WebSocket connection error' });
    });

    ws.addEventListener('close', (ev) => {
      // If the server closed cleanly after debate_complete or error, leave
      // the phase alone; otherwise mark as error if the debate was in flight.
      if (state.phase === 'debating' && !ev.wasClean) {
        dispatch({ type: 'error', message: 'WebSocket closed unexpectedly' });
      }
    });
  };

  const cancel = () => {
    socketRef.current?.close();
    dispatch({ type: 'reset' });
  };

  return { state, start, cancel };
}
