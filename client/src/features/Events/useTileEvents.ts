import { format } from 'date-fns'
import { useEffect, useMemo, useReducer, useRef, useState } from 'react'

import { getEvents } from '@/api/events'
import { MAP_CONFIG } from '@/config/map'
import { useFilters } from '@/contexts/FiltersContext'
import { useMap } from '@/contexts/MapContext'
import { normalizeBbox } from '@/features/Map/normalizeBbox'
import type { EventCollection, EventFeature } from '@/types/event'

import { readTile, writeTile } from './tileStore'
import { bboxToTiles, makeTileKey, tileToBbox, tileSize } from './tileUtils'

// Module-level: persists within the tab session, shared across re-renders
const overviewTiles = new Map<string, EventFeature[]>()
const detailTiles = new Map<string, EventFeature[]>()
const inFlight = new Set<string>()
// Incremented on filter change to invalidate in-flight callbacks from the previous session
let tileSession = 0

function hashFilters(dateFrom: Date, dateTo: Date, types: string[]): string {
  return [
    format(dateFrom, 'yyyy-MM-dd'),
    format(dateTo, 'yyyy-MM-dd'),
    [...types].sort().join(','),
  ].join('|')
}

function mergeFeatures(memory: Map<string, EventFeature[]>): EventCollection {
  const byId = new Map<string, EventFeature>()
  for (const features of memory.values()) {
    for (const f of features) byId.set(f.id, f)
  }
  return { type: 'FeatureCollection', features: [...byId.values()], is_truncated: false }
}

export function useTileEvents() {
  const { bounds, zoom } = useMap()
  const { dateRange, eventTypes: types } = useFilters()
  const [version, bumpVersion] = useReducer((v) => v + 1, 0)
  const [isFetching, setIsFetching] = useState(false)
  const prevFiltersHashRef = useRef<string | null>(null)

  const isDetailed = zoom !== null && zoom > MAP_CONFIG.DETAIL_ZOOM_THRESHOLD

  const filtersHash = useMemo(
    () => hashFilters(dateRange.from, dateRange.to, types),
    [dateRange.from, dateRange.to, types]
  )

  // Clear in-memory tile caches when filters change so stale data never leaks
  useEffect(() => {
    if (prevFiltersHashRef.current !== null && prevFiltersHashRef.current !== filtersHash) {
      overviewTiles.clear()
      detailTiles.clear()
      tileSession++
      setIsFetching(false)
      bumpVersion()
    }
    prevFiltersHashRef.current = filtersHash
  }, [filtersHash])

  // Load tiles for the current viewport + 1-tile prefetch buffer
  useEffect(() => {
    if (!bounds || zoom === null) return

    const memory = isDetailed ? detailTiles : overviewTiles
    const band = isDetailed ? 'detail' : 'overview'
    const size = tileSize(isDetailed)
    const bbox = normalizeBbox(bounds)
    const needed = bboxToTiles(bbox, size, 1)

    const missing = needed.filter(({ x, y }) => {
      const key = makeTileKey(band, filtersHash, x, y)
      return !memory.has(key) && !inFlight.has(key)
    })

    if (missing.length === 0) return

    const session = tileSession
    let pending = missing.length
    setIsFetching(true)

    for (const { x, y } of missing) {
      const key = makeTileKey(band, filtersHash, x, y)
      const tileBbox = tileToBbox(x, y, size)
      inFlight.add(key)

      void (async () => {
        try {
          let features = await readTile(key)

          if (!features) {
            const collection = await getEvents({
              bbox: tileBbox,
              filters: { dateRange, types },
              fields: isDetailed ? ['date', 'type', 'sub_type', 'actor1', 'actor2'] : [],
              limit: isDetailed ? 5000 : 20000,
            })
            features = collection.features
            void writeTile(key, features)
          }

          if (tileSession === session) {
            memory.set(key, features)
            bumpVersion()
          }
        } catch {
          // network error or stale session — tile will be retried on next viewport change
        } finally {
          inFlight.delete(key)
          if (--pending === 0) setIsFetching(false)
        }
      })()
    }
  }, [bounds, zoom, filtersHash, isDetailed, dateRange, types])

  const data = useMemo(() => {
    const memory = isDetailed ? detailTiles : overviewTiles
    return memory.size > 0 ? mergeFeatures(memory) : null
    // version and isDetailed drive recomputation; memory refs are stable module-level Maps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, isDetailed])

  return { data, isFetching }
}
