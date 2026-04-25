import { format } from 'date-fns'
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'

import { getEvents } from '@/api/events'
import { MAP_CONFIG } from '@/config/map'
import { useFilters } from '@/contexts/FiltersContext'
import { useMap } from '@/contexts/MapContext'
import { normalizeBbox } from '@/features/Map/normalizeBbox'
import type { EventCollection, EventFeature } from '@/types/event'

import { readTile, writeTile } from './tileStore'
import {
  bboxToTiles,
  DETAIL_TILE_SIZE,
  makeTileKey,
  OVERVIEW_TILE_SIZE,
  tileToBbox,
  WORLD_TILE_SIZE,
  WORLD_ZOOM_THRESHOLD,
} from './tileUtils'

// ── Module-level state ────────────────────────────────────────────────────────
// Persists within the tab session and survives React re-renders.

// Three bands: world (≤4), overview (5–10), detail (>10).
// Kept separate so world-zoom and regional-zoom heatmaps don't bleed into each other —
// overview tiles have 4× higher event density than world tiles and would saturate the
// world heatmap if accumulated in the same map.
const worldTiles = new Map<string, EventFeature[]>()
const overviewTiles = new Map<string, EventFeature[]>()
const detailTiles = new Map<string, EventFeature[]>()

// Cap displayed events per viewport to prevent visual overload in dense areas.
// Applied per tile so every geographic region contributes proportionally.
const MAX_DISPLAY_EVENTS = 20_000

// Fetch coordination
const inFlight = new Set<string>()
let tileSession = 0

// Caps concurrent API requests so the server isn't overwhelmed at world zoom.
function createSemaphore(max: number) {
  let current = 0
  const queue: Array<() => void> = []

  return {
    acquire(): Promise<() => void> {
      return new Promise((resolve) => {
        const tryRun = () => {
          if (current < max) {
            current++
            resolve(() => {
              current--
              if (queue.length > 0) queue.shift()!()
            })
          } else {
            queue.push(tryRun)
          }
        }
        tryRun()
      })
    },
  }
}

const semaphore = createSemaphore(4)

// ── Helpers ───────────────────────────────────────────────────────────────────

function hashFilters(dateFrom: Date, dateTo: Date, types: string[]): string {
  return [
    format(dateFrom, 'yyyy-MM-dd'),
    format(dateTo, 'yyyy-MM-dd'),
    [...types].sort().join(','),
  ].join('|')
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useTileEvents() {
  const { bounds, zoom } = useMap()
  const { dateRange, eventTypes: types } = useFilters()
  const [version, bumpVersion] = useReducer((v) => v + 1, 0)
  const [isFetching, setIsFetching] = useState(false)
  const prevFiltersHashRef = useRef<string | null>(null)
  const boundsRef = useRef(bounds)
  boundsRef.current = bounds

  // Coalesce rapid tile arrivals (parallel fetches) into a single re-render per 80ms
  const batchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const batchedBump = useCallback(() => {
    if (batchTimerRef.current) return
    batchTimerRef.current = setTimeout(() => {
      batchTimerRef.current = null
      bumpVersion()
    }, 80)
  }, [])

  const isDetailed = zoom !== null && zoom > MAP_CONFIG.DETAIL_ZOOM_THRESHOLD
  const isWorld = zoom !== null && zoom <= WORLD_ZOOM_THRESHOLD

  const filtersHash = useMemo(
    () => hashFilters(dateRange.from, dateRange.to, types),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dateRange.from.getTime(), dateRange.to.getTime(), types.join(',')]
  )

  // On filter change: clear all in-memory caches and invalidate in-flight callbacks
  useEffect(() => {
    if (prevFiltersHashRef.current !== null && prevFiltersHashRef.current !== filtersHash) {
      worldTiles.clear()
      overviewTiles.clear()
      detailTiles.clear()
      tileSession++
      setIsFetching(false)
      bumpVersion()
    }
    prevFiltersHashRef.current = filtersHash
  }, [filtersHash])

  // Load tiles covering the current viewport
  useEffect(() => {
    if (!bounds || zoom === null) return

    const memory = isDetailed ? detailTiles : isWorld ? worldTiles : overviewTiles
    const band = isDetailed ? 'detail' : isWorld ? 'world' : 'overview'

    // Tile parameters per zoom band
    const size = isDetailed ? DETAIL_TILE_SIZE : isWorld ? WORLD_TILE_SIZE : OVERVIEW_TILE_SIZE
    const buffer = isWorld ? 0 : 1 // no prefetch buffer at world zoom (too many tiles)
    const limit = isDetailed ? 5_000 : isWorld ? 5_000 : 20_000

    const bbox = normalizeBbox(bounds)
    const needed = bboxToTiles(bbox, size, buffer)

    const missing = needed.filter(({ x, y }) => {
      const key = makeTileKey(band, filtersHash, x, y)
      return !memory.has(key) && !inFlight.has(key)
    })

    if (missing.length === 0) {
      batchedBump() // viewport changed but all tiles cached — refresh display
      return
    }

    const session = tileSession
    let pending = missing.length
    setIsFetching(true)

    for (const { x, y } of missing) {
      const key = makeTileKey(band, filtersHash, x, y)
      const tileBbox = tileToBbox(x, y, size)
      inFlight.add(key)

      void (async () => {
        const release = await semaphore.acquire()
        try {
          let features = await readTile(key)

          if (!features) {
            const collection = await getEvents({
              bbox: tileBbox,
              filters: { dateRange, types },
              fields: isDetailed ? ['date', 'type', 'sub_type', 'actor1', 'actor2'] : [],
              limit,
            })
            features = collection.features
            void writeTile(key, features)
          }

          if (tileSession === session) {
            memory.set(key, features)
            batchedBump()
          }
        } catch {
          // network error or stale session — will retry on next viewport change
        } finally {
          release()
          inFlight.delete(key)
          if (--pending === 0) setIsFetching(false)
        }
      })()
    }
  }, [bounds, zoom, filtersHash, isDetailed, isWorld, dateRange, types, batchedBump])

  const data = useMemo((): EventCollection | null => {
    const currentBounds = boundsRef.current
    if (!currentBounds) return null

    const memory = isDetailed ? detailTiles : isWorld ? worldTiles : overviewTiles
    const band = isDetailed ? 'detail' : isWorld ? 'world' : 'overview'
    const size = isDetailed ? DETAIL_TILE_SIZE : isWorld ? WORLD_TILE_SIZE : OVERVIEW_TILE_SIZE
    const buffer = isWorld ? 0 : 1
    const inView = bboxToTiles(normalizeBbox(currentBounds), size, buffer)

    const perTileCap = Math.ceil(MAX_DISPLAY_EVENTS / Math.max(inView.length, 1))
    const features: EventFeature[] = []
    for (const { x, y } of inView) {
      const tileFeatures = memory.get(makeTileKey(band, filtersHash, x, y))
      if (tileFeatures) features.push(...tileFeatures.slice(0, perTileCap))
    }

    return features.length > 0 ? { type: 'FeatureCollection', features, is_truncated: false } : null
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, isDetailed, isWorld, filtersHash])

  return { data, isFetching }
}
