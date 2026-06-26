import { PLAYER_COLORS, type PlayerColor, type PlayerView } from '@catan/shared';

const MAPS: Array<{ radius: number; name: string; rec: string }> = [
  { radius: 2, name: 'Small', rec: '2–4' },
  { radius: 3, name: 'Medium', rec: '4–6' },
  { radius: 4, name: 'Large', rec: '6–8' },
  { radius: 5, name: 'Huge', rec: '8–10' },
];
const tilesForRadius = (r: number) => 1 + 3 * r * (r + 1);

export interface LobbyProps {
  view: PlayerView;
  onSetColor: (color: PlayerColor) => void;
  onSetTarget: (points: number) => void;
  onSetMapSize: (radius: number) => void;
  onStart: () => void;
  onLeave: () => void;
}

// Pre-game lobby: room code to share, seated players, a color picker (no two
// players may share a color), a host-set win target + map, and the Start button.
export function Lobby({ view, onSetColor, onSetTarget, onSetMapSize, onStart, onLeave }: LobbyProps) {
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

      <div className="map-picker">
        <span>Map:</span>
        {MAPS.map((m) => {
          const selected = game.mapRadius === m.radius;
          return (
            <button
              key={m.radius}
              className={`map-option ${selected ? 'sel' : ''}`}
              disabled={!isHost}
              onClick={() => onSetMapSize(m.radius)}
              title={`${tilesForRadius(m.radius)} tiles · recommended ${m.rec} players`}
            >
              {m.name}
              <span className="map-meta">{tilesForRadius(m.radius)} tiles · {m.rec}p</span>
            </button>
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
