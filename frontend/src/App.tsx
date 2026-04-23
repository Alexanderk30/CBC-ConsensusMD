import { DebateTheatre } from './components/DebateTheatre';
import { Intake } from './components/Intake';
import { useDebate } from './hooks/useDebate';

export default function App() {
  const { state, start, cancel } = useDebate();

  if (state.phase === 'idle') {
    return <Intake onLaunch={(id) => start(id)} />;
  }

  return <DebateTheatre state={state} onReset={cancel} />;
}
