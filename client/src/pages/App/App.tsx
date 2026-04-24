import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar'
import { FiltersProvider } from '@/contexts/FiltersContext'
import { MapProvider } from '@/contexts/MapContext'
import { EventsLayer, LightEventsLayer } from '@/features/Events'
import { Map, MapControls, Minimap } from '@/features/Map'
import { TimeBrush } from '@/features/TimeBrush'
import { useHasFinePointer } from '@/hooks/useHasFinePointer'
import { useIsMobile } from '@/hooks/useIsMobile'

import { AppSidebar } from './AppSidebar'

function App() {
  const isMobile = useIsMobile()
  const hasFinePointer = useHasFinePointer()

  return (
    <SidebarProvider>
      <FiltersProvider>
        <AppSidebar variant="floating" className="pr-0" />
        <SidebarTrigger className="z-10 m-4" />

        <MapProvider>
          <main className="fixed inset-0">
            <Map>
              <EventsLayer />
              <LightEventsLayer />
            </Map>

            <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-linear-to-b from-transparent to-black px-8 pb-12 before:absolute before:inset-0 before:mask-[linear-gradient(to_bottom,transparent,black)] before:backdrop-blur-xs">
              <TimeBrush className="pointer-events-auto mx-auto max-w-4xl" />
            </div>
          </main>

          <div className="fixed top-4 right-4 flex gap-2">
            {hasFinePointer && <MapControls />}
            {!isMobile && <Minimap />}
          </div>
        </MapProvider>
      </FiltersProvider>
    </SidebarProvider>
  )
}

export { App }
