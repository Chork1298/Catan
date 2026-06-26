import type { TileResource } from '@catan/shared';

// Single source of truth for resource colors, shared by the board tiles and the
// resource-hand chips so a wheat chip is the exact gold of a wheat hex, etc.
export const RESOURCE_FILL: Record<TileResource, string> = {
  wood: '#2e7d32',
  brick: '#bf5b30',
  sheep: '#8bc34a',
  wheat: '#e3b505',
  ore: '#78909c',
  desert: '#d7c79e',
};

// Readable text/icon color to lay over each fill (light fills get dark text).
export const RESOURCE_TEXT: Record<TileResource, string> = {
  wood: '#ffffff',
  brick: '#ffffff',
  sheep: '#15202b',
  wheat: '#15202b',
  ore: '#ffffff',
  desert: '#15202b',
};
