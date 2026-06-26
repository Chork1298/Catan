import { COSTS, RESOURCE_TYPES, type ResourceBag, type ResourceType } from '@catan/shared';

const ICON: Record<ResourceType, string> = { brick: '🧱', wood: '🌲', sheep: '🐑', wheat: '🌾', ore: '⛰️' };

function costIcons(cost: ResourceBag): string {
  return RESOURCE_TYPES.flatMap((r) => Array.from({ length: cost[r] }, () => ICON[r])).join('') || '—';
}

// Static reference of what each thing costs to build/buy.
export function CostCard() {
  const rows: Array<[string, ResourceBag]> = [
    ['Road', COSTS.road],
    ['Settlement', COSTS.settlement],
    ['City', COSTS.city],
    ['Dev card', COSTS.devCard],
  ];
  return (
    <div className="cost-card">
      <strong>Build costs</strong>
      <ul className="cost-list">
        {rows.map(([name, cost]) => (
          <li key={name}>
            <span>{name}</span>
            <span className="cost-icons">{costIcons(cost)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
