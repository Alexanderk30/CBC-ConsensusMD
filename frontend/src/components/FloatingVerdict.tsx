import { useEffect, useState } from 'react';
import type { DebateState } from '../events';
import { Verdict } from './Verdict';

interface FloatingVerdictProps {
  state: DebateState;
}

/**
 * Floating, persistent, collapsible wrapper around <Verdict /> that lives
 * fixed-position in the bottom-right of the viewport instead of sharing the
 * right column's scroll with the transcript. The transcript can therefore be
 * read uninterrupted while the verdict remains accessible at all times.
 *
 * Visibility rules:
 *   • Renders nothing while state.consensus is undefined OR phase is 'idle'.
 *   • Auto-expands the first time consensus appears for a given debate.
 *   • Collapsing/expanding is user-controlled via the close button (×) on
 *     the expanded card and a click on the collapsed badge.
 *   • On phase reset to 'idle' the wrapper unmounts; the next debate's
 *     consensus auto-expands fresh because the component remounts with
 *     `expanded` defaulting to true.
 */
export function FloatingVerdict({ state }: FloatingVerdictProps) {
  const [expanded, setExpanded] = useState(true);

  // First-appearance auto-expand. Once consensus arrives we ensure the card
  // is shown — this handles the case where a user collapsed a *previous*
  // debate's verdict and then started a new one (the component remounts on
  // phase=idle, so this is mostly belt-and-suspenders for late-arriving
  // consensus on the same mounted instance).
  useEffect(() => {
    if (state.consensus) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setExpanded(true);
    }
  }, [state.consensus]);

  // Hide entirely until consensus is available, and on full reset.
  if (!state.consensus || state.phase === 'idle') {
    return null;
  }

  const isConverged = state.consensus.output.type === 'converged';
  const badgeLabel = isConverged ? '◆ Convened Diagnosis' : '◇ Structured Referral';

  if (!expanded) {
    return (
      <button
        type="button"
        className={`cad-floating-verdict cad-floating-verdict-collapsed ${
          isConverged ? 'converged' : 'deadlocked'
        }`}
        onClick={() => setExpanded(true)}
        aria-label={`Show verdict — ${badgeLabel}`}
      >
        <span className="cad-floating-verdict-badge-label">{badgeLabel}</span>
      </button>
    );
  }

  return (
    <div
      className={`cad-floating-verdict cad-floating-verdict-expanded ${
        isConverged ? 'converged' : 'deadlocked'
      }`}
      role="region"
      aria-label="Debate verdict"
    >
      <button
        type="button"
        className="cad-floating-verdict-close"
        onClick={() => setExpanded(false)}
        aria-label="Collapse verdict"
        title="Collapse"
      >
        ×
      </button>
      <Verdict state={state} />
    </div>
  );
}
