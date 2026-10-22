'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { FlightStatus } from '@prisma/client';
import { formatArs, formatFullDate, formatWeekday } from '@/lib/format';
import { shiftDate } from '@/lib/scheduling/calendar';
import type { ItineraryFlightView } from '@/lib/scheduling/itinerary';
import type { SerializedSchedule } from '@/lib/scheduling/serializers';
import { ApiRequestError, apiRequest, detailMessages } from '../api-client';
import CancelFlightModal from './cancel-flight-modal';

type Props = {
  date: string;
  today: string;
  flights: ItineraryFlightView[];
  drafts: SerializedSchedule[];
};

const STATUS_LABEL: Record<FlightStatus, string> = {
  SCHEDULED: 'Programado',
  BOARDING: 'Embarcando',
  DEPARTED: 'Despegó',
  ARRIVED: 'Arribó',
  DELAYED: 'Demorado',
  CANCELLED: 'Cancelado',
};

const ACTION_LINK =
  'inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-secondary hover:bg-surface-container text-xs font-semibold whitespace-nowrap transition-colors';

const DAY_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

const NAV_BUTTON =
  'flex items-center gap-1 px-space-md py-space-sm rounded-lg bg-surface-container text-primary hover:bg-surface-container-high font-label-lg text-label-lg transition-colors';

/** Planilla del dia (RF-01, US-12A): vuelos de una fecha, cancelación lógica y borradores. */
export default function ItineraryView({ date, today, flights, drafts }: Props) {
  const router = useRouter();
  const goTo = (d: string) => router.push(`/admin/itinerario?date=${d}`);

  const [cancellingFlight, setCancellingFlight] = useState<{ id: string; code: string } | null>(null);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);

  return (
    <div className="max-w-7xl mx-auto w-full px-4 sm:px-space-lg lg:px-margin pt-space-lg flex flex-col gap-space-lg">
      {successBanner && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 font-medium text-sm flex items-center justify-between shadow-sm animate-fade-in">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-emerald-600">check_circle</span>
            <span>{successBanner}</span>
          </div>
          <button
            type="button"
            onClick={() => setSuccessBanner(null)}
            className="text-emerald-700 hover:text-emerald-900 text-sm font-semibold ml-4"
          >
            ✕
          </button>
        </div>
      )}

      <section className="bg-surface-container-lowest rounded-xl p-space-lg shadow-md flex flex-col gap-space-md">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-space-md">
          <div>
            <span className="font-label-md text-label-md text-on-surface-variant">Administración / Itinerario</span>
            <h1 className="font-headline-lg text-headline-lg text-primary tracking-tight">Planilla del día</h1>
            <p className="font-body-md text-body-md text-on-surface-variant capitalize">
              {formatWeekday(date)} {formatFullDate(date)} · {flights.length} {flights.length === 1 ? 'vuelo' : 'vuelos'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-space-xs">
            <button className={NAV_BUTTON} onClick={() => goTo(shiftDate(date, -1))} type="button">
              <span className="material-symbols-outlined text-[18px]">chevron_left</span> Anterior
            </button>
            <input
              aria-label="Fecha"
              className="bg-surface-container-low px-space-md py-2 rounded-lg font-code-telemetry text-code-telemetry text-primary border-0"
              onChange={(e) => e.target.value && goTo(e.target.value)}
              type="date"
              value={date}
            />
            <button className={NAV_BUTTON} onClick={() => goTo(shiftDate(date, 1))} type="button">
              Siguiente <span className="material-symbols-outlined text-[18px]">chevron_right</span>
            </button>
            {date !== today && (
              <button className={NAV_BUTTON} onClick={() => goTo(today)} type="button">
                Hoy
              </button>
            )}
          </div>
        </div>

        {flights.length === 0 ? (
          <p className="font-body-md text-body-md text-on-surface-variant bg-surface-container-low p-space-md rounded-lg">
            No hay vuelos programados para este día.
          </p>
        ) : (
          <FlightsTable
            flights={flights}
            onCancelFlight={(flight) => setCancellingFlight({ id: flight.id, code: flight.code })}
          />
        )}
      </section>

      <DraftsSection drafts={drafts} onChanged={() => router.refresh()} />

      {cancellingFlight && (
        <CancelFlightModal
          flightId={cancellingFlight.id}
          flightCode={cancellingFlight.code}
          onClose={() => setCancellingFlight(null)}
          onSuccess={(res) => {
            setCancellingFlight(null);
            setSuccessBanner(
              `Vuelo ${cancellingFlight.code} cancelado con éxito por motivo "${res.reason}". Se afectaron ${res.affectedPassengersCount} pasajeros.`
            );
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function FlightsTable({
  flights,
  onCancelFlight,
}: {
  flights: ItineraryFlightView[];
  onCancelFlight: (f: ItineraryFlightView) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="bg-surface border-b-2 border-surface-container-high font-label-sm text-label-sm uppercase text-outline">
            <th className="p-space-sm">Salida</th>
            <th className="p-space-sm">Llegada</th>
            <th className="p-space-sm">Vuelo</th>
            <th className="p-space-sm">Ruta</th>
            <th className="p-space-sm">Avión</th>
            <th className="p-space-sm">Clases (disponibles / ofrecidos · precio)</th>
            <th className="p-space-sm">Estado</th>
            <th className="p-space-sm text-right">Acción</th>
          </tr>
        </thead>
        <tbody>
          {flights.map((f) => {
            const isCancelled = f.status === 'CANCELLED';

            return (
              <tr
                key={f.id}
                className={`border-b border-surface-container font-body-md text-body-md transition-colors ${
                  isCancelled
                    ? 'bg-red-50/40 hover:bg-red-50/70 text-on-surface-variant'
                    : 'hover:bg-surface-container-low'
                }`}
              >
                <td className="p-space-sm font-code-telemetry text-code-telemetry text-primary font-medium">
                  {f.departureTime}
                </td>
                <td className="p-space-sm font-code-telemetry text-code-telemetry">{f.arrivalTime}</td>
                <td className="p-space-sm font-code-telemetry text-code-telemetry font-bold text-secondary">
                  {f.code}
                </td>
                <td className="p-space-sm font-medium">
                  {f.route.origin.iataCode} → {f.route.destination.iataCode}
                </td>
                <td className="p-space-sm">
                  {f.aircraft.registration} <span className="text-on-surface-variant">· {f.aircraft.model}</span>
                </td>
                <td className="p-space-sm">
                  <ul className="flex flex-col gap-0.5 font-body-sm text-body-sm">
                    {f.classes.map((c) => (
                      <li key={c.fareId}>
                        <span className="font-bold">{c.name}</span>: {c.availableSeats}
                        {c.seatCapacity !== null && ` / ${c.seatCapacity}`} · {formatArs(c.price)}
                      </li>
                    ))}
                  </ul>
                </td>
                <td className="p-space-sm">
                  <span
                    className={`px-space-sm py-0.5 rounded-full font-label-sm text-label-sm uppercase font-semibold ${
                      isCancelled
                        ? 'bg-red-100 text-red-700 border border-red-200'
                        : 'bg-surface-container text-primary'
                    }`}
                  >
                    {STATUS_LABEL[f.status]}
                  </span>
                </td>
                <td className="p-space-sm text-right">
                  {isCancelled ? (
                    <Link
                      href={`/admin/contingencias/${f.id}`}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary text-white hover:bg-secondary/90 text-xs font-semibold shadow-sm transition-all"
                      title="Reasignar pasajeros afectados a un vuelo alternativo"
                    >
                      <span className="material-symbols-outlined text-[16px]">swap_horiz</span>
                      Reasignar
                    </Link>
                  ) : (
                    <div className="flex flex-col items-end gap-1">
                      {/* Cambio US-11A: la US-12 habia reemplazado esta columna y se perdieron los
                          links de Reprogramar (US-11B) y Editar tarifas (US-11A). Solo en vuelos
                          programados o demorados que todavia no salieron. */}
                      {f.reschedulable && (
                        <>
                          <Link className={ACTION_LINK} href={`/admin/vuelos/${f.id}/reprogramar`}>
                            <span className="material-symbols-outlined text-[16px]">edit_calendar</span>
                            Reprogramar
                          </Link>
                          <Link className={ACTION_LINK} href={`/admin/vuelos/${f.id}/tarifas`}>
                            <span className="material-symbols-outlined text-[16px]">sell</span>
                            Editar tarifas
                          </Link>
                        </>
                      )}
                      <button
                        type="button"
                        onClick={() => onCancelFlight(f)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-error hover:bg-error-container/60 text-xs font-semibold transition-colors border border-transparent hover:border-error/20"
                        title="Cancelar este vuelo y retirar de la oferta comercial"
                      >
                        <span className="material-symbols-outlined text-[15px]">cancel</span>
                        Cancelar
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function DraftsSection({ drafts, onChanged }: { drafts: SerializedSchedule[]; onChanged: () => void }) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<{ message: string; details: string[] } | null>(null);

  async function run(id: string, action: () => Promise<unknown>) {
    setBusyId(id);
    setError(null);
    try {
      await action();
      onChanged();
    } catch (err) {
      setError({
        message: err instanceof Error ? err.message : 'No se pudo completar la acción',
        details: err instanceof ApiRequestError ? detailMessages(err.details) : [],
      });
    } finally {
      setBusyId(null);
    }
  }

  const publish = (id: string) => run(id, () => apiRequest('POST', `/api/flight-schedules/${id}/publish`));
  const discard = (id: string) => {
    if (!window.confirm('¿Descartar este borrador? No se puede deshacer.')) return;
    void run(id, () => apiRequest('DELETE', `/api/flight-schedules/${id}`));
  };

  return (
    <section
      className="bg-surface-container-lowest rounded-xl p-space-lg shadow-md flex flex-col gap-space-md scroll-mt-28"
      id="borradores"
    >
      <h2 className="font-headline-md text-headline-md text-primary">Borradores sin publicar ({drafts.length})</h2>

      {error && (
        <div className="p-space-md rounded-xl bg-error-container text-on-error-container font-label-md text-label-md" role="alert">
          <span className="font-bold">{error.message}</span>
          {error.details.length > 0 && (
            <ul className="list-disc pl-5 font-body-sm text-body-sm">
              {error.details.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {drafts.length === 0 ? (
        <p className="font-body-md text-body-md text-on-surface-variant">No hay borradores pendientes.</p>
      ) : (
        <ul className="flex flex-col gap-space-sm">
          {drafts.map((d) => (
            <li
              key={d.id}
              className="flex flex-col lg:flex-row lg:items-center justify-between gap-space-sm bg-surface-container-low p-space-md rounded-xl"
            >
              <div className="flex flex-col gap-0.5 font-body-md text-body-md">
                <span className="font-bold text-primary">
                  {d.route.origin.iataCode} → {d.route.destination.iataCode} · {d.departureTime} · {d.aircraft.registration}
                </span>
                <span className="text-on-surface-variant">
                  {d.validFrom === d.validTo
                    ? formatFullDate(d.validFrom)
                    : `${formatFullDate(d.validFrom)} al ${formatFullDate(d.validTo)} · ${d.weekdays.map((w) => DAY_SHORT[w]).join(', ')}`}
                </span>
                <span className="text-on-surface-variant font-body-sm text-body-sm">
                  {d.fares.map((f) => `${f.name}: ${f.seats} a ${formatArs(f.price)}`).join(' · ')}
                </span>
              </div>
              <div className="flex flex-wrap gap-space-xs shrink-0">
                <Link className={NAV_BUTTON} href={`/admin/vuelos/nuevo?borrador=${d.id}`}>
                  Abrir
                </Link>
                <button
                  className="px-space-md py-space-sm rounded-lg bg-secondary-container text-on-secondary hover:bg-secondary font-label-lg text-label-lg disabled:opacity-50"
                  disabled={busyId !== null}
                  onClick={() => publish(d.id)}
                  type="button"
                >
                  {busyId === d.id ? 'Procesando…' : 'Publicar'}
                </button>
                <button
                  className="px-space-md py-space-sm rounded-lg text-error hover:bg-error-container font-label-lg text-label-lg disabled:opacity-50"
                  disabled={busyId !== null}
                  onClick={() => discard(d.id)}
                  type="button"
                >
                  Descartar
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
