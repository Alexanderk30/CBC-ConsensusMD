// Shared form atoms for NewCaseIntake — step indicator + labeled input/
// textarea/segmented-control wrappers. Extracted to keep the intake wizard
// file itself under the project's per-file size guideline; the atoms are
// not reused elsewhere yet, but likely will be if a second form is added.

import type { CSSProperties, ReactNode } from 'react';

export function StepIndicator({ step }: { step: number }) {
  const labels = ['Identifiers', 'Presentation', 'History & Exam', 'Review'];
  return (
    <div style={{ display: 'flex', gap: 14 }}>
      {labels.map((label, i) => {
        const n = i + 1;
        const state = step > n ? 'done' : step === n ? 'active' : 'pending';
        return (
          <div
            key={label}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}
          >
            <div
              style={{
                width: 22,
                height: 22,
                borderRadius: '50%',
                border: `1px solid ${state === 'done' ? 'var(--ichor)' : state === 'active' ? 'var(--bone-0)' : 'var(--ink-3)'}`,
                background:
                  state === 'done'
                    ? 'var(--ichor)'
                    : state === 'active'
                      ? 'var(--bone-0)'
                      : 'transparent',
                color: state === 'pending' ? 'var(--bone-3)' : 'var(--ink-0)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: 'var(--mono)',
                fontSize: 10,
                fontWeight: 600,
              }}
            >
              {state === 'done' ? '✓' : n}
            </div>
            <div
              className="cad-label"
              style={{
                color: state === 'active' ? 'var(--bone-0)' : 'var(--bone-3)',
                fontSize: 8,
              }}
            >
              {label}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function SectionHead({ title, note }: { title: string; note?: string }) {
  return (
    <div style={{ marginTop: 22, marginBottom: 10 }}>
      <div
        style={{
          fontFamily: 'var(--serif)',
          fontSize: 16,
          color: 'var(--bone-0)',
          fontWeight: 500,
        }}
      >
        {title}
      </div>
      {note && (
        <div className="cad-meta" style={{ marginTop: 2, fontStyle: 'italic' }}>
          {note}
        </div>
      )}
    </div>
  );
}

export function Row({ children }: { children: ReactNode }) {
  return <div style={{ display: 'flex', gap: 12, marginBottom: 10 }}>{children}</div>;
}

export function Field({
  label,
  children,
  flex = 1,
}: {
  label: string;
  children: ReactNode;
  flex?: number;
}) {
  return (
    <div style={{ flex, display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label className="cad-label">{label}</label>
      {children}
    </div>
  );
}

export function TextInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      className="cad-input"
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

export function TextArea({
  value,
  onChange,
  placeholder,
  rows = 3,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <textarea
      className="cad-input"
      rows={rows}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      style={{
        width: '100%',
        resize: 'vertical',
        fontFamily: 'var(--serif)',
        fontSize: 13.5,
        lineHeight: 1.45,
      }}
    />
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: Array<{ v: T; label: string }>;
  onChange: (v: T) => void;
}) {
  return (
    <div style={{ display: 'inline-flex', border: '1px solid var(--ink-3)', height: 34 }}>
      {options.map((o, i) => {
        const active = o.v === value;
        const style: CSSProperties = {
          border: 'none',
          background: active ? 'var(--bone-0)' : 'transparent',
          color: active ? 'var(--ink-0)' : 'var(--bone-1)',
          padding: '0 12px',
          fontFamily: 'var(--mono)',
          fontSize: 10,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          cursor: 'pointer',
          borderLeft: i > 0 ? '1px solid var(--ink-3)' : 'none',
          transition: 'all .15s',
          flex: 1,
          minWidth: 0,
        };
        return (
          <button key={o.v} onClick={() => onChange(o.v)} style={style}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function ReviewBlock({ label, body }: { label: string; body: string }) {
  return (
    <div
      style={{
        marginBottom: 12,
        paddingBottom: 10,
        borderBottom: '1px dashed oklch(0.90 0.008 85)',
      }}
    >
      <div className="cad-label" style={{ marginBottom: 4 }}>
        {label}
      </div>
      <div
        style={{
          fontFamily: 'var(--serif)',
          fontSize: 13.5,
          color: 'var(--bone-0)',
          lineHeight: 1.4,
          whiteSpace: 'pre-wrap',
        }}
      >
        {body || '—'}
      </div>
    </div>
  );
}
