import type { PlayerView } from '@catan/shared';

export interface LobbyProps {
  view: PlayerView;
  onStart: () => void;
  onLeave: () => void;
}

// Pre-game lobby: shows the room code to share, the seated players, and (for the
// host) a Start button once at least 2 players are present.
export function Lobby({ view, onStart, onLeave }: LobbyProps) {
  const { game, youId } = view;
  const me = game.players.find((p) => p.id === youId);
  const isHost = !!me?.isHost;
  const canStart = isHost && game.players.length >= 2;

  return (
    <div className="lobby">
      <h1>Lobby</h1>
      <p>
        Room code: <strong className="room-code">{game.roomCode}</strong>{' '}
        <span className="muted">— share this so others can join.</span>
      </p>

      <ul className="player-list">
        {game.players.map((p) => (
          <li key={p.id}>
            <span className="swatch" style={{ background: p.color }} />
            {p.name}
            {p.isHost && <span className="tag">host</span>}
            {p.id === youId && <span className="tag">you</span>}
            {!p.connected && <span className="tag muted">offline</span>}
          </li>
        ))}
      </ul>

      {isHost ? (
        <button disabled={!canStart} onClick={onStart}>
          {canStart ? 'Start Game' : 'Need at least 2 players'}
        </button>
      ) : (
        <p className="muted">Waiting for the host to start…</p>
      )}

      <button className="link-button" onClick={onLeave}>
        Leave
      </button>
    </div>
  );
}
