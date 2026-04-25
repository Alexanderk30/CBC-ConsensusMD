import { useEffect, useState } from 'react';
import type { CaseSummary } from '../types';

interface IntakeProps {
  onLaunch: (caseId: string) => void;
  onNewCase?: () => void;
  onPlayDemo?: (variant: 'converge' | 'deadlock' | 'converge-skip') => void;
}

function StatBlock({
  figure,
  caption,
  source,
}: {
  figure: string;
  caption: string;
  source: string;
}) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '62px 1fr', columnGap: 12 }}>
      <div
        style={{
          fontFamily: 'var(--serif)',
          fontSize: 28,
          lineHeight: 1,
          color: 'var(--bone-0)',
          fontWeight: 400,
          letterSpacing: '-0.01em',
          paddingTop: 2,
        }}
      >
        {figure}
      </div>
      <div>
        <div
          style={{
            fontFamily: 'var(--serif)',
            fontSize: 12,
            lineHeight: 1.4,
            color: 'var(--bone-1)',
          }}
        >
          {caption}
        </div>
        <div
          className="cad-meta"
          style={{
            marginTop: 3,
            fontSize: 9,
            fontStyle: 'italic',
            color: 'var(--bone-3)',
          }}
        >
          {source}
        </div>
      </div>
    </div>
  );
}

export function Intake({ onLaunch, onNewCase, onPlayDemo }: IntakeProps) {
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
            ConsensusMD · diagnostic consortium
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
            Three minds <em style={{ color: 'var(--bone-2)' }}>reason.</em>
            <br />
            One <em style={{ color: 'var(--artery)' }}>refuses.</em>
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
            Built for the shift when a specialist isn't down the hall. Three frontier models
            propose a diagnosis; a fourth is built to disagree. What reaches the clinician has
            already survived the skeptic — so the patient doesn't have to.
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
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {onNewCase && (
              <button
                className="cad-btn"
                style={{ padding: '10px 16px' }}
                onClick={onNewCase}
              >
                + New patient intake
              </button>
            )}
            {onPlayDemo && (
              <>
                <span className="cad-meta" style={{ color: 'var(--bone-3)', marginLeft: 4 }}>
                  dry-run (no API):
                </span>
                <button
                  className="cad-btn"
                  style={{ padding: '10px 14px' }}
                  onClick={() => onPlayDemo('converge')}
                >
                  ▷ Converge
                </button>
                <button
                  className="cad-btn"
                  style={{ padding: '10px 14px' }}
                  onClick={() => onPlayDemo('deadlock')}
                >
                  ▷ Deadlock
                </button>
                <button
                  className="cad-btn"
                  style={{ padding: '10px 14px' }}
                  onClick={() => onPlayDemo('converge-skip')}
                  title="Jump directly to the convergence moment — for iterating on the animation"
                >
                  ▷▷ Skip to converge
                </button>
              </>
            )}
          </div>
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
            { name: 'GPT-5.5', role: 'Probabilistic reasoning', glyph: 'Ψ', ant: false },
            { name: 'OPHIS · OPUS 4.7', role: 'Guards against anchoring', glyph: '†', ant: true },
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
        <div className="cad-panel" style={{ padding: '14px 16px' }}>
          <div className="cad-label" style={{ marginBottom: 12 }}>
            Why this exists
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <StatBlock
              figure="12M"
              caption="US adults experience a diagnostic error in outpatient care every year — roughly 1 in 20."
              source="National Academies of Medicine, 2015"
            />
            <StatBlock
              figure="75M"
              caption="Americans live in a designated primary-care shortage area. Over 90% of rural counties face a physician shortage; metro counties have ~3× more doctors per capita."
              source="HRSA & Joint Economic Committee, 2024"
            />
            <StatBlock
              figure="88%"
              caption="of patients seeking a second opinion at Mayo Clinic had their diagnosis refined or revised. Only 12% were confirmed as originally diagnosed."
              source="Van Such et al., J Eval Clin Pract, 2017"
            />
          </div>
          <div
            style={{
              marginTop: 14,
              paddingTop: 12,
              borderTop: '1px solid var(--ink-3)',
              fontFamily: 'var(--serif)',
              fontSize: 12.5,
              fontStyle: 'italic',
              color: 'var(--bone-1)',
              lineHeight: 1.5,
            }}
          >
            ConsensusMD is the second opinion for the clinicians who can't reach one — rural ERs,
            overnight shifts, edge cases where the differential is wide and a specialist isn't
            down the hall.
          </div>
        </div>
        <div className="cad-panel" style={{ padding: '12px 14px' }}>
          <div className="cad-label" style={{ marginBottom: 6 }}>
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
            Up to 4 rounds. Convergence requires the skeptic to fail to produce a credible
            challenge twice in a row. If that never happens, the case is returned as a structured
            referral — uncertainty treated as a finding, not a failure.
          </div>
        </div>
      </aside>
    </div>
  );
}
