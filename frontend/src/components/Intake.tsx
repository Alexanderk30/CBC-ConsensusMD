import { useEffect, useState } from 'react';
import type { CaseSummary } from '../types';

interface IntakeProps {
  onLaunch: (caseId: string) => void;
}

export function Intake({ onLaunch }: IntakeProps) {
  const [cases, setCases] = useState<CaseSummary[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/cases')
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: CaseSummary[]) => {
        setCases(data);
        if (data.length) setSelected(data[0].case_id);
      })
      .catch((err) => setError(`Could not load cases: ${err}`));
  }, []);

  return (
    <div
      className="cad-root"
      style={{
        width: '100vw',
        height: '100vh',
        padding: 32,
        boxSizing: 'border-box',
        display: 'grid',
        gridTemplateColumns: '1fr 380px',
        gap: 32,
        background: 'var(--ink-0)',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div
          style={{
            paddingBottom: 16,
            borderBottom: '1px solid var(--ink-3)',
            marginBottom: 20,
          }}
        >
          <div className="cad-label" style={{ marginBottom: 6 }}>
            Caduceus · diagnostic consortium
          </div>
          <div
            style={{
              fontFamily: 'var(--serif)',
              fontSize: 42,
              fontWeight: 300,
              color: 'var(--bone-0)',
              letterSpacing: '-0.01em',
              lineHeight: 1.05,
            }}
          >
            Three minds <em style={{ color: 'var(--bone-2)' }}>agree.</em>
            <br />
            One holds the <em style={{ color: 'var(--artery)' }}>knife.</em>
          </div>
          <div
            style={{
              fontFamily: 'var(--serif)',
              fontSize: 14,
              fontStyle: 'italic',
              color: 'var(--bone-2)',
              marginTop: 10,
              maxWidth: 680,
            }}
          >
            Three frontier models debate a clinical case from three different reasoning frames.
            A fourth — the serpent — must be disproven before consensus is rendered. No verdict
            passes without surviving its own skeptic.
          </div>
        </div>

        <div className="cad-label" style={{ marginBottom: 12 }}>
          Select a case file
        </div>

        <div style={{ overflowY: 'auto', flex: 1, display: 'grid', gap: 12, paddingRight: 8 }}>
          {error && (
            <div
              style={{
                padding: 14,
                border: '1px solid var(--artery-dim)',
                background: 'oklch(0.97 0.020 30 / 0.5)',
                color: 'var(--artery)',
                fontFamily: 'var(--mono)',
                fontSize: 12,
              }}
            >
              {error}
            </div>
          )}
          {cases === null && !error && (
            <div
              className="cad-meta"
              style={{ padding: 14, fontStyle: 'italic', color: 'var(--bone-3)' }}
            >
              Loading cases…
            </div>
          )}
          {cases?.map((c) => (
            <div
              key={c.case_id}
              className={`cad-case-list-item ${selected === c.case_id ? 'selected' : ''}`}
              onClick={() => setSelected(c.case_id)}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'baseline',
                  gap: 12,
                }}
              >
                <div
                  style={{
                    fontFamily: 'var(--serif)',
                    fontSize: 16,
                    color: 'var(--bone-0)',
                    lineHeight: 1.3,
                  }}
                >
                  {c.chief_complaint}
                </div>
                <div className="cad-meta" style={{ whiteSpace: 'nowrap' }}>
                  {c.age_sex}
                </div>
              </div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginTop: 6,
                }}
              >
                <span className="cad-mono" style={{ fontSize: 10, color: 'var(--bone-2)' }}>
                  {c.case_id}
                </span>
                <span
                  className="cad-meta"
                  style={{ color: 'var(--bone-2)', textTransform: 'uppercase' }}
                >
                  {c.archetype}
                </span>
              </div>
            </div>
          ))}
        </div>

        <div
          style={{
            paddingTop: 16,
            borderTop: '1px solid var(--ink-3)',
            marginTop: 16,
            display: 'flex',
            justifyContent: 'flex-end',
          }}
        >
          <button
            className="cad-btn primary"
            style={{ padding: '12px 24px', fontSize: 11 }}
            disabled={!selected}
            onClick={() => selected && onLaunch(selected)}
          >
            ◆ Convene Consortium
          </button>
        </div>
      </div>

      <aside style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="cad-panel" style={{ padding: '14px 16px' }}>
          <div className="cad-label" style={{ marginBottom: 10 }}>
            Consortium
          </div>
          {[
            { name: 'SONNET 4.6', role: 'Eliminative reasoning', glyph: 'Ω', ant: false },
            { name: 'GEMINI 3.1 PRO', role: 'Mechanistic reasoning', glyph: 'Γ', ant: false },
            { name: 'GPT-5.4', role: 'Probabilistic reasoning', glyph: 'Ψ', ant: false },
            { name: 'OPHIS · OPUS 4.6', role: 'Adversarial skeptic', glyph: '†', ant: true },
          ].map((a) => (
            <div
              key={a.name}
              style={{
                display: 'flex',
                gap: 10,
                alignItems: 'center',
                padding: '8px 0',
                borderBottom: '1px solid oklch(0.90 0.008 85)',
              }}
            >
              <span
                style={{
                  fontFamily: 'var(--serif)',
                  fontSize: 20,
                  fontStyle: 'italic',
                  color: a.ant ? 'var(--artery)' : 'var(--bone-0)',
                  width: 20,
                }}
              >
                {a.glyph}
              </span>
              <div>
                <div
                  className="cad-mono"
                  style={{
                    fontSize: 10,
                    color: a.ant ? 'var(--artery)' : 'var(--bone-1)',
                  }}
                >
                  {a.name}
                </div>
                <div
                  style={{
                    fontFamily: 'var(--serif)',
                    fontSize: 11,
                    fontStyle: 'italic',
                    color: 'var(--bone-2)',
                  }}
                >
                  {a.role}
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="cad-panel" style={{ padding: '12px 14px' }}>
          <div className="cad-label" style={{ marginBottom: 8 }}>
            Protocol
          </div>
          <div
            style={{
              fontFamily: 'var(--serif)',
              fontSize: 12.5,
              fontStyle: 'italic',
              color: 'var(--bone-2)',
              lineHeight: 1.5,
            }}
          >
            Each debate runs up to 4 rounds. Convergence requires the antagonist to fail to produce
            a credible challenge twice in a row. If that never happens, the system deadlocks and
            returns a structured referral — also a valid output. All structured outputs are
            schema-validated server-side.
          </div>
        </div>
      </aside>
    </div>
  );
}
