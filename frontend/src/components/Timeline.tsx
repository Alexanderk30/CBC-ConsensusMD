import type { DebateState } from '../events';

interface TimelineProps {
  state: DebateState;
}

/** Round-based timeline. Each round gets a dot; the playhead tracks current round. */
export function Timeline({ state }: TimelineProps) {
  const rounds = state.maxRounds;
  const ticks = Array.from({ length: rounds + 1 }, (_, i) => i); // 0..maxRounds
  const completedRounds = Object.keys(state.antagonistOutputs).map(Number);
  const current = state.currentRound;

  const headPct =
    rounds > 0 ? (Math.min(current, rounds) / rounds) * 100 : 0;

  return (
    <div className="cad-timeline">
      {ticks.map((i) => {
        const hasAntagonist = completedRounds.includes(i);
        const antag = hasAntagonist ? state.antagonistOutputs[i] : undefined;
        const kind = antag?.result.type;
        const color =
          kind === 'challenge'
            ? 'var(--artery)'
            : kind === 'no_credible_challenge'
              ? 'var(--ichor)'
              : i <= current
                ? 'var(--bone-1)'
                : 'var(--ink-3)';
        const left = `${(i / rounds) * 100}%`;
        return (
          <div key={i} style={{ position: 'absolute', left, top: 0, height: '100%' }}>
            <div
              style={{
                position: 'absolute',
                top: '50%',
                left: -4,
                transform: 'translateY(-50%)',
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: color,
                border: '1px solid var(--ink-0)',
              }}
              title={i === 0 ? 'Round 0 (blind)' : `Round ${i}`}
            />
            <div
              className="cad-meta"
              style={{
                position: 'absolute',
                top: '100%',
                left: -12,
                marginTop: 4,
                fontSize: 8,
                color: i === current ? 'var(--bone-0)' : 'var(--bone-3)',
              }}
            >
              R{i}
            </div>
          </div>
        );
      })}
      <div className="cad-playhead" style={{ left: `${headPct}%` }} />
    </div>
  );
}
