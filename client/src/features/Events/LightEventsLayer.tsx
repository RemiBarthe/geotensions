import { Layer, Source } from 'react-map-gl/maplibre'

import { MAP_CONFIG } from '@/config/map'
import { useMap } from '@/contexts/MapContext'
import { useLightEvents } from '@/features/Events/useLightEvents'

function LightEventsLayer() {
  const { zoom } = useMap()
  const { data: events, isFetching } = useLightEvents()

  if (zoom !== null && zoom > MAP_CONFIG.DETAIL_ZOOM_THRESHOLD) return null

  return (
    <>
      {isFetching && (
        <div className="fixed inset-x-0 top-0 z-40 h-0.5">
          <div className="animate-progress h-full w-1/4 bg-neutral-400" />
        </div>
      )}

      {events && (
        <Source
          id="light-events-source"
          type="geojson"
          data={events}
          attribution='<a href="https://acleddata.com/" target="_blank">© ACLED (acleddata.com)</a>'
        >
          <Layer
            type="heatmap"
            maxzoom={MAP_CONFIG.DETAIL_ZOOM_THRESHOLD}
            paint={{
              'heatmap-radius': 8,
              'heatmap-color': [
                'interpolate',
                ['linear'],
                ['heatmap-density'],
                0,
                'rgba(0,0,0,0)',
                0.4,
                'rgba(255,255,255,0.25)',
                0.7,
                'rgba(255,255,255,0.6)',
                1,
                'rgba(255,255,255,0.9)',
              ],
            }}
          />
        </Source>
      )}
    </>
  )
}

export { LightEventsLayer }
