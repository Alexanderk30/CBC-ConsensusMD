interface InstructionsProps {
  onBack: () => void;
}

export function Instructions({ onBack }: InstructionsProps) {
  return (
    <div
      className="cad-root"
      style={{
        width: '100vw',
        height: '100vh',
        padding: 28,
        boxSizing: 'border-box',
        display: 'grid',
        gridTemplateColumns: '1fr 380px',
        gap: 24,
        background: 'var(--ink-0)',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <header
          style={{
            paddingBottom: 16,
            borderBottom: '1px solid var(--ink-3)',
            marginBottom: 20,
          }}
        >
          <div className="cad-label" style={{ marginBottom: 6 }}>
            ConsensusMD · operating manual
          </div>
          <div
            style={{
              fontFamily: 'var(--serif)',
              fontSize: 36,
              fontWeight: 300,
              color: 'var(--bone-0)',
              letterSpacing: '-0.01em',
              lineHeight: 1.05,
            }}
          >
            How to <em style={{ color: 'var(--bone-2)' }}>convene</em> a consortium.
          </div>
          <div
            style={{
              fontFamily: 'var(--serif)',
              fontSize: 14,
              fontStyle: 'italic',
              color: 'var(--bone-2)',
              marginTop: 8,
              maxWidth: 680,
            }}
          >
            A short guide to running a case through the four agents — what each
            panel shows, how playback works, and how to read the verdict.
          </div>
        </header>

        <div style={{ flex: 1, overflowY: 'auto', paddingRight: 12, minHeight: 0 }}>
          <Step
            n="01"
            title="Choose or build a case"
            body="From the demo page, either select a prepared case file from the list or click + New patient intake to construct one yourself through a four-step chart wizard. Dry-run buttons replay a recorded debate without spending API calls — useful for walkthroughs or demos."
          />
          <Step
            n="02"
            title="Convene the consortium"
            body="Press ◆ Convene Consortium to open a live WebSocket to the backend. Three frontier models — Sonnet, Gemini, GPT — each receive the chart in parallel and produce an independent differential. Their reasoning streams onto the theatre as it arrives."
          />
          <Step
            n="03"
            title="Watch the skeptic press"
            body="OPHIS, the antagonist, reads everyone's outputs and tries to falsify the leading diagnosis. The challenged specialist's ring goes red while the challenge is on the table. The three specialists then defend, revise, or pivot. Each round is one full cycle of propose → challenge → respond."
          />
          <Step
            n="04"
            title="Read the verdict"
            body={
              <>
                <span style={{ color: 'var(--ichor)' }}>◆ Converged</span> — the
                skeptic failed to produce a credible challenge twice in a row.
                The card lists the agreed diagnosis, the test that would
                discriminate it, and what residual uncertainty remains.{' '}
                <span style={{ color: 'var(--artery)' }}>◇ Deadlocked</span> — by
                round four, the panel could not collapse onto a single answer.
                The case is returned as a structured referral with the competing
                hypotheses on the table. Uncertainty is the finding, not a
                failure.
              </>
            }
          />

          <div
            className="cad-panel"
            style={{ marginTop: 24, padding: '20px 22px' }}
          >
            <div className="cad-label" style={{ marginBottom: 12 }}>
              Reading the theatre
            </div>
            <Bullet
              term="Crest"
              body="The central caduceus shows live convergence. It emboldens when consensus lands and dims with a red seal on deadlock."
            />
            <Bullet
              term="Agent nodes"
              body="The three specialist nodes orbit the crest. A pulse marks who is currently reasoning. OPHIS sits opposite — fixed, watching."
            />
            <Bullet
              term="Utterance bubbles"
              body="Short summaries of each agent's contribution. In auto mode they fade after about ten seconds; in step mode they hold until you advance."
            />
            <Bullet
              term="Differential rail"
              body="Left column — the running differential, weighted by how often each diagnosis survives a round. The leading hypothesis is highlighted."
            />
            <Bullet
              term="Transcript"
              body="Right column — full reasoning shells, time-ordered. Click any utterance to scroll its source onto the stage."
            />
            <Bullet
              term="Round / survival HUD"
              body="Top right — current round (max 4) and survival count. Two consecutive survivals trigger convergence."
              last
            />
          </div>

          <div
            className="cad-panel"
            style={{ marginTop: 18, padding: '20px 22px' }}
          >
            <div className="cad-label" style={{ marginBottom: 12 }}>
              Playback controls
            </div>
            <Bullet
              term="AUTO"
              body="Events stream as the backend produces them. Bubbles auto-fade. Best for demos that should feel live."
            />
            <Bullet
              term="STEP"
              body="Events queue. Press ▶ Next to advance one event at a time. The pending counter shows how much is buffered. Best for narration or close-reading."
              last
            />
          </div>

          <div
            style={{
              marginTop: 24,
              padding: 16,
              border: '1px solid var(--artery-dim)',
              background: 'oklch(0.97 0.020 30 / 0.4)',
              display: 'flex',
              gap: 14,
              alignItems: 'flex-start',
            }}
          >
            <div
              style={{
                fontFamily: 'var(--serif)',
                fontSize: 26,
                color: 'var(--artery)',
                fontStyle: 'italic',
                lineHeight: 1,
              }}
            >
              †
            </div>
            <div>
              <div className="cad-label" style={{ color: 'var(--artery)', marginBottom: 4 }}>
                Read this once
              </div>
              <div
                style={{
                  fontFamily: 'var(--serif)',
                  fontSize: 13,
                  fontStyle: 'italic',
                  color: 'var(--bone-1)',
                  lineHeight: 1.5,
                }}
              >
                ConsensusMD is decision support, not a clinician. The verdict
                reflects what four reasoning models could agree on under
                adversarial pressure — a structured second opinion. It does not
                replace bedside judgment, examination, or the chart you are
                actually reading.
              </div>
            </div>
          </div>
        </div>

        <footer
          style={{
            paddingTop: 16,
            borderTop: '1px solid var(--ink-3)',
            marginTop: 16,
            display: 'flex',
            justifyContent: 'flex-start',
            alignItems: 'center',
          }}
        >
          <button className="cad-btn" onClick={onBack}>
            ← Back to cases
          </button>
        </footer>
      </div>

      <aside
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
          minHeight: 0,
          overflowY: 'auto',
        }}
      >
        <div className="cad-panel" style={{ padding: '14px 16px' }}>
          <div className="cad-label" style={{ marginBottom: 10 }}>
            The four roles
          </div>
          {[
            {
              glyph: 'Ω',
              name: 'SONNET 4.6',
              role: 'Eliminative',
              line: 'Rules out diagnoses that fail to explain a finding. Narrows the field by what cannot be true.',
            },
            {
              glyph: 'Γ',
              name: 'GEMINI 3.1 PRO',
              role: 'Mechanistic',
              line: 'Reasons from pathophysiology. Asks whether a diagnosis explains the disease process end to end.',
            },
            {
              glyph: 'Ψ',
              name: 'GPT-5.5',
              role: 'Probabilistic',
              line: 'Bayesian. Weighs prior likelihoods against incoming evidence and ranks the differential.',
            },
            {
              glyph: '†',
              name: 'OPHIS · OPUS 4.7',
              role: 'Antagonist',
              line: 'Tries to prove the consensus wrong. The case must survive the skeptic before it reaches you.',
              ant: true,
            },
          ].map((a) => (
            <div
              key={a.name}
              style={{
                display: 'grid',
                gridTemplateColumns: '24px 1fr',
                columnGap: 12,
                padding: '10px 0',
                borderBottom: '1px solid oklch(0.90 0.008 85)',
              }}
            >
              <span
                style={{
                  fontFamily: 'var(--serif)',
                  fontSize: 22,
                  fontStyle: 'italic',
                  color: a.ant ? 'var(--artery)' : 'var(--bone-0)',
                  lineHeight: 1,
                  paddingTop: 2,
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
                    marginBottom: 2,
                  }}
                >
                  {a.name} · {a.role}
                </div>
                <div
                  style={{
                    fontFamily: 'var(--serif)',
                    fontSize: 12,
                    fontStyle: 'italic',
                    color: 'var(--bone-2)',
                    lineHeight: 1.45,
                  }}
                >
                  {a.line}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="cad-panel" style={{ padding: '14px 16px' }}>
          <div className="cad-label" style={{ marginBottom: 10 }}>
            Outcome legend
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '20px 1fr',
              columnGap: 12,
              rowGap: 12,
            }}
          >
            <div
              style={{
                fontFamily: 'var(--serif)',
                fontSize: 18,
                color: 'var(--ichor)',
                lineHeight: 1,
                paddingTop: 1,
              }}
            >
              ◆
            </div>
            <div>
              <div className="cad-mono" style={{ fontSize: 10, color: 'var(--ichor)' }}>
                CONVERGED
              </div>
              <div
                style={{
                  fontFamily: 'var(--serif)',
                  fontSize: 12,
                  fontStyle: 'italic',
                  color: 'var(--bone-2)',
                  lineHeight: 1.45,
                  marginTop: 2,
                }}
              >
                Two consecutive survivals against the skeptic. Card shows
                diagnosis, distinguishing test, and residual uncertainty.
              </div>
            </div>
            <div
              style={{
                fontFamily: 'var(--serif)',
                fontSize: 18,
                color: 'var(--artery)',
                lineHeight: 1,
                paddingTop: 1,
              }}
            >
              ◇
            </div>
            <div>
              <div className="cad-mono" style={{ fontSize: 10, color: 'var(--artery)' }}>
                DEADLOCKED
              </div>
              <div
                style={{
                  fontFamily: 'var(--serif)',
                  fontSize: 12,
                  fontStyle: 'italic',
                  color: 'var(--bone-2)',
                  lineHeight: 1.45,
                  marginTop: 2,
                }}
              >
                Four rounds without agreement. Card returns competing hypotheses
                and a referral urgency, not a single answer.
              </div>
            </div>
          </div>
        </div>

        <div className="cad-panel" style={{ padding: '12px 14px' }}>
          <div className="cad-label" style={{ marginBottom: 6 }}>
            Tip
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
            For your first run, pick a prepared case and leave playback in AUTO.
            Switch to STEP on a second run to read each agent's full reasoning
            shell from the transcript.
          </div>
        </div>
      </aside>
    </div>
  );
}

function Step({ n, title, body }: { n: string; title: string; body: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '64px 1fr',
        columnGap: 18,
        padding: '18px 0',
        borderBottom: '1px solid var(--ink-3)',
      }}
    >
      <div
        className="cad-mono"
        style={{
          fontSize: 28,
          color: 'var(--bone-3)',
          letterSpacing: '-0.02em',
          lineHeight: 1,
          paddingTop: 4,
        }}
      >
        {n}
      </div>
      <div>
        <div
          style={{
            fontFamily: 'var(--serif)',
            fontSize: 22,
            fontWeight: 400,
            color: 'var(--bone-0)',
            letterSpacing: '-0.005em',
            marginBottom: 6,
            lineHeight: 1.2,
          }}
        >
          {title}
        </div>
        <div
          style={{
            fontFamily: 'var(--serif)',
            fontSize: 14,
            color: 'var(--bone-1)',
            lineHeight: 1.55,
            maxWidth: 680,
          }}
        >
          {body}
        </div>
      </div>
    </div>
  );
}

function Bullet({ term, body, last }: { term: string; body: string; last?: boolean }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '120px 1fr',
        columnGap: 14,
        padding: '8px 0',
        borderBottom: last ? 'none' : '1px solid oklch(0.92 0.008 85)',
      }}
    >
      <div
        className="cad-mono"
        style={{
          fontSize: 10,
          color: 'var(--bone-2)',
          letterSpacing: '0.1em',
          paddingTop: 3,
        }}
      >
        {term.toUpperCase()}
      </div>
      <div
        style={{
          fontFamily: 'var(--serif)',
          fontSize: 13,
          color: 'var(--bone-1)',
          lineHeight: 1.5,
        }}
      >
        {body}
      </div>
    </div>
  );
}
