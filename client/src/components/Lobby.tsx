import { PLAYER_COLORS, type PlayerColor, type PlayerView } from '@catan/shared';

export interface LobbyProps {
  view: PlayerView;
  onSetColor: (color: PlayerColor) => void;
  onSetTarget: (points: number) => void;
  onStart: () => void;
  onLeave: () => void;
}

// Pre-game lobby: room code to share, seated players, a color picker (no two
// players may share a color), a host-set win target, and the host's Start button.
export function Lobby({ view, onSetColor, onSetTarget, onStart, onLeave }: LobbyProps) {
  const { game, youId } = view;
  const me = game.players.find((p) => p.id === youId);
  const isHost = !!me?.isHost;
  const canStart = isHost && game.players.length >= 2;
  const takenByOthers = new Set(game.players.filter((p) => p.id !== youId).map((p) => p.color));

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
            <span className="pname" style={{ color: p.color }}>{p.name}</span>
            {p.isHost && <span className="tag">host</span>}
            {p.id === youId && <span className="tag">you</span>}
            {!p.connected && <span className="tag muted">offline</span>}
          </li>
        ))}
      </ul>

      <div className="color-picker">
        <span>Your color:</span>
        {PLAYER_COLORS.map((c) => {
          const taken = takenByOthers.has(c);
          const mine = me?.color === c;
          return (
            <button
              key={c}
              className={`color-swatch ${mine ? 'mine' : ''}`}
              style={{ background: c }}
              disabled={taken}
              title={taken ? `${c} (taken)` : c}
              onClick={() => onSetColor(c)}
            />
          );
        })}
      </div>

      <div className="target-row">
        <span>Points to win: <strong>{game.targetPoints}</strong></span>
        {isHost && (
          <span className="target-buttons">
            <button className="mini" onClick={() => onSetTarget(game.targetPoints - 1)} disabled={game.targetPoints <= 3}>−</button>
            <button className="mini" onClick={() => onSetTarget(game.targetPoints + 1)} disabled={game.targetPoints >= 20}>+</button>
          </span>
        )}
      </div>

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
