# Static assets

**War music is now played via an embedded YouTube player** (`client/src/components/WarMusic.tsx`)
using the official YouTube embed — no audio is downloaded or bundled (that would
violate copyright + YouTube's Terms of Service). It starts when a war begins and
stops when it ends; the 🔊/🔇 button in the in-game header unmutes/mutes it
(browsers require the first unmute to come from a click).

To use a different song, change `VIDEO_ID` in `WarMusic.tsx`.

If you'd rather self-host a royalty-free / CC0 loop instead of YouTube, drop a
`war-metal.ogg` here and swap `WarMusic` back to an `<audio src="/war-metal.ogg" loop>`.
