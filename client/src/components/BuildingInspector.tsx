import { useState } from 'react';
import type { Building } from '@catan/shared';

export interface BuildingInspectorProps {
  building: Building;
  onNameBuilding: (name: string) => void;
  onRenameSoldier: (soldierId: string, name: string) => void;
  onClose: () => void;
}

// Roleplay naming: rename a settlement/city and each soldier stationed there.
export function BuildingInspector({ building, onNameBuilding, onRenameSoldier, onClose }: BuildingInspectorProps) {
  const [name, setName] = useState(building.name ?? '');
  return (
    <div className="modal-backdrop">
      <div className="modal">
        <h3>Manage {building.type === 'city' ? 'City' : 'Settlement'}</h3>
        <label>
          Holding name
          <div className="confirm-row">
            <input value={name} maxLength={30} placeholder="e.g. Fort Kickass" onChange={(e) => setName(e.target.value)} />
            <button className="mini" onClick={() => onNameBuilding(name)}>Save</button>
          </div>
        </label>

        <h4 style={{ margin: '0.6rem 0 0.2rem' }}>Garrison ({building.garrison?.length ?? 0})</h4>
        {building.garrison && building.garrison.length > 0 ? (
          <ul className="soldier-list">
            {building.garrison.map((s) => (
              <SoldierRow key={s.id} id={s.id} name={s.name} onRename={onRenameSoldier} />
            ))}
          </ul>
        ) : (
          <p className="muted small">No soldiers here. Train some with the ⚔️ button.</p>
        )}

        <div className="modal-actions">
          <button onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}

function SoldierRow({ id, name, onRename }: { id: string; name: string; onRename: (id: string, name: string) => void }) {
  const [val, setVal] = useState(name);
  return (
    <li className="soldier-row">
      <span>🪖</span>
      <input value={val} maxLength={24} onChange={(e) => setVal(e.target.value)} />
      <button className="mini" disabled={!val.trim() || val === name} onClick={() => onRename(id, val)}>Rename</button>
    </li>
  );
}
