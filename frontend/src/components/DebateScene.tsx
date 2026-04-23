import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AGENTS, AGENT_POS, COMMITMENT_TO_CONFIDENCE, SPECIALIST_ROLES } from '../agents';
import type { DebateState, Utterance } from '../events';
import type { AgentId } from '../types';
import { AgentNode } from './AgentNode';
import { CaduceusCrest } from './CaduceusCrest';
import { SerpentArc, buildSerpentPath } from './SerpentArc';

const SCENE_W = 900;
const SCENE_H = 640;

interface DebateSceneProps {
  state: DebateState;
  activeUtterance: Utterance | undefined;
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

export function DebateScene({ state, activeUtterance }: DebateSceneProps) {
  const [ref, scale] = useSceneScale();

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

  const [clashes, setClashes] = useState<Array<{ id: number; x: number; y: number }>>([]);
  useEffect(() => {
    if (!activeUtterance) return;
    if (activeUtterance.kind === 'challenge' && activeUtterance.target) {
      const target = AGENT_POS[activeUtterance.target];
      const id = Date.now();
      setClashes((c) => [...c, { id, x: target.x, y: target.y }]);
      const t = setTimeout(() => setClashes((c) => c.filter((x) => x.id !== id)), 900);
      return () => clearTimeout(t);
    }
  }, [activeUtterance?.id, activeUtterance?.kind, activeUtterance?.target]);

  const isConvergenceMoment = activeUtterance?.kind === 'converge';

  return (
    <div ref={ref} style={{ position: 'absolute', inset: 0 }}>
      {/* Central crest */}
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 1,
        }}
      >
        <CaduceusCrest size={240} alive={isConvergenceMoment} />
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
          if (!utt.target) return null;
          const from = utt.from;
          if (from === 'consensus') return null;
          const a = AGENT_POS[from];
          const b = AGENT_POS[utt.target];
          if (!a || !b) return null;
          const curveBase = utt.kind === 'challenge' ? 0.45 : 0.28;
          const curve = from === 'antagonist' ? -curveBase : curveBase;
          const path = buildSerpentPath(a.x, a.y, b.x, b.y, curve);
          const kind: 'antagonist' | 'consensus' | '' =
            utt.kind === 'challenge' ? 'antagonist' : utt.kind === 'converge' ? 'consensus' : '';
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

        {/* Consensus: draw arcs from every specialist to the crest. */}
        {isConvergenceMoment && (
          <g>
            {SPECIALIST_ROLES.map((role) => {
              const p = AGENT_POS[role];
              const path = buildSerpentPath(p.x, p.y, 0, 0, 0.15);
              return <SerpentArc key={`conv-${role}`} path={path} kind="consensus" active />;
            })}
          </g>
        )}
      </svg>

      {/* Agent nodes */}
      {Object.values(AGENTS).map((agent) => {
        const pos = AGENT_POS[agent.id];
        const speaking = activeUtterance?.from === agent.id;
        const challenged =
          activeUtterance?.kind === 'challenge' && activeUtterance.target === agent.id;
        return (
          <AgentNode
            key={agent.id}
            agent={agent}
            pos={pos}
            scale={scale}
            speaking={speaking}
            challenged={challenged}
            confidence={confidences[agent.id] ?? 0.5}
          />
        );
      })}

      {/* Clash rings */}
      {clashes.map((c) => (
        <div
          key={c.id}
          className="cad-clash"
          style={{
            left: `calc(50% + ${c.x * scale}px)`,
            top: `calc(50% + ${c.y * scale}px)`,
          }}
        >
          <div className="cad-clash-ring" />
          <div className="cad-clash-ring" style={{ animationDelay: '0.15s' }} />
        </div>
      ))}

      {/* Utterance bubble */}
      {activeUtterance && activeUtterance.from !== 'consensus' && (
        <UtteranceBubble utt={activeUtterance} scale={scale} />
      )}
    </div>
  );
}

function UtteranceBubble({ utt, scale }: { utt: Utterance; scale: number }) {
  if (utt.from === 'consensus') return null;
  const pos = AGENT_POS[utt.from];
  const dx = pos.x === 0 ? 0 : pos.x > 0 ? 60 : -60;
  const dy = pos.y < 0 ? 110 : pos.y > 0 ? -160 : 0;
  const align = pos.x > 0 ? 'right' : 'left';
  const agent = AGENTS[utt.from];
  const targetName = utt.target ? AGENTS[utt.target].name : null;
  const bubbleKind =
    utt.kind === 'challenge' ? 'antagonist' : utt.kind === 'converge' ? 'consensus' : '';
  return (
    <div
      className={`cad-utter ${bubbleKind}`}
      style={{
        left: `calc(50% + ${(pos.x + dx) * scale}px)`,
        top: `calc(50% + ${(pos.y + dy) * scale}px)`,
        transform: align === 'right' ? 'translateX(-100%)' : 'translateX(0)',
      }}
    >
      <div className="cad-utter-meta">
        <span>
          {agent.name}
          {targetName ? ` → ${targetName}` : ''}
        </span>
        <span>{utt.kind}</span>
      </div>
      <div>{utt.text}</div>
    </div>
  );
}
