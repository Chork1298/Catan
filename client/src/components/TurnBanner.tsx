// Transient "Your Turn!" overlay, shown briefly when it becomes your turn.
export function TurnBanner({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <div className="turn-banner-wrap">
      <div className="turn-banner">🎲 Your Turn!</div>
    </div>
  );
}
