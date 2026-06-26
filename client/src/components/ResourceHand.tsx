import { RESOURCE_TYPES, type ResourceBag } from '@catan/shared';
import { RESOURCE_FILL, RESOURCE_TEXT } from '../colors.js';

const ICON: Record<string, string> = {
  brick: '🧱',
  wood: '🌲',
  sheep: '🐑',
  wheat: '🌾',
  ore: '⛰️',
};

// Your own resource hand. Each chip's background matches that resource's hex tile
// color (wheat chip = wheat-tile gold, etc.).
export function ResourceHand({ resources, infinite }: { resources: ResourceBag; infinite?: boolean }) {
  return (
    <div className="hand">
      {RESOURCE_TYPES.map((r) => (
        <span
          key={r}
          className="hand-chip"
          title={r}
          style={{ background: RESOURCE_FILL[r], color: RESOURCE_TEXT[r] }}
        >
          {ICON[r]} {infinite ? '∞' : resources[r]}
        </span>
      ))}
    </div>
  );
}
