import { useState } from 'react';
import { DebateTheatre } from './components/DebateTheatre';
import { Instructions } from './components/Instructions';
import { Intake } from './components/Intake';
import { NewCaseIntake } from './components/NewCaseIntake';
import { PlaybackControls } from './components/PlaybackControls';
import { useDebate } from './hooks/useDebate';

type LandingMode = 'picker' | 'intake' | 'instructions';

export default function App() {
  const {
    state,
    start,
    startWithCase,
    playDemo,
    cancel,
    playbackMode,
    pendingCount,
    setPlaybackMode,
    advance,
  } = useDebate();
  const [mode, setMode] = useState<LandingMode>('picker');

  if (state.phase === 'idle') {
    if (mode === 'intake') {
      return (
        <NewCaseIntake
          onCancel={() => setMode('picker')}
          onSubmit={(c) => {
            setMode('picker');
            startWithCase(c);
          }}
        />
      );
    }
    if (mode === 'instructions') {
      return <Instructions onBack={() => setMode('picker')} />;
    }
    return (
      <Intake
        onLaunch={(id) => start(id)}
        onNewCase={() => setMode('intake')}
        onShowInstructions={() => setMode('instructions')}
        onPlayDemo={(variant) => playDemo(variant)}
      />
    );
  }

  return (
    <>
      <DebateTheatre
        state={state}
        playbackMode={playbackMode}
        onReset={() => {
          cancel();
          setMode('picker');
        }}
      />
      <PlaybackControls
        mode={playbackMode}
        pendingCount={pendingCount}
        onModeChange={setPlaybackMode}
        onAdvance={advance}
      />
    </>
  );
}
