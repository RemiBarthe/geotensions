/* eslint-disable react-refresh/only-export-components */
import type { LngLatBounds, Map as MapLibreMap } from 'maplibre-gl'
import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react'

interface MapContextValue {
  map: MapLibreMap | null
  bounds: LngLatBounds | null
  zoom: number | null
  registerMap: (map: MapLibreMap) => void
}

const MapContext = createContext<MapContextValue | null>(null)

function useMap() {
  const context = useContext(MapContext)

  if (!context) {
    throw new Error('useMap must be used within a MapProvider')
  }

  return context
}

function MapProvider({ children }: PropsWithChildren) {
  const [map, setMap] = useState<MapLibreMap | null>(null)
  const [bounds, setBounds] = useState<LngLatBounds | null>(null)
  const [zoom, setZoom] = useState<number | null>(null)

  const registerMap = useCallback((m: MapLibreMap) => setMap(m), [])

  useEffect(() => {
    if (!map) return

    const sync = () => {
      setBounds(map.getBounds())
      setZoom(map.getZoom())
    }

    // Debounced sync during movement: starts tile fetching before the pan settles,
    // so data arrives by the time the user stops. Minimap has its own direct move listener.
    // Throttle (not debounce): fires every 150ms during movement so tiles start
    // loading before the pan settles, rather than only after it stops.
    let throttleTimer: ReturnType<typeof setTimeout> | null = null
    const syncThrottled = () => {
      if (throttleTimer) return
      throttleTimer = setTimeout(() => {
        throttleTimer = null
        sync()
      }, 150)
    }

    map.once('load', sync)
    map.on('move', syncThrottled)
    map.on('moveend', sync)

    return () => {
      map.off('move', syncThrottled)
      map.off('moveend', sync)
      if (throttleTimer) clearTimeout(throttleTimer)
    }
  }, [map])

  return (
    <MapContext.Provider value={{ map, bounds, zoom, registerMap }}>{children}</MapContext.Provider>
  )
}

export { MapProvider, useMap }
