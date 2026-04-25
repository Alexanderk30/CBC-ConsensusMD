import type { DebateState } from '../events';
import type { ConvergedOutput, DeadlockOutput } from '../types';

export function Verdict({ state }: { state: DebateState }) {
  // Pending panel until consensus_output has been received.
  if (!state.consensus) {
    return (
      <div className="cad-panel" style={{ padding: '14px 16px', opacity: 0.6 }}>
        <div className="cad-label" style={{ marginBottom: 6 }}>
          Consensus · Pending
        </div>
        <div
          className="cad-serif"
          style={{ fontSize: 13, color: 'var(--bone-2)', fontStyle: 'italic' }}
        >
          {state.phase === 'debating'
            ? 'Debate in progress. The skeptic has not yet conceded.'
            : 'Awaiting debate.'}
        </div>
      </div>
    );
  }

  const consensus = state.consensus;
  const isConverged = consensus.output.type === 'converged';

  return (
    <div className={`cad-verdict ${isConverged ? '' : 'deadlocked'}`}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 8,
        }}
      >
        <div
          className="cad-label"
          style={{ color: isConverged ? 'var(--ichor)' : 'var(--artery)' }}
        >
          {isConverged ? '◆ Convened Diagnosis' : '◇ Structured Referral'}
        </div>
        <div className="cad-meta" style={{ color: isConverged ? 'var(--ichor)' : 'var(--artery)' }}>
          <span className={`cad-pulse ${isConverged ? 'green' : ''}`} />
          &nbsp;&nbsp;
          {isConverged ? 'CONVERGED' : 'DEADLOCKED'} · round {consensus.final_round}
        </div>
      </div>
      {consensus.output.type === 'converged' ? (
        <ConvergedBody output={consensus.output} />
      ) : (
        <DeadlockBody output={consensus.output} />
      )}
    </div>
  );
}

function ConvergedBody({ output }: { output: ConvergedOutput }) {
  return (
    <>
      <div
        style={{
          fontFamily: 'var(--serif)',
          fontSize: 22,
          color: 'var(--bone-0)',
          lineHeight: 1.15,
          marginBottom: 6,
        }}
      >
        {output.primary_diagnosis}
      </div>
      <div
        style={{
          fontFamily: 'var(--serif)',
          fontSize: 13,
          color: 'var(--bone-2)',
          fontStyle: 'italic',
          marginBottom: 12,
        }}
      >
        {output.integrated_reasoning.synthesis}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <div>
          <div className="cad-label" style={{ marginBottom: 4 }}>
            Commitment
          </div>
          <div
            style={{
              fontFamily: 'var(--serif)',
              fontSize: 22,
              color: 'var(--ichor)',
              textTransform: 'capitalize',
            }}
          >
            {output.commitment}
          </div>
        </div>
        <div>
          <div className="cad-label" style={{ marginBottom: 4 }}>
            Distinguishing test
          </div>
          <div
            style={{
              fontFamily: 'var(--serif)',
              fontSize: 12.5,
              color: 'var(--bone-1)',
              lineHeight: 1.4,
            }}
          >
            {output.distinguishing_test.test_name}
          </div>
        </div>
      </div>
      <div className="cad-divider" />
      <div className="cad-label" style={{ marginBottom: 4 }}>
        Residual uncertainty
      </div>
      <div
        style={{
          fontFamily: 'var(--serif)',
          fontSize: 12.5,
          fontStyle: 'italic',
          color: 'var(--bone-1)',
          lineHeight: 1.4,
        }}
      >
        {output.residual_uncertainty}
      </div>
    </>
  );
}

function DeadlockBody({ output }: { output: DeadlockOutput }) {
  return (
    <>
      <div
        style={{
          fontFamily: 'var(--serif)',
          fontSize: 20,
          color: 'var(--bone-0)',
          lineHeight: 1.2,
          marginBottom: 8,
        }}
      >
        No single diagnosis held up through the fourth round.
      </div>
      <div
        style={{
          fontFamily: 'var(--serif)',
          fontSize: 13,
          color: 'var(--bone-1)',
          fontStyle: 'italic',
          lineHeight: 1.45,
          marginBottom: 12,
        }}
      >
        The uncertainty is itself the clinical finding. Escalate with the competing hypotheses
        on the table — {output.referral_urgency}. {output.recommended_next_action}
      </div>
      <div className="cad-label" style={{ marginBottom: 6 }}>
        Competing hypotheses
      </div>
      {output.competing_hypotheses.map((h, i) => (
        <div
          key={i}
          style={{
            padding: '8px 0',
            borderBottom:
              i < output.competing_hypotheses.length - 1
                ? '1px solid oklch(0.90 0.008 85)'
                : 'none',
          }}
        >
          <div
            style={{
              fontFamily: 'var(--serif)',
              fontSize: 13.5,
              color: 'var(--bone-0)',
              marginBottom: 2,
            }}
          >
            {h.diagnosis}
          </div>
          <div
            className="cad-meta"
            style={{ color: 'var(--bone-2)', marginBottom: 2, letterSpacing: '0.1em' }}
          >
            DISTINGUISHED BY
          </div>
          <div
            style={{
              fontFamily: 'var(--serif)',
              fontSize: 12,
              color: 'var(--bone-1)',
              lineHeight: 1.35,
            }}
          >
            {h.distinguishing_test}
          </div>
        </div>
      ))}
    </>
  );
}
