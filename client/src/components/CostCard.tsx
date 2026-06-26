import { COSTS, RESOURCE_TYPES, type ResourceBag, type ResourceType } from '@catan/shared';

const ICON: Record<ResourceType, string> = { brick: '🧱', wood: '🌲', sheep: '🐑', wheat: '🌾', ore: '⛰️' };

function costIcons(cost: ResourceBag): string {
  return RESOURCE_TYPES.flatMap((r) => Array.from({ length: cost[r] }, () => ICON[r])).join('') || '—';
}

// What each thing costs and how many victory points it's worth.
export function CostCard() {
  const rows: Array<[string, ResourceBag, string]> = [
    ['Road', COSTS.road, '+2 VP if longest'],
    ['Settlement', COSTS.settlement, '1 VP'],
    ['City', COSTS.city, '2 VP'],
    ['Dev card', COSTS.devCard, 'some = 1 VP'],
  ];
  return (
    <div className="cost-card">
      <strong>Build costs / VP</strong>
      <ul className="cost-list">
        {rows.map(([name, cost, vp]) => (
          <li key={name}>
            <span>{name}</span>
            <span className="cost-icons">{costIcons(cost)}</span>
            <span className="cost-vp muted">{vp}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
