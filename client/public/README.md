# Static assets

**War music** plays from `client/public/war-metal.mp3` during a war (looping),
with the 🔊/🔇 toggle in the in-game header. If that file is absent, the game
falls back to a synthesized power-chord riff (`startWarRiff` in `client/src/sound.ts`),
so war music still works on the public deploy.

`war-metal.mp3` is **git-ignored on purpose** — only ship a track here that you
have the rights to redistribute (your own music or a CC0 / royalty-free loop).
Copyrighted tracks can stay local for personal play but must not be committed to
a public repo.
