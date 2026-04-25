import type { PlaybackMode } from '../hooks/useDebate';

interface PlaybackControlsProps {
  mode: PlaybackMode;
  pendingCount: number;
  onModeChange: (mode: PlaybackMode) => void;
  onAdvance: () => void;
}

/** Floating playback control dock for the debate scene.
 *
 *  Two modes:
 *   - **auto**: events from the WebSocket (or demo timer) dispatch as they
 *     arrive. This is the default and the demo-day default — every frame
 *     fires automatically as the backend produces it.
 *   - **step**: events queue in pendingEvents instead of dispatching. The
 *     user clicks "Next" to advance one event at a time. Useful for video
 *     narration where each frame needs to be paused on. */
export function PlaybackControls({
  mode,
  pendingCount,
  onModeChange,
  onAdvance,
}: PlaybackControlsProps) {
  return (
    <div
      style={{
        position: 'fixed',
        top: 24,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 40,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '6px 10px',
        background: 'oklch(0.99 0.004 85 / 0.95)',
        border: '1px solid var(--ink-3)',
        backdropFilter: 'blur(8px)',
        fontFamily: 'var(--mono)',
        fontSize: 10,
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
      }}
      aria-label="Debate playback controls"
    >
      <span style={{ color: 'var(--bone-3)', fontSize: 9 }}>Mode</span>
      <ModeButton
        active={mode === 'auto'}
        onClick={() => onModeChange('auto')}
        label="Auto"
        title="Events dispatch as they arrive"
      />
      <ModeButton
        active={mode === 'step'}
        onClick={() => onModeChange('step')}
        label="Step"
        title="Queue events; advance manually"
      />
      {mode === 'step' && (
        <>
          <div
            aria-hidden
            style={{
              width: 1,
              height: 16,
              background: 'var(--ink-3)',
              margin: '0 4px',
            }}
          />
          <button
            onClick={onAdvance}
            disabled={pendingCount === 0}
            title={
              pendingCount === 0
                ? 'Waiting for the next event…'
                : `Advance to next event (${pendingCount} pending)`
            }
            style={{
              border: '1px solid var(--bone-1)',
              background: pendingCount > 0 ? 'var(--bone-0)' : 'transparent',
              color: pendingCount > 0 ? 'var(--ink-0)' : 'var(--bone-3)',
              fontFamily: 'var(--mono)',
              fontSize: 10,
              letterSpacing: '0.15em',
              textTransform: 'uppercase',
              padding: '4px 12px',
              cursor: pendingCount > 0 ? 'pointer' : 'not-allowed',
              transition: 'all .15s',
            }}
          >
            ▶ Next
          </button>
          <span style={{ color: 'var(--bone-3)', fontSize: 9, minWidth: 64 }}>
            {pendingCount === 0
              ? 'waiting…'
              : `${pendingCount} pending`}
          </span>
        </>
      )}
    </div>
  );
}

function ModeButton({
  active,
  onClick,
  label,
  title,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  title: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        border: '1px solid var(--ink-3)',
        background: active ? 'var(--bone-0)' : 'transparent',
        color: active ? 'var(--ink-0)' : 'var(--bone-1)',
        fontFamily: 'var(--mono)',
        fontSize: 10,
        letterSpacing: '0.15em',
        textTransform: 'uppercase',
        padding: '4px 10px',
        cursor: 'pointer',
        transition: 'all .15s',
      }}
    >
      {label}
    </button>
  );
}
