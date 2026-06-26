import { useEffect, useState } from 'react';
import { useGame } from './net.js';
import { Home } from './components/Home.js';
import { Lobby } from './components/Lobby.js';
import { GameView } from './components/GameView.js';

// Top-level router based on connection + game phase:
//   no view        -> Home (create/join)
//   phase 'lobby'  -> Lobby (waiting room)
//   otherwise      -> GameView (the board)
export function App() {
  const { view, logs, announcements, error, connected, createRoom, joinRoom, sendAction, leave } = useGame();

  // Show server action errors (e.g. "Army at capacity") as a brief toast in-game.
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => {
    if (!error) return;
    setToast(error);
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [error]);

  const overlays = (
    <>
      {view && !connected && <div className="conn-banner">Connection lost — reconnecting…</div>}
      {view && toast && <div className="error-toast">{toast}</div>}
    </>
  );

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
        {overlays}
        <Lobby
          view={view}
          onSetColor={(color) => sendAction({ type: 'setColor', color })}
          onSetTarget={(points) => sendAction({ type: 'setTargetPoints', points })}
          onSetMapSize={(radius) => sendAction({ type: 'setMapSize', radius })}
          onSetTurnTimer={(seconds) => sendAction({ type: 'setTurnTimer', seconds })}
          onSetTestMode={(enabled) => sendAction({ type: 'setTestMode', enabled })}
          onStart={() => sendAction({ type: 'startGame' })}
          onLeave={leave}
        />
      </main>
    );
  }

  return (
    <main className="game-shell">
      {overlays}
      <GameView view={view} logs={logs} announcements={announcements} onAction={sendAction} onLeave={leave} />
    </main>
  );
}
