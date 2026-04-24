import { get, set } from 'idb-keyval'

import type { EventFeature } from '@/types/event'

const TILE_TTL_MS = 24 * 60 * 60 * 1000

interface StoredTile {
  features: EventFeature[]
  fetchedAt: number
}

export async function readTile(key: string): Promise<EventFeature[] | null> {
  const entry = await get<StoredTile>(key)
  if (!entry || Date.now() - entry.fetchedAt > TILE_TTL_MS) return null
  return entry.features
}

export async function writeTile(key: string, features: EventFeature[]): Promise<void> {
  await set(key, { features, fetchedAt: Date.now() } satisfies StoredTile)
}
