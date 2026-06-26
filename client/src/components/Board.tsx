import { useMemo, useRef, useState } from 'react';
import { boardViewBox, hexCorners, type Board as BoardData } from '@catan/shared';
import { RESOURCE_FILL } from '../colors.js';

// High-production numbers (6 and 8) are drawn red, as on a real board.
const isHotNumber = (n?: number) => n === 6 || n === 8;

// Catan probability pips: how many ways two dice make this number (out of 36).
// 2/12 -> 1 dot ... 6/8 -> 5 dots. Equals 6 - |7 - n|.
const pipCount = (n: number) => 6 - Math.abs(7 - n);

export interface BoardProps {
  board: BoardData;
  /** Optional interaction hooks (used by later milestones). */
  onTileClick?: (tileId: string) => void;
  onVertexClick?: (vertexId: string) => void;
  onEdgeClick?: (edgeId: string) => void;
  /** Visual highlights, keyed by id. */
  highlightVertices?: Set<string>;
  highlightEdges?: Set<string>;
  highlightTiles?: Set<string>;
  /** Player id -> CSS color, for roads and buildings. */
  playerColors?: Record<string, string>;
  /** Player id -> display name, for hover tooltips. */
  playerNames?: Record<string, string>;
  /** Brighten the board when it's the viewer's turn. */
  active?: boolean;
}

export function Board({
  board,
  onTileClick,
  onVertexClick,
  onEdgeClick,
  highlightVertices,
  highlightEdges,
  highlightTiles,
  playerColors = {},
  playerNames = {},
  active = false,
}: BoardProps) {
  const baseVb = useMemo(() => boardViewBox(board), [board]);
  const svgRef = useRef<SVGSVGElement>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number } | null>(null);

  // Effective viewBox: zoom toward the board center, offset by pan (in board units).
  const ew = baseVb.w / zoom;
  const eh = baseVb.h / zoom;
  const cx = baseVb.x + baseVb.w / 2 + pan.x;
  const cy = baseVb.y + baseVb.h / 2 + pan.y;
  const viewBox = `${cx - ew / 2} ${cy - eh / 2} ${ew} ${eh}`;

  const zoomBy = (factor: number) => setZoom((z) => Math.min(3, Math.max(0.6, z * factor)));
  const onWheel = (e: React.WheelEvent) => zoomBy(e.deltaY < 0 ? 1.12 : 0.89);
  const onDown = (e: React.MouseEvent) => { drag.current = { x: e.clientX, y: e.clientY }; };
  const onMove = (e: React.MouseEvent) => {
    if (!drag.current || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const dx = ((e.clientX - drag.current.x) / rect.width) * ew;
    const dy = ((e.clientY - drag.current.y) / rect.height) * eh;
    setPan((p) => ({ x: p.x - dx, y: p.y - dy }));
    drag.current = { x: e.clientX, y: e.clientY };
  };
  const endDrag = () => { drag.current = null; };

  return (
    <div className={`board-wrap ${active ? 'active' : ''}`}>
    <svg
      ref={svgRef}
      className="board"
      viewBox={viewBox}
      width="100%"
      height="100%"
      preserveAspectRatio="xMidYMid meet"
      onWheel={onWheel}
      onMouseDown={onDown}
      onMouseMove={onMove}
      onMouseUp={endDrag}
      onMouseLeave={endDrag}
    >
      {/* Tiles */}
      {Object.values(board.tiles).map((tile) => {
        const pts = hexCorners(tile.center)
          .map((p) => `${p.x},${p.y}`)
          .join(' ');
        const hasRobber = board.robberTileId === tile.id;
        return (
          <g key={tile.id} onClick={() => onTileClick?.(tile.id)} style={{ cursor: onTileClick ? 'pointer' : 'default' }}>
            <polygon
              points={pts}
              fill={RESOURCE_FILL[tile.resource]}
              stroke={highlightTiles?.has(tile.id) ? '#ffd54f' : '#15202b'}
              strokeWidth={highlightTiles?.has(tile.id) ? 5 : 2}
            />
            {tile.numberToken !== undefined && (
              <>
                <circle cx={tile.center.x} cy={tile.center.y} r={17} fill="#f4ecd8" stroke="#15202b" />
                <text
                  x={tile.center.x}
                  y={tile.center.y + 1}
                  textAnchor="middle"
                  fontSize={15}
                  fontWeight={700}
                  fill={isHotNumber(tile.numberToken) ? '#c62828' : '#15202b'}
                >
                  {tile.numberToken}
                </text>
                {/* Probability pips — more dots = more likely to be rolled. */}
                {Array.from({ length: pipCount(tile.numberToken) }).map((_, i, arr) => (
                  <circle
                    key={i}
                    cx={tile.center.x + (i - (arr.length - 1) / 2) * 3.6}
                    cy={tile.center.y + 10}
                    r={1.5}
                    fill={isHotNumber(tile.numberToken) ? '#c62828' : '#15202b'}
                  />
                ))}
              </>
            )}
            {hasRobber && (
              <circle cx={tile.center.x} cy={tile.center.y} r={20} fill="rgba(20,20,20,0.55)" stroke="#000" />
            )}
          </g>
        );
      })}

      {/* Ports */}
      {Object.values(board.ports).map((port) => {
        const [a, b] = port.vertexIds;
        const va = board.vertices[a].position;
        const vb2 = board.vertices[b].position;
        const mx = (va.x + vb2.x) / 2;
        const my = (va.y + vb2.y) / 2;
        const label = port.type === 'generic' ? '3:1' : `2:1 ${port.type[0].toUpperCase()}`;
        return (
          <g key={port.id}>
            <circle cx={mx} cy={my} r={11} fill="#0d47a1" stroke="#fff" />
            <text x={mx} y={my + 3} textAnchor="middle" fontSize={7} fill="#fff">
              {label}
            </text>
          </g>
        );
      })}

      {/* Edges (road slots) */}
      {Object.values(board.edges).map((edge) => {
        const [a, b] = edge.vertexIds;
        const pa = board.vertices[a].position;
        const pb = board.vertices[b].position;
        const highlighted = highlightEdges?.has(edge.id);
        const color = edge.road ? playerColors[edge.road] ?? '#000' : highlighted ? '#ffd54f' : 'transparent';
        return (
          <g key={edge.id} style={{ cursor: onEdgeClick ? 'pointer' : 'default' }} onClick={() => onEdgeClick?.(edge.id)}>
            {/* Dark casing under built roads so any player color reads on any tile. */}
            {edge.road && (
              <line x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y} stroke="#0c1218" strokeWidth={11} strokeLinecap="round" />
            )}
            <line
              x1={pa.x}
              y1={pa.y}
              x2={pb.x}
              y2={pb.y}
              stroke={color}
              strokeWidth={edge.road ? 7 : 10}
              strokeLinecap="round"
              opacity={edge.road ? 1 : highlighted ? 0.6 : 0}
            />
          </g>
        );
      })}

      {/* Vertices (settlement/city spots) */}
      {Object.values(board.vertices).map((v) => {
        const highlighted = highlightVertices?.has(v.id);
        if (!v.building && !highlighted && !onVertexClick) return null;
        const fill = v.building ? playerColors[v.building.owner] ?? '#000' : highlighted ? '#ffd54f' : 'transparent';
        const r = v.building?.type === 'city' ? 10 : 7;
        return (
          <g key={v.id} onClick={() => onVertexClick?.(v.id)} style={{ cursor: onVertexClick ? 'pointer' : 'default' }}>
            {v.building && (
              <title>{v.building.name ?? `${playerNames?.[v.building.owner] ?? 'A player'}'s ${v.building.type}`}</title>
            )}
            <circle
              cx={v.position.x}
              cy={v.position.y}
              r={r}
              fill={fill}
              stroke={v.building || highlighted ? '#15202b' : 'transparent'}
              strokeWidth={2}
              opacity={v.building ? 1 : highlighted ? 0.9 : 0.001}
            />
            {v.building?.type === 'city' && (
              <rect x={v.position.x - 4} y={v.position.y - 4} width={8} height={8} fill="#15202b" />
            )}
            {!!v.building?.garrison?.length && (
              <g>
                <title>{v.building.garrison.map((s) => s.name).join(', ')}</title>
                <circle cx={v.position.x + 11} cy={v.position.y - 11} r={7.5} fill="#1b1b1b" stroke="#fff" strokeWidth={1} />
                <text x={v.position.x + 11} y={v.position.y - 8} textAnchor="middle" fontSize={9} fontWeight={700} fill="#fff">
                  {v.building.garrison.length}
                </text>
              </g>
            )}
          </g>
        );
      })}
    </svg>
      <div className="zoom-controls">
        <button onClick={() => zoomBy(1.2)} title="Zoom in">+</button>
        <button onClick={() => zoomBy(1 / 1.2)} title="Zoom out">−</button>
        <button onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }} title="Reset view">⟲</button>
      </div>
    </div>
  );
}
