import { skipToken, useQuery } from '@tanstack/react-query'
import type { LngLatBounds, Map as MapLibreMap } from 'maplibre-gl'
import { useEffect, useState } from 'react'

import { getEvents } from '@/api/events'
import { useFilters } from '@/contexts/FiltersContext'
import { useMap } from '@/contexts/MapContext'
import { normalizeBbox } from '@/features/Map/normalizeBbox'
import { useThrottled } from '@/hooks/useThrottled'
import type { BBox, EventsQuery } from '@/types/event'

/** Throttle interval during map movement */
const MOVE_THROTTLE_MS = 250

/** Maximum events for the light layer */
const LIGHT_LIMIT = 2500

/** Snap bbox outward to a grid so small pans reuse the same query cache */
function snapBbox(bbox: BBox, precision: number): BBox {
  const snap = (n: number, op: (x: number) => number) =>
    op(Number((n * precision).toFixed(10))) / precision
  return [
    snap(bbox[0], Math.floor),
    snap(bbox[1], Math.floor),
    snap(bbox[2], Math.ceil),
    snap(bbox[3], Math.ceil),
  ]
}

export function useLightEvents() {
  const { map, zoom } = useMap()
  // Use live bounds from map 'move' events during movement (MapContext only updates on 'moveend')
  const liveBounds = useLiveBounds(map)
  const { dateRange, eventTypes: types } = useFilters()

  // Track whether the map is actively moving
  const isMoving = useIsMoving(map)

  // Throttle the bbox during movement
  const throttledBbox = isMoving && liveBounds ? snapBbox(normalizeBbox(liveBounds), 2) : undefined
  const throttledBboxValue = useThrottled(throttledBbox, MOVE_THROTTLE_MS)

  let query: EventsQuery | undefined
  if (throttledBboxValue && zoom !== null) {
    query = {
      bbox: throttledBboxValue,
      filters: { dateRange, types },
      fields: [],
      limit: LIGHT_LIMIT,
    }
  }

  return useQuery({
    queryKey: ['light-events', query],
    queryFn: query ? () => getEvents(query) : skipToken,
    placeholderData: (previousData) => previousData,
    gcTime: 30000,
    enabled: !!query,
  })
}

/**
 * Subscribe to the map's `movestart` and `moveend` events to track active movement.
 * Returns true while the map is in a move cycle.
 */
function useIsMoving(map: MapLibreMap | null): boolean {
  const [moving, setMoving] = useState(false)

  useEffect(() => {
    if (!map) return

    const onStart = () => setMoving(true)
    const onEnd = () => setMoving(false)

    map.on('movestart', onStart)
    map.on('moveend', onEnd)

    return () => {
      map.off('movestart', onStart)
      map.off('moveend', onEnd)
    }
  }, [map])

  return moving
}

/**
 * Subscribe to the map's `move` events to get live bounds during movement.
 * Falls back to `null` when map is null.
 */
function useLiveBounds(map: MapLibreMap | null): LngLatBounds | null {
  const [liveBounds, setLiveBounds] = useState<LngLatBounds | null>(null)

  useEffect(() => {
    if (!map) return

    const handleMove = () => setLiveBounds(map.getBounds())
    map.on('move', handleMove)

    return () => {
      map.off('move', handleMove)
    }
  }, [map])

  return liveBounds
}
