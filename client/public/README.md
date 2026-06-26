# Static assets

Drop a royalty-free / CC0 heavy-metal loop here named **`war-metal.ogg`** (or
`.mp3` — update the `<audio src>` in `client/src/components/GameView.tsx`).

It plays on a loop during wars and stops when the war ends; there's a 🔊/🔇
toggle in the in-game header. If this file is absent, the game falls back to a
synthesized power-chord riff (`startWarRiff` in `client/src/sound.ts`), so war
music works even without a bundled track.

Good CC0 sources: incompetech.com, freepd.com, or opengameart.org (check the license).
