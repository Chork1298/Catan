import { useMemo } from 'react';
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
}: BoardProps) {
  const vb = useMemo(() => boardViewBox(board), [board]);

  return (
    <svg
      className="board"
      viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
      width="100%"
      style={{ maxWidth: 720, display: 'block' }}
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
          <line
            key={edge.id}
            x1={pa.x}
            y1={pa.y}
            x2={pb.x}
            y2={pb.y}
            stroke={color}
            strokeWidth={edge.road ? 7 : 10}
            strokeLinecap="round"
            opacity={edge.road ? 1 : highlighted ? 0.6 : 0}
            style={{ cursor: onEdgeClick ? 'pointer' : 'default' }}
            onClick={() => onEdgeClick?.(edge.id)}
          />
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
          </g>
        );
      })}
    </svg>
  );
}
