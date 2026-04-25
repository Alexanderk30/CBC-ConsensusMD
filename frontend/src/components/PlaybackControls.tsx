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
 *     arrive. The default, and the demo-day default — every frame fires
 *     automatically as the backend produces it.
 *   - **step**: events queue in pendingEvents instead of dispatching. The
 *     user clicks "Next" to advance one event at a time. Useful for video
 *     narration where each frame needs to be paused on.
 *
 *  Visual language matches the existing `.cad-btn` + `.cad-label` chrome
 *  (mono uppercase, letter-spaced, cream-paper background, transparent
 *  bordered buttons) so it reads as part of the same UI rather than a
 *  bolted-on demo widget. */
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
        gap: 10,
        padding: '8px 14px',
        background: 'oklch(0.97 0.006 85 / 0.95)',
        border: '1px solid var(--ink-3)',
        backdropFilter: 'blur(8px)',
        boxShadow: '0 4px 16px oklch(0.22 0.030 210 / 0.08)',
      }}
      aria-label="Debate playback controls"
    >
      <span className="cad-label">Playback</span>
      <button
        className={`cad-btn ${mode === 'auto' ? 'active' : ''}`}
        onClick={() => onModeChange('auto')}
        title="Events dispatch as they arrive (live debate pace)"
        style={{ padding: '6px 14px' }}
      >
        Auto
      </button>
      <button
        className={`cad-btn ${mode === 'step' ? 'active' : ''}`}
        onClick={() => onModeChange('step')}
        title="Queue events; advance manually one frame at a time (for video walkthroughs)"
        style={{ padding: '6px 14px' }}
      >
        Step
      </button>
      {mode === 'step' && (
        <>
          <div
            aria-hidden
            style={{
              width: 1,
              height: 18,
              background: 'var(--ink-3)',
              margin: '0 2px',
            }}
          />
          <button
            className={`cad-btn ${pendingCount > 0 ? 'primary' : ''}`}
            disabled={pendingCount === 0}
            onClick={onAdvance}
            title={
              pendingCount === 0
                ? 'Waiting for the next event…'
                : `Advance to next event (${pendingCount} pending)`
            }
            style={{ padding: '6px 14px' }}
          >
            ▶ Next
          </button>
          <span
            className="cad-meta"
            style={{ minWidth: 84, fontSize: 9, letterSpacing: '0.14em' }}
          >
            {pendingCount === 0 ? 'waiting…' : `${pendingCount} pending`}
          </span>
        </>
      )}
    </div>
  );
}
