import type { BBox } from '@/types/event'

// Zoom bands determine tile granularity and request strategy
export const WORLD_ZOOM_THRESHOLD = 4   // ≤ 4 : world overview (few large tiles)
export const WORLD_TILE_SIZE = 90       // ~4–8 tiles for a world-scale viewport
export const OVERVIEW_TILE_SIZE = 20    // ~4–12 tiles for a country-scale viewport
export const DETAIL_TILE_SIZE = 2       // ~4–9 tiles for a city-scale viewport

export interface TileCoord {
  x: number
  y: number
}

/** Tile coords covering bbox, extended by `buffer` tiles on each side */
export function bboxToTiles(bbox: BBox, size: number, buffer = 1): TileCoord[] {
  const [west, south, east, north] = bbox
  const tiles: TileCoord[] = []

  for (let x = Math.floor(west / size) - buffer; x <= Math.floor(east / size) + buffer; x++) {
    for (
      let y = Math.floor(south / size) - buffer;
      y <= Math.floor(north / size) + buffer;
      y++
    ) {
      const tb = tileToBbox(x, y, size)
      if (tb[0] < tb[2] && tb[1] < tb[3]) tiles.push({ x, y })
    }
  }

  return tiles
}

export function tileToBbox(x: number, y: number, size: number): BBox {
  return [
    Math.max(x * size, -180),
    Math.max(y * size, -90),
    Math.min((x + 1) * size, 180),
    Math.min((y + 1) * size, 90),
  ]
}

export function makeTileKey(band: string, filtersHash: string, x: number, y: number): string {
  return `${band}|${filtersHash}|${x}|${y}`
}
