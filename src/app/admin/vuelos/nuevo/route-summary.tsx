import { formatDuration } from '@/lib/format';
import { CABIN_LABEL } from '@/lib/scheduling/capacity';
import type { FormAircraft, FormAirport, FormRoute } from '@/lib/scheduling/form-data';

type Props = {
  origin: FormAirport | null;
  destination: FormAirport | null;
  route: FormRoute | null;
  aircraft: FormAircraft | null;
};

/**
 * Banner de ruta y tarjeta de aeronave del diseno de Stitch, solo con datos reales
 * (se omiten la telemetria y los datos operativos inventados del mock).
 */
export default function RouteSummary({ origin, destination, route, aircraft }: Props) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-md">
      <div className="lg:col-span-8 bg-primary-container text-surface-container-lowest rounded-xl p-space-lg shadow-md relative overflow-hidden flex flex-col justify-between gap-space-md">
        <div className="absolute -right-8 -bottom-8 opacity-10 pointer-events-none">
          <span className="material-symbols-outlined text-[200px]">flight_takeoff</span>
        </div>
        <span className="font-label-sm text-label-sm text-tertiary-fixed uppercase z-10">
          {route ? `Ruta ${route.code}` : 'Seleccioná origen y destino'}
        </span>
        <div className="z-10 flex items-center justify-between gap-space-md">
          <AirportBlock airport={origin} align="start" />
          <div className="flex-1 flex flex-col items-center gap-space-xs">
            <div className="relative w-full flex items-center">
              <div className="w-full h-1 bg-primary rounded-full" />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-8 h-8 rounded-full bg-secondary-container flex items-center justify-center shadow-lg">
                  <span className="material-symbols-outlined text-surface-container-lowest text-[18px]">flight</span>
                </div>
              </div>
            </div>
            <span className="bg-primary/80 px-space-sm py-0.5 rounded-full font-label-sm text-label-sm text-tertiary-fixed text-center">
              {route
                ? `Duración ${formatDuration(route.durationMinutes)}${route.distanceKm ? ` · ${route.distanceKm} km` : ''}`
                : 'Duración: —'}
            </span>
          </div>
          <AirportBlock airport={destination} align="end" />
        </div>
      </div>

      <div className="lg:col-span-4 bg-surface-container-lowest rounded-xl p-space-lg shadow-md flex flex-col gap-space-sm">
        <div className="flex items-center justify-between">
          <span className="font-label-sm text-label-sm uppercase tracking-wider text-outline">Aeronave asignada</span>
          {aircraft && (
            <span className="bg-surface-container px-space-sm py-1 rounded text-primary font-code-telemetry text-code-telemetry">
              {aircraft.registration}
            </span>
          )}
        </div>
        <div className="flex items-center gap-space-md">
          <div className="w-14 h-14 rounded-xl bg-surface-container-low flex items-center justify-center text-primary shrink-0">
            <span className="material-symbols-outlined text-[32px]">airlines</span>
          </div>
          {aircraft ? (
            <div className="flex flex-col">
              <span className="font-headline-sm text-headline-sm text-primary">{aircraft.model}</span>
              <span className="font-code-telemetry text-code-telemetry text-secondary">
                Total: {aircraft.totalSeats} asientos
              </span>
            </div>
          ) : (
            <span className="font-body-md text-body-md text-on-surface-variant">Todavía no se eligió avión.</span>
          )}
        </div>
        {aircraft && (
          <div className="bg-surface-container-low p-space-sm rounded-lg flex flex-wrap gap-x-space-md gap-y-space-xs">
            {Object.entries(aircraft.cabins).map(([cabin, seats]) => (
              <span key={cabin} className="font-label-md text-label-md text-primary">
                Cabina {CABIN_LABEL[cabin as keyof typeof CABIN_LABEL]}: {seats}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function AirportBlock({ airport, align }: { airport: FormAirport | null; align: 'start' | 'end' }) {
  return (
    <div className={`flex flex-col ${align === 'end' ? 'items-end text-right' : 'items-start'}`}>
      <span className="font-headline-xl text-headline-xl font-bold tracking-tight">{airport?.iataCode ?? '---'}</span>
      <span className="font-label-md text-label-md text-primary-fixed-dim">{airport?.city ?? ''}</span>
    </div>
  );
}
