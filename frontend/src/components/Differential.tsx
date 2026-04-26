import type { DifferentialEntry } from '../events';

/** Inline live-ranking list. Renders without its own card wrapper so it can
 *  sit inside the CasePanel between the chief complaint and the HPI — where
 *  a clinician would naturally read the current leading hypotheses before
 *  diving into the narrative. */
export function Differential({ entries }: { entries: DifferentialEntry[] }) {
  return (
    <div>
      <div className="cad-label" style={{ marginBottom: 8 }}>
        Differential · Live Ranking
      </div>
      {entries.length === 0 && (
        <div
          style={{
            fontFamily: 'var(--serif)',
            fontSize: 12,
            fontStyle: 'italic',
            color: 'var(--bone-3)',
            padding: '4px 0',
          }}
        >
          Awaiting Round 0…
        </div>
      )}
      {entries.map((d) => (
        <div key={d.id} className="cad-diff-row">
          <div>
            <div
              className={`cad-diff-name ${d.color === 'lead' ? '' : d.weight < 0.05 ? 'dim' : ''}`}
            >
              {d.name}
            </div>
            <div className="cad-diff-bar">
              <div
                className={`cad-diff-bar-fill ${d.color || ''}`}
                style={{ width: `${d.weight * 100}%` }}
              />
            </div>
          </div>
          <div className="cad-diff-val">{(d.weight * 100).toFixed(0)}%</div>
        </div>
      ))}
    </div>
  );
}
