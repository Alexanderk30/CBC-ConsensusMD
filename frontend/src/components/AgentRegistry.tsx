import { AGENTS, AGENT_ORDER } from '../agents';
import type { DebateState } from '../events';

export function AgentRegistry({ state }: { state: DebateState }) {
  const anon = state.anonIdByRole;
  return (
    <div className="cad-panel" style={{ padding: '10px 14px' }}>
      <div className="cad-label" style={{ marginBottom: 8 }}>
        Agent Registry
      </div>
      {AGENT_ORDER.map((id) => {
        const a = AGENTS[id];
        const anonLabel =
          a.kind === 'specialist' && anon ? `· ${anon[id as keyof typeof anon]}` : '';
        return (
          <div
            key={id}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              padding: '4px 0',
              borderBottom: '1px solid oklch(0.90 0.008 85)',
              alignItems: 'center',
            }}
          >
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span
                style={{
                  fontFamily: 'var(--serif)',
                  fontSize: 18,
                  fontStyle: 'italic',
                  color: a.kind === 'antagonist' ? 'var(--artery)' : 'var(--bone-0)',
                  width: 18,
                }}
              >
                {a.glyph}
              </span>
              <div>
                <div
                  className="cad-mono"
                  style={{
                    fontSize: 10,
                    color: a.kind === 'antagonist' ? 'var(--artery)' : 'var(--bone-1)',
                  }}
                >
                  {a.name} {anonLabel}
                </div>
                <div
                  style={{
                    fontFamily: 'var(--serif)',
                    fontSize: 11,
                    fontStyle: 'italic',
                    color: 'var(--bone-3)',
                  }}
                >
                  {a.role}
                </div>
              </div>
            </div>
            <div
              className="cad-meta"
              style={{ color: a.kind === 'antagonist' ? 'var(--artery)' : 'var(--bone-3)' }}
            >
              {a.kind === 'antagonist' ? 'ADVERSARY' : 'NORMAL'}
            </div>
          </div>
        );
      })}
    </div>
  );
}
