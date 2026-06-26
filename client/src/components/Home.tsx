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

  return (
    <div className="home">
      <h1>Hex Strategy — Catan</h1>
      <p className="muted">{connected ? 'Connected.' : 'Connecting…'}</p>

      <label>
        Your name
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Damian" maxLength={16} />
      </label>

      <div className="home-actions">
        <button disabled={!name.trim() || !connected} onClick={() => onCreate(name)}>
          Create Game
        </button>

        <div className="join-row">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="ROOM CODE"
            maxLength={4}
            className="code-input"
          />
          <button disabled={!name.trim() || code.length < 4 || !connected} onClick={() => onJoin(code, name)}>
            Join Game
          </button>
        </div>
      </div>

      {error && <p className="error">{error}</p>}
    </div>
  );
}
