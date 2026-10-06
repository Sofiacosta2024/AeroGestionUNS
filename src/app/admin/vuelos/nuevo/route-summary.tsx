import type { CabinClass } from '@prisma/client';
import { formatDuration } from '@/lib/format';
import { CABIN_LABEL, CABIN_ORDER } from '@/lib/scheduling/capacity';
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
  const sortedCabins = aircraft
    ? (Object.entries(aircraft.cabins) as [CabinClass, number][]).sort(
        ([a], [b]) => CABIN_ORDER.indexOf(a) - CABIN_ORDER.indexOf(b),
      )
    : [];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-md items-stretch">
      <div className="lg:col-span-8 bg-primary-container text-surface-container-lowest rounded-xl p-space-lg shadow-md relative overflow-hidden flex flex-col justify-between gap-space-md">
        <div className="absolute -right-8 -bottom-8 opacity-10 pointer-events-none select-none">
          <span className="material-symbols-outlined text-[160px] leading-none select-none">flight_takeoff</span>
        </div>
        <span className="font-label-sm text-label-sm text-tertiary-fixed uppercase z-10 font-bold tracking-wider">
          {route ? `Ruta ${route.code}` : 'Seleccioná origen y destino'}
        </span>
        <div className="z-10 flex items-center justify-between gap-space-md">
          <AirportBlock airport={origin} align="start" />
          
          {/* Trayecto aéreo con avion centrado y rotado hacia el destino */}
          <div className="flex-1 max-w-xs sm:max-w-sm flex flex-col items-center px-2">
            <div className="relative w-full h-10 flex items-center justify-center">
              {/* Linea de trayectoria */}
              <div className="w-full border-t-2 border-dashed border-white/30" />
              
              {/* Circulo del avion centrado sobre la linea */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-9 h-9 rounded-full bg-[#E11D48] flex items-center justify-center shadow-lg shadow-black/40 ring-4 ring-[#1F0A43]">
                  <span className="material-symbols-outlined text-white text-[19px] rotate-90 leading-none">
                    flight
                  </span>
                </div>
              </div>
            </div>

            {/* Pill de duracion con margen para no encimarse */}
            <span className="mt-2 bg-black/40 border border-white/10 px-3.5 py-1 rounded-full font-label-sm text-xs font-semibold text-tertiary-fixed text-center backdrop-blur-sm shadow-sm">
              {route
                ? `Duración ${formatDuration(route.durationMinutes)}${route.distanceKm ? ` · ${route.distanceKm} km` : ''}`
                : 'Duración: —'}
            </span>
          </div>

          <AirportBlock airport={destination} align="end" />
        </div>
      </div>

      <div className="lg:col-span-4 bg-surface-container-lowest rounded-xl p-space-lg shadow-md flex flex-col justify-between gap-space-md border border-slate-100">
        <div>
          <div className="flex items-center justify-between mb-3">
            <span className="font-label-sm text-label-sm uppercase tracking-wider text-outline font-bold">
              Aeronave asignada
            </span>
            {aircraft && (
              <span className="bg-[#1F0A43]/10 text-[#1F0A43] border border-[#1F0A43]/20 px-2.5 py-0.5 rounded-lg font-code-telemetry text-xs font-bold">
                {aircraft.registration}
              </span>
            )}
          </div>
          <div className="flex items-center gap-space-md">
            <div className="w-14 h-14 rounded-2xl bg-slate-100/90 border border-slate-200/80 flex items-center justify-center text-[#1F0A43] shrink-0 shadow-xs">
              <span className="material-symbols-outlined text-[32px]">airlines</span>
            </div>
            {aircraft ? (
              <div className="flex flex-col min-w-0">
                <span className="font-headline-sm text-lg font-bold text-slate-900 truncate">
                  {aircraft.model}
                </span>
                <span className="font-code-telemetry text-xs text-slate-500 font-medium">
                  Total: <strong className="font-bold text-slate-800">{aircraft.totalSeats}</strong> asientos
                </span>
              </div>
            ) : (
              <div className="flex flex-col">
                <span className="font-body-md text-sm font-semibold text-slate-600">
                  Todavía no se eligió avión
                </span>
                <span className="text-xs text-slate-400">
                  Elegí una aeronave en el formulario
                </span>
              </div>
            )}
          </div>
        </div>

        {aircraft && sortedCabins.length > 0 ? (
          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100">
            {sortedCabins.map(([cabin, seats]) => {
              const isFirst = cabin === 'FIRST';
              return (
                <div
                  key={cabin}
                  className={`flex flex-col px-3 py-2 rounded-xl border transition-all ${
                    isFirst
                      ? 'bg-purple-50/70 border-purple-200/80 text-purple-950'
                      : 'bg-slate-50 border-slate-200/80 text-slate-800'
                  }`}
                >
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1">
                    {isFirst && <span className="material-symbols-outlined text-[13px] text-amber-500">stars</span>}
                    {CABIN_LABEL[cabin]}
                  </span>
                  <span className="font-code-telemetry text-sm font-extrabold mt-0.5">
                    {seats} <span className="text-[11px] font-normal text-slate-500">asientos</span>
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="p-2.5 rounded-xl border border-dashed border-slate-200 text-center text-xs text-slate-400 bg-slate-50/50">
            Sin aeronave configurada
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
