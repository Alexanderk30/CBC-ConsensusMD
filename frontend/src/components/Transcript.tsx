import { useEffect, useRef } from 'react';
import { AGENTS } from '../agents';
import type { Utterance } from '../events';
import { FormattedText } from './FormattedText';

interface TranscriptProps {
  utterances: Utterance[];
  activeId?: string;
}

export function Transcript({ utterances, activeId }: TranscriptProps) {
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = listRef.current?.querySelector('.active');
    if (el) (el as HTMLElement).scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
  }, [activeId]);

  return (
    <div
      className="cad-panel"
      style={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 }}
    >
      <div className="cad-panel-header">
        <div className="cad-label">Transcript · {utterances.length} exchange{utterances.length === 1 ? '' : 's'}</div>
        <div className="cad-meta">debate.log</div>
      </div>
      <div ref={listRef} style={{ overflowY: 'auto', flex: 1 }}>
        {utterances.length === 0 && (
          <div
            style={{
              padding: 20,
              fontFamily: 'var(--serif)',
              fontSize: 13,
              fontStyle: 'italic',
              color: 'var(--bone-3)',
            }}
          >
            Awaiting the first exchange…
          </div>
        )}
        {utterances.map((u) => {
          const label =
            u.from === 'consensus'
              ? 'CONSENSUS'
              : AGENTS[u.from].name.split(' ')[0];
          const whoClass =
            u.from === 'antagonist'
              ? 'antagonist'
              : u.from === 'consensus'
                ? 'consensus'
                : '';
          const kindColor =
            u.kind === 'challenge'
              ? 'var(--artery)'
              : u.kind === 'converge' || u.kind === 'deadlock'
                ? 'var(--ichor)'
                : u.kind === 'pass'
                  ? 'var(--bone-2)'
                  : 'var(--bone-3)';
          const targetLabel = u.target ? AGENTS[u.target].name.split(' ')[0] : null;
          return (
            <div
              key={u.id}
              className={`cad-tx-row ${u.id === activeId ? 'active' : ''}`}
            >
              <div className={`cad-tx-who ${whoClass}`}>
                {u.from === 'antagonist' ? '† ' : u.from === 'consensus' ? '◆ ' : ''}
                {label}
              </div>
              <div>
                <div style={{ display: 'flex', gap: 8, marginBottom: 2 }}>
                  <span className="cad-meta" style={{ color: kindColor }}>
                    R{u.round} · {u.kind.toUpperCase()}
                  </span>
                  {targetLabel && <span className="cad-meta">→ {targetLabel}</span>}
                </div>
                <FormattedText
                  text={u.text}
                  style={{
                    fontFamily: 'var(--serif)',
                    fontSize: 13,
                    lineHeight: 1.5,
                    color: 'var(--bone-0)',
                  }}
                />

              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
