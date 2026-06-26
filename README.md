# Hex Strategy — Catan (multiplayer webapp)

A multiplayer, browser-based Catan game. Players create or join a game with a
room code and play together over the internet. This is the **foundation** for a
larger "Catan + Risk + chess" strategy game — the custom war/expansion layers
are parked in the design docs until the base game is fun and shipped.

## Tech
- **Monorepo** (npm workspaces): `shared/` (types + rules), `server/` (authoritative
  game engine + Socket.IO), `client/` (React + Vite + SVG board).
- Server is the **single source of truth**; clients send action intents and the
  server validates, applies, and broadcasts a per-player view (opponents' hands hidden).

## Run it locally
```bash
npm install        # once
npm run dev        # starts server (:3001) + client (:5173)
```
Open **http://localhost:5173** in two browser windows (or two devices on your
network). In one: enter a name → **Create Game** → share the 4-letter room code.
In the other: enter a name + the code → **Join Game**. The host clicks **Start**.

## How to play (current build)
1. **Setup**: each player places 2 settlements + 2 roads (snake-draft order).
   Highlighted spots show legal placements; click a spot, then a road next to it.
2. **Your turn**: **Roll Dice** → tiles matching the roll pay their owners.
3. **Build**: pick Road / Settlement / City, then click a highlighted spot.
4. **End Turn**. First to **10 victory points** wins.

## What's built vs. parked
**Done (full base Catan):** board generation, lobby + room codes, reconnect-on-refresh,
snake-draft setup, dice production (with bank-shortage rule), building roads/settlements/
cities, **robber + discard-on-7 + stealing**, **bank/port trading**, **all 5 development
cards** (knight, road building, year of plenty, monopoly, victory point), **longest road
& largest army** bonuses, and **win at 10 points** (counting hidden VP cards).

**Parked (the custom game):** we-go simultaneous rounds, map saturation, the full
war system, AI opponents, 5–10 players, player-to-player trade negotiation UI. See
`files.zip` → `PROJECT-HANDOFF.md` and `war-system-design.md`.

> Known limitation: if the current player disconnects mid-turn the game waits for them
> to reconnect (their seat is held via the session token). No auto-skip yet.

## Tests
```bash
npm test           # vitest: board topology, rules, robber/trade/dev-cards, full engine flow
```

## Deploy (play over the internet)
The server serves the built client, so it deploys as **one Node service**.
```bash
npm run build      # builds client/dist + bundles server/dist
npm start          # NODE_ENV=production node server/dist/index.js
```
**Render.com (free):** push to GitHub → New + → Blueprint → pick this repo
(`render.yaml` is included). Build: `npm install && npm run build`, start: `npm start`.
The same setup works on Railway or Fly.io. Once live, share the URL — players create/join
with room codes exactly as in local dev.
