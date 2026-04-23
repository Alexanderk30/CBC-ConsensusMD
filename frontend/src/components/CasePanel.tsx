import type { PatientCase } from '../types';

export function CasePanel({ patientCase }: { patientCase: PatientCase }) {
  const v = patientCase.vitals;
  return (
    <div className="cad-panel" style={{ padding: '14px 16px' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          marginBottom: 6,
        }}
      >
        <div className="cad-label">Case File · {patientCase.case_id}</div>
        <div className="cad-meta">
          <span className="cad-pulse" /> &nbsp; LIVE
        </div>
      </div>
      <div
        className="cad-serif"
        style={{ fontSize: 17, lineHeight: 1.3, color: 'var(--bone-0)', marginBottom: 8 }}
      >
        {patientCase.chief_complaint}
      </div>
      <div className="cad-meta" style={{ marginBottom: 10 }}>
        {patientCase.demographics.sex} / {patientCase.demographics.age}y
        {patientCase.demographics.relevant_context
          ? ` · ${patientCase.demographics.relevant_context}`
          : ''}
      </div>
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
