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
        top: 18,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 40,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '8px 14px',
        // Dark slab so it reads against the cream scene background. Lighter
        // ink-* values vanish; bone-0 (near-black) is the only thing on the
        // page that contrasts cleanly against everything else in the design.
        background: 'var(--bone-0)',
        color: 'var(--ink-0)',
        border: '1px solid var(--bone-0)',
        boxShadow: '0 4px 16px oklch(0.22 0.030 210 / 0.18)',
        fontFamily: 'var(--mono)',
        fontSize: 10,
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
      }}
      aria-label="Debate playback controls"
    >
      <span style={{ color: 'var(--ink-2)', fontSize: 9, letterSpacing: '0.18em' }}>
        Playback
      </span>
      <ModeButton
        active={mode === 'auto'}
        onClick={() => onModeChange('auto')}
        label="Auto"
        title="Events dispatch as they arrive (live debate pace)"
      />
      <ModeButton
        active={mode === 'step'}
        onClick={() => onModeChange('step')}
        label="Step"
        title="Queue events; advance manually one frame at a time (for video walkthroughs)"
      />
      {mode === 'step' && (
        <>
          <div
            aria-hidden
            style={{
              width: 1,
              height: 18,
              background: 'oklch(0.55 0.022 210)',
              margin: '0 2px',
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
              border: '1px solid',
              borderColor: pendingCount > 0 ? 'var(--ichor)' : 'oklch(0.45 0.020 210)',
              background: pendingCount > 0 ? 'var(--ichor)' : 'transparent',
              color: pendingCount > 0 ? 'oklch(0.99 0 0)' : 'oklch(0.55 0.022 210)',
              fontFamily: 'var(--mono)',
              fontSize: 10,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              padding: '5px 14px',
              cursor: pendingCount > 0 ? 'pointer' : 'not-allowed',
              transition: 'all .15s',
              fontWeight: 600,
            }}
          >
            ▶ Next
          </button>
          <span
            style={{
              color: pendingCount > 0 ? 'var(--ink-1)' : 'oklch(0.55 0.022 210)',
              fontSize: 9,
              minWidth: 80,
              letterSpacing: '0.14em',
            }}
          >
            {pendingCount === 0 ? 'waiting…' : `${pendingCount} pending`}
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
        border: '1px solid',
        borderColor: active ? 'var(--ink-0)' : 'oklch(0.45 0.020 210)',
        background: active ? 'var(--ink-0)' : 'transparent',
        color: active ? 'var(--bone-0)' : 'var(--ink-2)',
        fontFamily: 'var(--mono)',
        fontSize: 10,
        letterSpacing: '0.18em',
        textTransform: 'uppercase',
        padding: '5px 12px',
        cursor: 'pointer',
        transition: 'all .15s',
        fontWeight: active ? 600 : 400,
      }}
    >
      {label}
    </button>
  );
}
