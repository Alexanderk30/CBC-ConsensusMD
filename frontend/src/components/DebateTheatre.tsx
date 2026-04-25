import { useEffect, useMemo, useState } from 'react';
import type { DebateState, DifferentialEntry } from '../events';
import { deriveDifferential } from '../events';
import type { PatientCase } from '../types';
import { AgentRegistry } from './AgentRegistry';
import { CasePanel } from './CasePanel';
import { DebateScene } from './DebateScene';
import { Timeline } from './Timeline';
import { FloatingVerdict } from './FloatingVerdict';
import { Transcript } from './Transcript';

interface DebateTheatreProps {
  state: DebateState;
  onReset: () => void;
}

export function DebateTheatre({ state, onReset }: DebateTheatreProps) {
  const [patientCase, setPatientCase] = useState<PatientCase | null>(null);
  const [caseErr, setCaseErr] = useState<string | null>(null);
  const [caseCollapsed, setCaseCollapsed] = useState(false);

  useEffect(() => {
    // Clear stale case state when the session resets; otherwise a rapid
    // reset → new-case pick would flash the previous patient's chart in
    // the new debate until the fetch resolved. The lint rule is right in
    // general but this specific reset is exactly the effect's job:
    // synchronize local cache with the caseId prop.
    if (!state.caseId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPatientCase(null);
      setCaseErr(null);
      return;
    }
    let cancelled = false;
    fetch(`/cases/${encodeURIComponent(state.caseId)}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: PatientCase) => {
        if (!cancelled) setPatientCase(data);
      })
      .catch((err) => {
        if (!cancelled) setCaseErr(`Could not load case: ${err}`);
      });
    return () => {
      cancelled = true;
    };
  }, [state.caseId]);

  const differential = useMemo<DifferentialEntry[]>(() => deriveDifferential(state), [state]);
  const activeUtterance = useMemo(
    () => state.utterances.find((u) => u.id === state.activeUtteranceId),
    [state.utterances, state.activeUtteranceId],
  );

  const latestAntagonist = useMemo(() => {
    const rounds = Object.keys(state.antagonistOutputs).map(Number).sort((a, b) => b - a);
    if (!rounds.length) return null;
    return state.antagonistOutputs[rounds[0]];
  }, [state.antagonistOutputs]);

  const phaseLabel =
    state.phase === 'connecting'
      ? 'CONNECTING'
      : state.phase === 'debating'
        ? latestAntagonist
          ? latestAntagonist.result.type === 'no_credible_challenge'
            ? 'ANTAGONIST STOOD DOWN'
            : 'CHALLENGE OPEN'
          : 'ROUND 0 · BLIND'
        : state.phase === 'complete'
          ? state.outcome === 'converged'
            ? 'CONVERGED'
            : 'DEADLOCKED'
          : state.phase === 'error'
            ? 'ERROR'
            : 'IDLE';

  return (
    <div
      className="cad-root"
      style={{
        width: '100vw',
        height: '100vh',
        display: 'grid',
        gridTemplateColumns: caseCollapsed
          ? '220px minmax(0, 1fr) 380px'
          : '340px minmax(0, 1fr) 380px',
        gridTemplateRows: '1fr auto',
        gap: 14,
        padding: 14,
        boxSizing: 'border-box',
        transition: 'grid-template-columns 320ms cubic-bezier(0.22, 1, 0.36, 1)',
      }}
    >
      {/* LEFT — Case + Differential + Registry */}
      <div
        style={{
          gridColumn: 1,
          gridRow: '1 / span 2',
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
          minHeight: 0,
          overflowY: 'auto',
        }}
      >
        {caseErr && (
          <div
            className="cad-panel"
            style={{
              padding: 14,
              borderColor: 'var(--artery-dim)',
              color: 'var(--artery)',
              fontFamily: 'var(--mono)',
              fontSize: 12,
            }}
          >
            {caseErr}
          </div>
        )}
        {patientCase && (
          <CasePanel
            patientCase={patientCase}
            differential={differential}
            collapsed={caseCollapsed}
            onToggleCollapsed={() => setCaseCollapsed((c) => !c)}
          />
        )}
        <AgentRegistry state={state} />
      </div>

      {/* CENTER — Scene + Timeline */}
      <div
        style={{
          gridColumn: 2,
          gridRow: 1,
          position: 'relative',
          minHeight: 0,
          border: '1px solid var(--ink-3)',
          background: 'oklch(0.96 0.006 85)',
          overflow: 'hidden',
        }}
      >
        <div style={{ position: 'absolute', top: 12, left: 14, zIndex: 30 }}>
          <div className="cad-label">Debate Theatre</div>
          <div className="cad-meta" style={{ marginTop: 2 }}>
            <span className="cad-pulse" />
            &nbsp; {phaseLabel}
          </div>
        </div>
        <div
          style={{
            position: 'absolute',
            top: 12,
            right: 14,
            zIndex: 30,
            textAlign: 'right',
          }}
        >
          <div className="cad-label">Round {state.currentRound} / {state.maxRounds}</div>
          <div className="cad-meta" style={{ marginTop: 2 }}>
            survival {state.survivalCount} / 2
            {state.leadingDiagnosis ? ` · leading: ${truncate(state.leadingDiagnosis, 40)}` : ''}
          </div>
        </div>
        <div
          style={{
            position: 'absolute',
            bottom: 12,
            left: 14,
            zIndex: 30,
          }}
        >
          <div className="cad-label">ConsensusMD · v0.1</div>
        </div>
        <DebateScene state={state} activeUtterance={activeUtterance} />
      </div>

      {/* RIGHT — Transcript only. Verdict has been detached into a
          fixed-position floating card (see <FloatingVerdict /> below) so the
          transcript scroll is no longer disrupted when consensus lands and
          the verdict grows tall. */}
      <div
        style={{
          gridColumn: 3,
          gridRow: '1 / span 2',
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
          minHeight: 0,
          overflowY: 'auto',
        }}
      >
        <Transcript utterances={state.utterances} activeId={state.activeUtteranceId} />
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button className="cad-btn" onClick={onReset}>
            ↺ New case
          </button>
        </div>
      </div>

      <FloatingVerdict state={state} />

      {/* BOTTOM — Timeline */}
      <div style={{ gridColumn: 2, gridRow: 2 }}>
        <Timeline state={state} />
      </div>

      {state.phase === 'error' && (
        <div
          style={{
            position: 'absolute',
            bottom: 60,
            left: '50%',
            transform: 'translateX(-50%)',
            padding: '10px 14px',
            border: '1px solid var(--artery)',
            background: 'oklch(0.97 0.020 30)',
            color: 'var(--artery)',
            fontFamily: 'var(--mono)',
            fontSize: 11,
            zIndex: 100,
          }}
        >
          ERROR · {state.error}
        </div>
      )}
    </div>
  );
}

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n - 1).trim() + '…' : s;
}
