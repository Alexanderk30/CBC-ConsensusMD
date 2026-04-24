import { useState } from 'react';
import { DebateTheatre } from './components/DebateTheatre';
import { Intake } from './components/Intake';
import { NewCaseIntake } from './components/NewCaseIntake';
import { useDebate } from './hooks/useDebate';

type LandingMode = 'picker' | 'intake';

export default function App() {
  const { state, start, startWithCase, playDemo, cancel } = useDebate();
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
    return (
      <Intake
        onLaunch={(id) => start(id)}
        onNewCase={() => setMode('intake')}
        onPlayDemo={(variant) => playDemo(variant)}
      />
    );
  }

  return (
    <DebateTheatre
      state={state}
      onReset={() => {
        cancel();
        setMode('picker');
      }}
    />
  );
}
