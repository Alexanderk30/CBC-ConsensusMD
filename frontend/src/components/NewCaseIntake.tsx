// 4-step patient intake wizard.
//
// On submit, constructs a PatientCase object shaped exactly like the demo
// JSON files and hands it to useDebate.startWithCase — which sends it
// inline via the websocket (the backend accepts either `case_id` or `case`).

import { useMemo, useState } from 'react';
import type { PatientCase } from '../types';
import { CasePanel } from './CasePanel';
import {
  Field,
  ReviewBlock,
  Row,
  SectionHead,
  Segmented,
  StepIndicator,
  TextArea,
  TextInput,
} from './NewCaseIntakeFields';

interface NewCaseIntakeProps {
  onCancel: () => void;
  onSubmit: (patientCase: PatientCase) => void;
}

type Sex = 'F' | 'M' | 'other';

interface FormState {
  name: string;
  mrn: string;
  age: string;
  sex: Sex;
  weight_kg: string;
  allergies: string;
  code_status: string;
  urgency: 'routine' | 'urgent' | 'emergent';
  relevant_context: string;
  chief_complaint: string;
  hpi: string;
  hr: string;
  bp_systolic: string;
  bp_diastolic: string;
  spo2: string;
  temp_c: string;
  rr: string;
  pmh: string;
  medications: string;
  social_history: string;
  family_history: string;
  physical_exam: string;
  initial_workup: string;
}

function defaultState(): FormState {
  const suffix = Math.random().toString(36).slice(2, 8);
  return {
    name: '',
    mrn: `intake-${suffix}`,
    age: '',
    sex: 'F',
    weight_kg: '',
    allergies: 'NKDA',
    code_status: 'Full Code',
    urgency: 'urgent',
    relevant_context: '',
    chief_complaint: '',
    hpi: '',
    hr: '',
    bp_systolic: '',
    bp_diastolic: '',
    spo2: '',
    temp_c: '',
    rr: '',
    pmh: '',
    medications: '',
    social_history: '',
    family_history: '',
    physical_exam: '',
    initial_workup: '',
  };
}

function normalizeId(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-')
    .slice(0, 64) || `intake-${Date.now().toString(36)}`;
}

function buildPatientCase(f: FormState): PatientCase {
  const workup: Record<string, string> = {};
  for (const line of f.initial_workup.split('\n')) {
    const m = line.match(/^\s*([^:]+?)\s*:\s*(.+)\s*$/);
    if (m) {
      const key = m[1].toLowerCase().replace(/\W+/g, '_').replace(/^_+|_+$/g, '');
      if (key) workup[key] = m[2].trim();
    }
  }
  return {
    case_id: normalizeId(f.mrn),
    demographics: {
      age: Number(f.age),
      sex: f.sex,
      ...(f.name.trim() && { name: f.name.trim() }),
      ...(f.weight_kg && { weight_kg: Number(f.weight_kg) }),
      ...(f.allergies.trim() && { allergies: f.allergies.trim() }),
      ...(f.code_status.trim() && { code_status: f.code_status.trim() }),
      ...(f.relevant_context.trim() && { relevant_context: f.relevant_context.trim() }),
    },
    chief_complaint: f.chief_complaint.trim(),
    history_of_present_illness: f.hpi.trim(),
    past_medical_history: f.pmh.split('\n').map((s) => s.trim()).filter(Boolean),
    medications: f.medications.split('\n').map((s) => s.trim()).filter(Boolean),
    social_history: f.social_history.trim(),
    family_history: f.family_history.trim(),
    vitals: {
      hr: Number(f.hr),
      bp_systolic: Number(f.bp_systolic),
      bp_diastolic: Number(f.bp_diastolic),
      rr: Number(f.rr),
      spo2: Number(f.spo2),
      temp_c: Number(f.temp_c),
    },
    physical_exam: f.physical_exam.trim(),
    initial_workup: workup,
  };
}

function stepValid(step: number, f: FormState): boolean {
  const n = (s: string) => /^-?\d+(?:\.\d+)?$/.test(s.trim()) && Number(s) > 0;
  switch (step) {
    case 1:
      return !!f.mrn.trim() && n(f.age) && !!f.sex;
    case 2:
      return (
        !!f.chief_complaint.trim() &&
        !!f.hpi.trim() &&
        n(f.hr) &&
        n(f.bp_systolic) &&
        n(f.bp_diastolic) &&
        n(f.spo2) &&
        n(f.temp_c) &&
        n(f.rr)
      );
    case 3:
      return !!f.physical_exam.trim();
    case 4:
      return true;
    default:
      return false;
  }
}

export function NewCaseIntake({ onCancel, onSubmit }: NewCaseIntakeProps) {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<FormState>(defaultState());
  // Debounce the Convene button so a double-click doesn't open two
  // WebSocket connections to the same debate before the parent has
  // swapped this component out.
  const [submitting, setSubmitting] = useState(false);

  const upd = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((s) => ({ ...s, [k]: v }));

  const previewCase = useMemo<PatientCase | null>(() => {
    try {
      const c = buildPatientCase(form);
      if (!c.chief_complaint && !form.name) return null;
      return c;
    } catch {
      return null;
    }
  }, [form]);

  const canAdvance = stepValid(step, form);

  const handleSubmit = () => {
    if (submitting) return;
    if (!stepValid(1, form) || !stepValid(2, form) || !stepValid(3, form)) return;
    setSubmitting(true);
    onSubmit(buildPatientCase(form));
  };

  return (
    <div
      className="cad-root"
      style={{
        width: '100vw',
        height: '100vh',
        padding: 28,
        boxSizing: 'border-box',
        display: 'grid',
        gridTemplateColumns: '1fr 360px',
        gap: 24,
        background: 'var(--ink-0)',
      }}
    >
      {/* LEFT: form */}
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <header
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
            paddingBottom: 16,
            borderBottom: '1px solid var(--ink-3)',
            marginBottom: 20,
            gap: 20,
          }}
        >
          <div>
            <div className="cad-label" style={{ marginBottom: 6 }}>
              ConsensusMD · diagnostic consortium
            </div>
            <div
              style={{
                fontFamily: 'var(--serif)',
                fontSize: 32,
                fontWeight: 300,
                color: 'var(--bone-0)',
                letterSpacing: '-0.01em',
                lineHeight: 1.05,
              }}
            >
              Patient intake
            </div>
            <div
              style={{
                fontFamily: 'var(--serif)',
                fontSize: 13,
                fontStyle: 'italic',
                color: 'var(--bone-2)',
                marginTop: 4,
              }}
            >
              Four agents review the case once you submit.
            </div>
          </div>
          <StepIndicator step={step} />
        </header>

        <div style={{ flex: 1, overflowY: 'auto', paddingRight: 8, minHeight: 0 }}>
          {step === 1 && <Step1 form={form} upd={upd} />}
          {step === 2 && <Step2 form={form} upd={upd} />}
          {step === 3 && <Step3 form={form} upd={upd} />}
          {step === 4 && <Step4 form={form} previewCase={previewCase} />}
        </div>

        <footer
          style={{
            paddingTop: 16,
            borderTop: '1px solid var(--ink-3)',
            marginTop: 16,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="cad-btn" onClick={onCancel}>
              ← Back to cases
            </button>
            {form.urgency === 'emergent' && (
              <span
                className="cad-mono"
                style={{
                  color: 'var(--artery)',
                  fontSize: 10,
                  letterSpacing: '0.15em',
                  alignSelf: 'center',
                }}
              >
                EMERGENT
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            {step > 1 && (
              <button className="cad-btn" onClick={() => setStep(step - 1)}>
                ◀ Prev
              </button>
            )}
            {step < 4 && (
              <button
                className="cad-btn primary"
                disabled={!canAdvance}
                onClick={() => canAdvance && setStep(step + 1)}
              >
                Continue ▶
              </button>
            )}
            {step === 4 && (
              <button
                className="cad-btn primary"
                style={{ padding: '12px 22px' }}
                onClick={handleSubmit}
                disabled={submitting}
              >
                {submitting ? '◆ Opening…' : '◆ Convene Consortium'}
              </button>
            )}
          </div>
        </footer>
      </div>

      {/* RIGHT: live chart preview */}
      <aside
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
          minHeight: 0,
          overflowY: 'auto',
        }}
      >
        <div className="cad-label">Live case preview</div>
        {previewCase ? (
          <CasePanel patientCase={previewCase} />
        ) : (
          <div
            className="cad-panel"
            style={{
              padding: 16,
              fontFamily: 'var(--serif)',
              fontSize: 13,
              fontStyle: 'italic',
              color: 'var(--bone-3)',
            }}
          >
            The chart will populate as you fill in the form.
          </div>
        )}
      </aside>
    </div>
  );
}

// ─── Step bodies ──────────────────────────────────────────────────

function Step1({
  form,
  upd,
}: {
  form: FormState;
  upd: <K extends keyof FormState>(k: K, v: FormState[K]) => void;
}) {
  return (
    <div>
      <SectionHead title="Patient identifiers" note="Minimum data a chart header should carry." />
      <Row>
        <Field label="Patient name" flex={2}>
          <TextInput value={form.name} onChange={(v) => upd('name', v)} placeholder="Full name" />
        </Field>
        <Field label="MRN · case ID">
          <TextInput
            value={form.mrn}
            onChange={(v) => upd('mrn', v)}
            placeholder="intake-xxxxxx"
          />
        </Field>
      </Row>
      <Row>
        <Field label="Age">
          <TextInput value={form.age} onChange={(v) => upd('age', v)} placeholder="years" />
        </Field>
        <Field label="Sex">
          <Segmented
            value={form.sex}
            options={[
              { v: 'F', label: 'F' },
              { v: 'M', label: 'M' },
              { v: 'other', label: 'Other' },
            ]}
            onChange={(v) => upd('sex', v as Sex)}
          />
        </Field>
        <Field label="Weight · kg">
          <TextInput
            value={form.weight_kg}
            onChange={(v) => upd('weight_kg', v)}
            placeholder="kg"
          />
        </Field>
      </Row>
      <Row>
        <Field label="Allergies" flex={2}>
          <TextInput
            value={form.allergies}
            onChange={(v) => upd('allergies', v)}
            placeholder="NKDA or list"
          />
        </Field>
        <Field label="Code status">
          <Segmented
            value={form.code_status}
            options={[
              { v: 'Full Code', label: 'Full Code' },
              { v: 'DNR', label: 'DNR' },
              { v: 'DNR/DNI', label: 'DNR/DNI' },
            ]}
            onChange={(v) => upd('code_status', v)}
          />
        </Field>
      </Row>

      <SectionHead title="Triage" note="Sets debate posture and urgency framing." />
      <Row>
        <Field label="Urgency">
          <Segmented
            value={form.urgency}
            options={[
              { v: 'routine', label: 'Routine' },
              { v: 'urgent', label: 'Urgent' },
              { v: 'emergent', label: 'Emergent' },
            ]}
            onChange={(v) => upd('urgency', v as FormState['urgency'])}
          />
        </Field>
      </Row>

      <SectionHead
        title="Relevant clinical context"
        note="Short italic line on the chart header — e.g. day-of-illness, pregnancy status, postop day."
      />
      <TextArea
        rows={2}
        value={form.relevant_context}
        onChange={(v) => upd('relevant_context', v)}
        placeholder="e.g. 18 days postpartum from uncomplicated vaginal delivery"
      />
    </div>
  );
}

function Step2({
  form,
  upd,
}: {
  form: FormState;
  upd: <K extends keyof FormState>(k: K, v: FormState[K]) => void;
}) {
  return (
    <div>
      <SectionHead title="Chief complaint" note="In the patient's voice when possible." />
      <TextArea
        rows={2}
        value={form.chief_complaint}
        onChange={(v) => upd('chief_complaint', v)}
        placeholder="e.g. I can't catch my breath and I'm scared."
      />

      <SectionHead title="History of present illness" />
      <TextArea
        rows={7}
        value={form.hpi}
        onChange={(v) => upd('hpi', v)}
        placeholder="Onset, progression, quality, associated symptoms, relevant negatives…"
      />

      <SectionHead title="Vital signs" note="Latest recorded set." />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 10 }}>
        <Field label="HR · bpm">
          <TextInput value={form.hr} onChange={(v) => upd('hr', v)} />
        </Field>
        <Field label="BP sys">
          <TextInput value={form.bp_systolic} onChange={(v) => upd('bp_systolic', v)} />
        </Field>
        <Field label="BP dia">
          <TextInput value={form.bp_diastolic} onChange={(v) => upd('bp_diastolic', v)} />
        </Field>
        <Field label="SpO₂ · %">
          <TextInput value={form.spo2} onChange={(v) => upd('spo2', v)} />
        </Field>
        <Field label="Temp · °C">
          <TextInput value={form.temp_c} onChange={(v) => upd('temp_c', v)} />
        </Field>
        <Field label="RR">
          <TextInput value={form.rr} onChange={(v) => upd('rr', v)} />
        </Field>
      </div>
    </div>
  );
}

function Step3({
  form,
  upd,
}: {
  form: FormState;
  upd: <K extends keyof FormState>(k: K, v: FormState[K]) => void;
}) {
  return (
    <div>
      <SectionHead title="Past medical history" note="One entry per line." />
      <TextArea
        rows={3}
        value={form.pmh}
        onChange={(v) => upd('pmh', v)}
        placeholder={`Anxiety disorder, well-controlled on sertraline\nNo prior DVT or PE`}
      />

      <SectionHead title="Medications" note="One entry per line." />
      <TextArea
        rows={3}
        value={form.medications}
        onChange={(v) => upd('medications', v)}
        placeholder="sertraline 50 mg daily"
      />

      <SectionHead title="Social history" />
      <TextArea
        rows={2}
        value={form.social_history}
        onChange={(v) => upd('social_history', v)}
        placeholder="Non-smoker. Lives with partner. Occupation…"
      />

      <SectionHead title="Family history" />
      <TextArea
        rows={2}
        value={form.family_history}
        onChange={(v) => upd('family_history', v)}
        placeholder="Mother had blood clots in her 50s."
      />

      <SectionHead title="Physical exam" />
      <TextArea
        rows={4}
        value={form.physical_exam}
        onChange={(v) => upd('physical_exam', v)}
        placeholder="Anxious-appearing, mildly tachypneic. Lungs clear bilaterally…"
      />

      <SectionHead
        title="Initial workup"
        note="Key: value per line. Parsed automatically (EKG, BMP, CBC, CXR, etc.)"
      />
      <TextArea
        rows={5}
        value={form.initial_workup}
        onChange={(v) => upd('initial_workup', v)}
        placeholder={`EKG: sinus tachycardia at 112. No ST changes.\nBMP: Na 139, K 4.1, Cr 0.8.\nCBC: WBC 7.8, Hgb 12.4, Plt 245.`}
      />
    </div>
  );
}

function Step4({
  form,
  previewCase,
}: {
  form: FormState;
  previewCase: PatientCase | null;
}) {
  return (
    <div>
      <SectionHead
        title="Review"
        note="This is the case the consortium will see. Go back to edit any section."
      />
      {previewCase ? (
        <div
          style={{
            border: '1px solid var(--ink-3)',
            padding: 18,
            background: 'oklch(0.98 0.005 85)',
          }}
        >
          <ReviewBlock label="Patient" body={`${form.name || '—'} · ${form.sex} / ${form.age}y${form.weight_kg ? ` · ${form.weight_kg} kg` : ''}`} />
          <ReviewBlock label="Allergies / Code" body={`${form.allergies || 'not recorded'} · ${form.code_status || 'not recorded'}`} />
          {form.relevant_context && <ReviewBlock label="Context" body={form.relevant_context} />}
          <ReviewBlock label="Chief complaint" body={form.chief_complaint} />
          <ReviewBlock label="HPI" body={form.hpi} />
          <ReviewBlock
            label="Vitals"
            body={`HR ${form.hr} · BP ${form.bp_systolic}/${form.bp_diastolic} · SpO₂ ${form.spo2}% · T ${form.temp_c}° · RR ${form.rr}`}
          />
          {form.pmh && <ReviewBlock label="PMH" body={form.pmh} />}
          {form.medications && <ReviewBlock label="Meds" body={form.medications} />}
          {form.social_history && <ReviewBlock label="Social" body={form.social_history} />}
          {form.family_history && <ReviewBlock label="Family" body={form.family_history} />}
          <ReviewBlock label="Exam" body={form.physical_exam} />
          {form.initial_workup && <ReviewBlock label="Workup" body={form.initial_workup} />}
        </div>
      ) : (
        <div
          style={{
            fontFamily: 'var(--serif)',
            fontStyle: 'italic',
            color: 'var(--bone-3)',
          }}
        >
          The chart is incomplete. Go back and fill in the required fields.
        </div>
      )}

      <div
        style={{
          marginTop: 16,
          padding: 14,
          border: '1px solid var(--artery-dim)',
          background: 'oklch(0.97 0.020 30 / 0.4)',
          display: 'flex',
          gap: 12,
          alignItems: 'flex-start',
        }}
      >
        <div
          style={{
            fontFamily: 'var(--serif)',
            fontSize: 22,
            color: 'var(--artery)',
            fontStyle: 'italic',
            lineHeight: 1,
          }}
        >
          †
        </div>
        <div>
          <div className="cad-label" style={{ color: 'var(--artery)', marginBottom: 4 }}>
            OPHIS · advance notice
          </div>
          <div
            style={{
              fontFamily: 'var(--serif)',
              fontSize: 12.5,
              fontStyle: 'italic',
              color: 'var(--bone-1)',
              lineHeight: 1.45,
            }}
          >
            The skeptic will actively try to disprove whatever the other three propose. Expect
            3–4 rounds before consensus is rendered. Deadlock is a valid outcome if the
            specialists cannot agree under challenge.
          </div>
        </div>
      </div>
    </div>
  );
}
