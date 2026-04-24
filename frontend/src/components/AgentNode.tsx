import type { AgentMeta, AgentPos } from '../agents';

interface AgentNodeProps {
  agent: AgentMeta;
  pos: AgentPos;
  scale?: number;
  speaking?: boolean;
  challenged?: boolean;
  confidence: number;
  dim?: boolean;
}

export function AgentNode({
  agent,
  pos,
  scale = 1,
  speaking = false,
  challenged = false,
  confidence,
  dim = false,
}: AgentNodeProps) {
  return (
    <div
      className={`cad-node role-${agent.id} ${agent.kind === 'antagonist' ? 'antagonist' : ''} ${speaking ? 'speaking' : ''} ${challenged ? 'challenged' : ''} ${dim ? 'dim' : ''}`}
      style={{
        left: `calc(50% + ${pos.x * scale}px)`,
        top: `calc(50% + ${pos.y * scale}px)`,
      }}
    >
      <div className="cad-conf">
        <div
          className="cad-conf-fill"
          style={{ width: `${Math.max(0, Math.min(1, confidence)) * 100}%` }}
        />
      </div>
      <div className="cad-node-ring">
        <span className="cad-node-glyph">{agent.glyph}</span>
      </div>
      <div className="cad-node-label">
        <div className="cad-node-name">{agent.name}</div>
        <div className="cad-node-role">{agent.role}</div>
      </div>
    </div>
  );
}
