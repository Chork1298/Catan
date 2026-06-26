import { RESOURCE_TYPES, type ResourceBag } from '@catan/shared';

const ICON: Record<string, string> = {
  brick: '🧱',
  wood: '🌲',
  sheep: '🐑',
  wheat: '🌾',
  ore: '⛰️',
};

// Your own resource hand (opponents' hands are shown only as totals elsewhere).
export function ResourceHand({ resources }: { resources: ResourceBag }) {
  return (
    <div className="hand">
      {RESOURCE_TYPES.map((r) => (
        <span key={r} className="hand-chip" title={r}>
          {ICON[r]} {resources[r]}
        </span>
      ))}
    </div>
  );
}
