import { createStore, get, set } from 'idb-keyval'

import type { EventFeature } from '@/types/event'

// Bump this version to immediately invalidate all cached tiles (e.g. after a data re-import)
const CACHE_VERSION = 1
const TILE_TTL_MS = 4 * 60 * 60 * 1000 // 4h — short enough to pick up fresh imports same day

const store = createStore(`geotensions-tiles-v${CACHE_VERSION}`, 'tiles')

interface StoredTile {
  features: EventFeature[]
  fetchedAt: number
}

export async function readTile(key: string): Promise<EventFeature[] | null> {
  const entry = await get<StoredTile>(key, store)
  if (!entry || Date.now() - entry.fetchedAt > TILE_TTL_MS) return null
  return entry.features
}

export async function writeTile(key: string, features: EventFeature[]): Promise<void> {
  await set(key, { features, fetchedAt: Date.now() } satisfies StoredTile, store)
}
