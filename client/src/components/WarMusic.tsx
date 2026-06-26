import { useEffect, useRef } from 'react';

// The requested track, played via YouTube's official embedded player (legitimate —
// no downloading/ripping). Browsers require autoplay to start muted; the 🔊 toggle
// unmutes it (that counts as the user gesture). YouTube may show an ad first.
const VIDEO_ID = '-0bI6YyrmoI';

export interface WarMusicProps {
  atWar: boolean;
  muted: boolean;
}

export function WarMusic({ atWar, muted }: WarMusicProps) {
  const ref = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (!atWar) return;
    const iframe = ref.current;
    if (!iframe?.contentWindow) return;
    const cmd = (func: string) => iframe.contentWindow!.postMessage(JSON.stringify({ event: 'command', func, args: [] }), '*');
    // Let the player finish loading, then apply the mute state.
    const t = setTimeout(() => {
      if (muted) cmd('mute');
      else { cmd('unMute'); cmd('playVideo'); }
    }, 500);
    return () => clearTimeout(t);
  }, [atWar, muted]);

  if (!atWar) return null;
  const src =
    `https://www.youtube.com/embed/${VIDEO_ID}` +
    `?enablejsapi=1&autoplay=1&mute=1&loop=1&playlist=${VIDEO_ID}&controls=1&modestbranding=1&playsinline=1`;

  return (
    <div className="war-music">
      <iframe
        ref={ref}
        src={src}
        title="War music"
        width="240"
        height="135"
        frameBorder="0"
        allow="autoplay; encrypted-media"
        allowFullScreen
      />
    </div>
  );
}
