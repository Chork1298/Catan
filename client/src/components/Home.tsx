import { useState } from 'react';

export interface HomeProps {
  onCreate: (name: string) => void;
  onJoin: (roomCode: string, name: string) => void;
  error: string | null;
  connected: boolean;
}

// Landing screen: create a new game (become host) or join an existing one by code.
export function Home({ onCreate, onJoin, error, connected }: HomeProps) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');

  const hasName = name.trim().length > 0;
  const hasCode = code.trim().length >= 4;

  // Explain *why* an action is unavailable, so the disabled button isn't a mystery.
  const createHint = !connected ? 'Connecting to server…' : !hasName ? 'Enter your name above first.' : '';
  const joinHint = !connected
    ? 'Connecting to server…'
    : !hasName
    ? 'Enter your name above first.'
    : !hasCode
    ? 'Enter the 4-letter room code.'
    : '';

  return (
    <div className="home">
      <h1>Hex Strategy — Catan</h1>
      <p className={connected ? 'status-ok' : 'status-wait'}>
        {connected ? '● Connected' : '○ Connecting…'}
      </p>

      <label>
        Your name <span className="req">(required)</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Damian"
          maxLength={16}
          autoFocus
        />
      </label>

      <div className="home-actions">
        <div className="action-block">
          <button disabled={!hasName || !connected} onClick={() => onCreate(name)}>
            Create Game
          </button>
          {createHint && <span className="hint">{createHint}</span>}
          <span className="muted small">Start a new game and get a code to share.</span>
        </div>

        <div className="divider">or</div>

        <div className="action-block">
          <div className="join-row">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="ROOM CODE"
              maxLength={4}
              className="code-input"
            />
            <button disabled={!hasName || !hasCode || !connected} onClick={() => onJoin(code, name)}>
              Join Game
            </button>
          </div>
          {joinHint && <span className="hint">{joinHint}</span>}
          <span className="muted small">Enter a friend's code to join their game.</span>
        </div>
      </div>

      {error && <p className="error">{error}</p>}
    </div>
  );
}
