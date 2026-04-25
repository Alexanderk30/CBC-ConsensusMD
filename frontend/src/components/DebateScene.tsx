import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AGENTS, AGENT_POS, COMMITMENT_TO_CONFIDENCE, SPECIALIST_ROLES } from '../agents';
import type { DebateState, Utterance, UtteranceHeadline } from '../events';
import type { AgentId } from '../types';
import { AgentNode } from './AgentNode';
import { CaduceusCrest } from './CaduceusCrest';
import { SerpentArc } from './SerpentArc';
import { buildSerpentPath } from './serpentPaths';

const SCENE_W = 900;
const SCENE_H = 640;

interface DebateSceneProps {
  state: DebateState;
  activeUtterance: Utterance | undefined;
  /** Determines whether the scene utterance bubble auto-fades. In auto
   *  mode, the bubble fades 10s after the last new utterance arrives so
   *  the scene can rest visually between rounds. In step mode the user
   *  is controlling the pace and the bubble must stay until they advance. */
  playbackMode?: 'auto' | 'step';
}

function useSceneScale() {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    if (!ref.current) return;
    const update = () => {
      if (!ref.current) return;
      const r = ref.current.getBoundingClientRect();
      if (!r.width || !r.height) return;
      setScale(Math.min(r.width / SCENE_W, r.height / SCENE_H));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, scale] as const;
}

export function DebateScene({
  state,
  activeUtterance,
  playbackMode = 'auto',
}: DebateSceneProps) {
  const [ref, scale] = useSceneScale();
  // Auto-fade the scene utterance bubble after a quiet interval. Resets
  // every time a new utterance becomes active. Step mode never fades —
  // the user is the clock.
  const [bubbleFading, setBubbleFading] = useState(false);
  useEffect(() => {
    // Sync local "fading" state with the active-utterance prop change.
    // The lint rule is right in general but this specific reset is
    // exactly the effect's job: when a new utterance arrives, the
    // bubble must be visible again.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBubbleFading(false);
    if (playbackMode !== 'auto') return;
    if (!activeUtterance) return;
    const t = setTimeout(() => setBubbleFading(true), 10000);
    return () => clearTimeout(t);
  }, [activeUtterance?.id, playbackMode]);

  // Recent utterances for trailing arcs.
  const history = useMemo(() => {
    const uts = state.utterances.slice(-3);
    return uts.map((u, i, arr) => ({ utt: u, age: arr.length - 1 - i }));
  }, [state.utterances]);

  // Derive per-agent confidence from the latest recorded specialist output's
  // primary commitment. Antagonist confidence proxies from survival_count.
  const confidences = useMemo(() => {
    const out: Record<AgentId, number> = {
      eliminative: 0.5,
      mechanistic: 0.5,
      probabilistic: 0.5,
      antagonist: 0.6 + 0.1 * state.survivalCount,
    };
    const rounds = Object.keys(state.specialistOutputs).map(Number).sort((a, b) => b - a);
    if (rounds.length) {
      const latest = state.specialistOutputs[rounds[0]] ?? {};
      for (const role of SPECIALIST_ROLES) {
        const o = latest[role];
        if (o) {
          const commit = o.differential[0]?.commitment;
          if (commit) out[role] = COMMITMENT_TO_CONFIDENCE[commit];
        }
      }
    }
    return out;
  }, [state.specialistOutputs, state.survivalCount]);

  // Clash ring: renders a single keyed element whenever a challenge utterance
  // is active. The CSS animation (cad-clash-expand, forwards) runs itself;
  // React-side we just keep the DOM node present while the challenge is
  // active and let the key change remount-and-replay when the next challenge
  // arrives. No state, no effect — avoids the setState-in-effect lint and the
  // stale-timer edge cases that came with the previous array-based pattern.
  const clashTarget =
    activeUtterance?.kind === 'challenge' && activeUtterance.target
      ? AGENT_POS[activeUtterance.target]
      : null;
  const clashKey = activeUtterance?.id;

  const isConvergenceMoment = activeUtterance?.kind === 'converge';
  const isDeadlockMoment = activeUtterance?.kind === 'deadlock';

  return (
    <div
      ref={ref}
      className={
        isConvergenceMoment
          ? 'cad-converging'
          : isDeadlockMoment
            ? 'cad-deadlocking'
            : ''
      }
      style={{ position: 'absolute', inset: 0 }}
    >
      {/* Resolution seal — positive (◆ filled, ichor green) or negative
          (◇ outline, artery red). Deadlock label lands first so the viewer
          registers "no consensus" before the scene visibly resolves. */}
      {isConvergenceMoment && (
        <div className="cad-convergence-seal">
          <span className="mark">◆</span>
          <span className="label">consensus reached</span>
        </div>
      )}
      {isDeadlockMoment && (
        <div className="cad-convergence-seal deadlock">
          <span className="mark">◇</span>
          <span className="label">no consensus · referral required</span>
        </div>
      )}

      {/* Central crest — grows from background decoration to load-bearing
          heraldry the moment convergence lands. */}
      <div
        className="cad-crest-stage"
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 3,
        }}
      >
        <CaduceusCrest size={260} />
      </div>

      {/* Serpent arcs layer */}
      <svg
        viewBox={`${-SCENE_W / 2} ${-SCENE_H / 2} ${SCENE_W} ${SCENE_H}`}
        preserveAspectRatio="xMidYMid meet"
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          zIndex: 5,
          pointerEvents: 'none',
        }}
      >
        {history.map(({ utt, age }) => {
          // During the resolution moment (convergence or deadlock) the
          // scene belongs to the seal + crest; stale debate arcs still
          // rendered at 32% opacity would distract (or, for deadlock,
          // read as if OPHIS is still actively attacking). Clear them.
          if (isConvergenceMoment || isDeadlockMoment) return null;
          if (!utt.target) return null;
          const from = utt.from;
          if (from === 'consensus') return null;
          const a = AGENT_POS[from];
          const b = AGENT_POS[utt.target];
          if (!a || !b) return null;
          const curveBase = utt.kind === 'challenge' ? 0.45 : 0.28;
          const curve = from === 'antagonist' ? -curveBase : curveBase;
          const path = buildSerpentPath(a.x, a.y, b.x, b.y, curve);
          const kind: 'antagonist' | '' = utt.kind === 'challenge' ? 'antagonist' : '';
          return (
            <SerpentArc
              key={`${utt.id}-${age}`}
              path={path}
              kind={kind}
              active={age === 0}
              fadeOut={age > 1}
            />
          );
        })}

      </svg>

      {/* Agent nodes */}
      {Object.values(AGENTS).map((agent) => {
        const pos = AGENT_POS[agent.id];
        const speaking = activeUtterance?.from === agent.id;
        const challenged =
          activeUtterance?.kind === 'challenge' && activeUtterance.target === agent.id;
        const thinking = state.thinking.includes(agent.id) && !speaking;
        return (
          <AgentNode
            key={agent.id}
            agent={agent}
            pos={pos}
            scale={scale}
            speaking={speaking}
            challenged={challenged}
            thinking={thinking}
            confidence={confidences[agent.id] ?? 0.5}
          />
        );
      })}

      {/* Clash ring — single keyed element, remounts per challenge */}
      {clashTarget && (
        <div
          key={clashKey}
          className="cad-clash"
          style={{
            left: `calc(50% + ${clashTarget.x * scale}px)`,
            top: `calc(50% + ${clashTarget.y * scale}px)`,
          }}
        >
          <div className="cad-clash-ring" />
          <div className="cad-clash-ring" style={{ animationDelay: '0.15s' }} />
        </div>
      )}

      {/* Utterance bubble */}
      {activeUtterance && activeUtterance.from !== 'consensus' && (
        <UtteranceBubble utt={activeUtterance} scale={scale} fading={bubbleFading} />
      )}
    </div>
  );
}

function UtteranceBubble({
  utt,
  scale,
  fading = false,
}: {
  utt: Utterance;
  scale: number;
  fading?: boolean;
}) {
  if (utt.from === 'consensus') return null;
  const pos = AGENT_POS[utt.from];
  // Bubble placement keeps each speaker in its own airspace:
  //   - Side agents (Gemini / GPT) → bubble alongside, vertically centered
  //     on the node. Stays in the agent's horizontal band; never drips
  //     down into OPHIS's territory at the bottom of the scene.
  //   - Top-center agent (Sonnet) → bubble below, growing down.
  //   - Bottom-center agent (OPHIS) → bubble above, growing up.
  const isSide = pos.x !== 0;
  const isBottom = pos.x === 0 && pos.y > 0;
  const dx = isSide ? (pos.x > 0 ? 60 : -60) : 0;
  const dy = isSide ? 0 : isBottom ? -70 : 70;
  const tx = isSide
    ? pos.x > 0
      ? 'translateX(-100%)'
      : 'translateX(0)'
    : 'translateX(-50%)';
  const ty = isSide ? 'translateY(-50%)' : isBottom ? 'translateY(-100%)' : 'translateY(0)';
  const transform = `${tx} ${ty}`;
  const agent = AGENTS[utt.from];
  const targetName = utt.target ? AGENTS[utt.target].name : null;
  const bubbleKind =
    utt.kind === 'challenge' ? 'antagonist' : utt.kind === 'converge' ? 'consensus' : '';
  return (
    <div
      className={`cad-utter ${bubbleKind} ${fading ? 'cad-utter-fading' : ''}`}
      style={{
        left: `calc(50% + ${(pos.x + dx) * scale}px)`,
        top: `calc(50% + ${(pos.y + dy) * scale}px)`,
        transform,
      }}
    >
      <div className="cad-utter-meta">
        <span>
          {agent.name}
          {targetName ? ` → ${targetName}` : ''}
        </span>
        <span>{utt.kind}</span>
      </div>
      <BubbleHeadline headline={utt.headline} />
    </div>
  );
}

/** Condensed scene bubble: current position + a few bullets of reasoning.
 *  The full reasoning lives in the right-hand Transcript. */
function BubbleHeadline({ headline }: { headline?: UtteranceHeadline }) {
  if (!headline || (!headline.position && !headline.bullets?.length)) {
    return null;
  }
  return (
    <div>
      {headline.position && (
        <>
          <div
            className="cad-label"
            style={{ color: 'var(--bone-3)', marginTop: 2, marginBottom: 2 }}
          >
            Position
          </div>
          <div
            style={{
              fontFamily: 'var(--serif)',
              fontSize: 15,
              color: 'var(--bone-0)',
              lineHeight: 1.2,
              marginBottom: 2,
            }}
          >
            {headline.position}
          </div>
          {(headline.commitment || headline.action) && (
            <div
              style={{
                fontFamily: 'var(--serif)',
                fontSize: 12,
                fontStyle: 'italic',
                color: 'var(--bone-2)',
                marginBottom: 10,
              }}
            >
              {headline.commitment || headline.action}
            </div>
          )}
        </>
      )}
      {headline.bullets && headline.bullets.length > 0 && (
        <>
          <div className="cad-label" style={{ color: 'var(--bone-3)', marginBottom: 4 }}>
            Reasoning
          </div>
          <ul
            style={{
              listStyle: 'none',
              padding: 0,
              margin: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
            }}
          >
            {headline.bullets.map((b, i) => (
              <li
                key={i}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '12px 1fr',
                  columnGap: 6,
                  alignItems: 'baseline',
                  fontFamily: 'var(--serif)',
                  fontSize: 12.5,
                  lineHeight: 1.4,
                  color: 'var(--bone-0)',
                }}
              >
                <span
                  aria-hidden
                  style={{
                    fontFamily: 'var(--mono)',
                    fontSize: '0.82em',
                    color: 'var(--bone-3)',
                  }}
                >
                  —
                </span>
                <span>{b}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
