import { useState } from 'react';
import { RESOURCE_TYPES, emptyBag, type ResourceBag, type ResourceType } from '@catan/shared';

const ICON: Record<string, string> = { brick: '🧱', wood: '🌲', sheep: '🐑', wheat: '🌾', ore: '⛰️' };

export interface ResourceSelectProps {
  title: string;
  /** Exact number of resources that must be chosen. */
  target: number;
  /** Optional per-resource maximum (e.g. your current hand for discarding). */
  caps?: ResourceBag;
  confirmLabel?: string;
  onConfirm: (bag: ResourceBag) => void;
  onCancel?: () => void;
}

// Modal for picking an exact number of resources (discard, Year of Plenty, …).
export function ResourceSelect({ title, target, caps, confirmLabel = 'Confirm', onConfirm, onCancel }: ResourceSelectProps) {
  const [bag, setBag] = useState<ResourceBag>(emptyBag());
  const chosen = (Object.values(bag) as number[]).reduce((a, b) => a + b, 0);

  const change = (r: ResourceType, delta: number) => {
    setBag((prev) => {
      const next = { ...prev };
      const cap = caps ? caps[r] : Infinity;
      next[r] = Math.max(0, Math.min(cap, next[r] + delta));
      return next;
    });
  };

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <h3>{title}</h3>
        <p className={chosen === target ? '' : 'muted'}>
          Selected {chosen} / {target}
        </p>
        <div className="picker-rows">
          {RESOURCE_TYPES.map((r) => (
            <div key={r} className="picker-row">
              <span>{ICON[r]} {r}</span>
              <div className="stepper">
                <button onClick={() => change(r, -1)} disabled={bag[r] === 0}>−</button>
                <span className="count">{bag[r]}</span>
                <button onClick={() => change(r, +1)} disabled={(caps && bag[r] >= caps[r]) || chosen >= target}>+</button>
              </div>
            </div>
          ))}
        </div>
        <div className="modal-actions">
          <button disabled={chosen !== target} onClick={() => onConfirm(bag)}>{confirmLabel}</button>
          {onCancel && <button className="link-button" onClick={onCancel}>Cancel</button>}
        </div>
      </div>
    </div>
  );
}
