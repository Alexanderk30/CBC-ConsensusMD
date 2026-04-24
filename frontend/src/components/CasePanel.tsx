import type { PatientCase } from '../types';
import type { DifferentialEntry } from '../events';
import { Differential } from './Differential';

interface CasePanelProps {
  patientCase: PatientCase;
  differential?: DifferentialEntry[];
}

export function CasePanel({ patientCase, differential }: CasePanelProps) {
  const d = patientCase.demographics;
  const v = patientCase.vitals;

  // Build the clinical strip. Order matches how a real chart header reads:
  // identifier → demographics → weight → allergies → code status.
  const strip: Array<{ label: string; value: string; tone?: 'warn' }> = [];
  strip.push({ label: 'SEX/AGE', value: `${d.sex} · ${d.age}y` });
  if (d.weight_kg != null) strip.push({ label: 'WT', value: `${d.weight_kg} kg` });
  if (d.allergies) {
    const isNkda = /^nkda$/i.test(d.allergies.trim());
    strip.push({ label: 'ALLERGIES', value: d.allergies, tone: isNkda ? undefined : 'warn' });
  }
  if (d.code_status) strip.push({ label: 'CODE', value: d.code_status });

  return (
    <div className="cad-panel" style={{ padding: '14px 16px' }}>
      {/* Chart header: MRN · LIVE */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          marginBottom: 8,
        }}
      >
        <div className="cad-label">MRN · {patientCase.case_id}</div>
        <div className="cad-meta">
          <span className="cad-pulse" /> &nbsp; LIVE
        </div>
      </div>

      {/* Patient name: primary identifier. Fraunces, heavy, bone-0. */}
      {d.name && (
        <div
          style={{
            fontFamily: 'var(--serif)',
            fontSize: 22,
            fontWeight: 400,
            color: 'var(--bone-0)',
            lineHeight: 1.1,
            letterSpacing: '-0.005em',
            marginBottom: 4,
          }}
        >
          {d.name}
        </div>
      )}

      {/* Clinical chart strip: SEX/AGE · WT · ALLERGIES · CODE */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '4px 14px',
          marginBottom: d.relevant_context ? 6 : 10,
          fontFamily: 'var(--mono)',
          fontSize: 10,
          letterSpacing: '0.08em',
        }}
      >
        {strip.map((item) => (
          <div key={item.label} style={{ display: 'flex', gap: 5, alignItems: 'baseline' }}>
            <span style={{ color: 'var(--bone-3)', letterSpacing: '0.12em' }}>{item.label}</span>
            <span
              style={{
                color: item.tone === 'warn' ? 'var(--artery)' : 'var(--bone-0)',
                fontWeight: 500,
              }}
            >
              {item.value}
            </span>
          </div>
        ))}
      </div>

      {/* Clinical status (italic): "18 days postpartum…" — the human context. */}
      {d.relevant_context && (
        <div
          style={{
            fontFamily: 'var(--serif)',
            fontStyle: 'italic',
            fontSize: 13,
            color: 'var(--bone-1)',
            lineHeight: 1.4,
            marginBottom: 10,
          }}
        >
          {d.relevant_context}
        </div>
      )}

      <div className="cad-divider" />

      {/* Chief complaint in patient's voice */}
      <div className="cad-label" style={{ marginBottom: 4 }}>
        Chief complaint
      </div>
      <div
        className="cad-serif"
        style={{
          fontSize: 15,
          lineHeight: 1.3,
          color: 'var(--bone-0)',
          fontStyle: 'italic',
          marginBottom: 12,
        }}
      >
        "{patientCase.chief_complaint}"
      </div>

      {/* Differential — the current debate's leading hypotheses. Sits
          between the chief complaint and the HPI so a reader sees what the
          consortium thinks before reading the full narrative. */}
      {differential && (
        <>
          <Differential entries={differential} />
          <div className="cad-divider" />
        </>
      )}

      {/* Vitals strip */}
      <div className="cad-vital" style={{ marginBottom: 10, flexWrap: 'wrap', gap: '6px 14px' }}>
        <div>
          <span style={{ color: 'var(--bone-3)' }}>HR</span>{' '}
          <span className="cad-vital-val">{v.hr}</span>
        </div>
        <div>
          <span style={{ color: 'var(--bone-3)' }}>BP</span>{' '}
          <span className="cad-vital-val">
            {v.bp_systolic}/{v.bp_diastolic}
          </span>
        </div>
        <div>
          <span style={{ color: 'var(--bone-3)' }}>SpO₂</span>{' '}
          <span className="cad-vital-val">{v.spo2}%</span>
        </div>
        <div>
          <span style={{ color: 'var(--bone-3)' }}>T</span>{' '}
          <span className="cad-vital-val">{v.temp_c}°</span>
        </div>
        <div>
          <span style={{ color: 'var(--bone-3)' }}>RR</span>{' '}
          <span className="cad-vital-val">{v.rr}</span>
        </div>
      </div>
      <div className="cad-divider" />
      <Section title="HPI" body={patientCase.history_of_present_illness} />
      {patientCase.past_medical_history.length > 0 && (
        <Section title="PMH" body={patientCase.past_medical_history.join(' · ')} />
      )}
      <Section title="Exam" body={patientCase.physical_exam} />
      <Section title="Workup" body={formatWorkup(patientCase.initial_workup)} />
    </div>
  );
}

function Section({ title, body }: { title: string; body: string }) {
  return (
    <>
      <div className="cad-label" style={{ marginBottom: 4 }}>
        {title}
      </div>
      <div
        style={{
          fontFamily: 'var(--serif)',
          fontSize: 13,
          color: 'var(--bone-1)',
          lineHeight: 1.4,
          marginBottom: 10,
        }}
      >
        {body}
      </div>
    </>
  );
}

function formatWorkup(workup: Record<string, unknown>): string {
  return Object.entries(workup)
    .map(([k, v]) => `${k.toUpperCase()}: ${v}`)
    .join(' · ');
}
