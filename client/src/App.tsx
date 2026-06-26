import { useGame } from './net.js';
import { Home } from './components/Home.js';
import { Lobby } from './components/Lobby.js';
import { GameView } from './components/GameView.js';

// Top-level router based on connection + game phase:
//   no view        -> Home (create/join)
//   phase 'lobby'  -> Lobby (waiting room)
//   otherwise      -> GameView (the board)
export function App() {
  const { view, logs, error, connected, createRoom, joinRoom, sendAction, leave } = useGame();

  if (!view) {
    return (
      <main className="app-shell">
        <Home onCreate={createRoom} onJoin={joinRoom} error={error} connected={connected} />
      </main>
    );
  }

  if (view.game.phase === 'lobby') {
    return (
      <main className="app-shell">
        <Lobby view={view} onStart={() => sendAction({ type: 'startGame' })} onLeave={leave} />
      </main>
    );
  }

  return (
    <main className="app-shell wide">
      <GameView view={view} logs={logs} onAction={sendAction} onLeave={leave} />
    </main>
  );
}
