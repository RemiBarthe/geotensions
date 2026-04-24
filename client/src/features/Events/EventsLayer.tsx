import { Layer, Source } from 'react-map-gl/maplibre'

import { MAP_CONFIG } from '@/config/map'

import { useTileEvents } from './useTileEvents'

function EventsLayer() {
  const { data: events, isFetching } = useTileEvents()

  return (
    <>
      {isFetching && (
        <div className="fixed inset-x-0 top-0 z-50 h-0.5">
          <div className="animate-progress h-full w-1/4 bg-neutral-400" />
        </div>
      )}

      {events && (
        <Source
          id="events-source"
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

          <Layer
            id="events-layer"
            type="circle"
            minzoom={MAP_CONFIG.DETAIL_ZOOM_THRESHOLD}
            paint={{
              'circle-color': '#11b4da',
              'circle-radius': 6,
              'circle-stroke-width': 1,
              'circle-stroke-color': '#fff',
            }}
          />
        </Source>
      )}
    </>
  )
}

export { EventsLayer }
