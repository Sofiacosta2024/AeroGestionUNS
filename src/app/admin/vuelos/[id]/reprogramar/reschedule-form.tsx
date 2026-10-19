'use client';

import Link from 'next/link';
import { useState } from 'react';
import { formatDuration, formatFullDate, formatWeekday } from '@/lib/format';
import { lastSchedulableDate, type SchedulingRules } from '@/lib/scheduling/config';
import type { FormAircraft, FormRoute } from '@/lib/scheduling/form-data';
import type { FlightItinerary, RescheduleEvaluation, RescheduleResult } from '@/lib/scheduling/reschedule';
import type { RescheduleInput } from '@/lib/validation';
import { apiRequest, errorDetails } from '../../../api-client';
import { useLiveCheck } from '../../../use-live-check';
import { MessageList, Panel } from '../../nuevo/check-panel';
import { arrivalPreview } from '../../nuevo/form-model';
import { INPUT, SELECT, SMALL_LABEL } from '../../nuevo/schedule-section';

type Props = {
  flight: FlightItinerary;
  routes: FormRoute[];
  aircraft: FormAircraft[];
  rules: SchedulingRules;
  today: string;
};

const fullDay = (date: string) => `${formatWeekday(date)} ${formatFullDate(date)}`;
/** yyyy-mm-dd -> dd/mm/yyyy, como en el WF-11B. */
const shortDate = (date: string) => date.split('-').reverse().join('/');
const unique = (messages: string[]) => [...new Set(messages)];

const INVALID = 'border-rose-500 ring-2 ring-rose-200';

/**
 * Pantalla de reprogramacion (US-11B, WF-11B y WF-11B-E1): nueva fecha, hora de salida,
 * aeronave y ruta de un vuelo publicado. La llegada se calcula. El chequeo en vivo marca
 * cada error debajo de su campo (el avion ocupado, debajo de la aeronave) y avisa a cuantos
 * pasajeros alcanza el cambio.
 */
export default function RescheduleForm({ flight, routes, aircraft, rules, today }: Props) {
  const [input, setInput] = useState<RescheduleInput>(flight.current);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<{ message: string; details: string[] } | null>(null);
  const [done, setDone] = useState<RescheduleResult | null>(null);

  const complete = Boolean(input.date && input.departureTime && input.routeId && input.aircraftId);
  const check = useLiveCheck<RescheduleEvaluation>(
    `/api/admin/flights/${flight.id}/itinerary/check`,
    flight.reschedulable && complete ? input : null,
  );
  const result = check.result;
  const route = routes.find((r) => r.id === input.routeId);
  const arrival = arrivalPreview(input.departureTime, route?.durationMinutes);
  const canSubmit = result?.canSave === true && !check.loading && !submitting;

  // Cada error va debajo de su campo, como en el WF-11B-E1.
  const conflictsOf = (kind: string) => result?.conflicts.filter((c) => c.kind === kind).map((c) => c.message) ?? [];
  const issuesOf = (campo: string) => result?.issues.filter((i) => i.campo === campo).map((i) => i.mensaje) ?? [];
  const scheduleErrors = unique([...check.errors, ...issuesOf('departureTime'), ...conflictsOf('DEPARTURE_GAP')]);
  const aircraftErrors = unique([...conflictsOf('AIRCRAFT_BUSY'), ...issuesOf('aircraftId')]);
  const routeErrors = issuesOf('routeId');
  const resized = result?.classes.filter((c) => c.newCapacity !== c.capacity) ?? [];

  const update = (patch: Partial<RescheduleInput>) => {
    setError(null);
    setInput((i) => ({ ...i, ...patch }));
  };

  async function save() {
    setSubmitting(true);
    setError(null);
    try {
      setDone(await apiRequest<RescheduleResult>('PATCH', `/api/admin/flights/${flight.id}/itinerary`, input));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setError({ message: err instanceof Error ? err.message : 'No se pudo reprogramar', details: errorDetails(err) });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-5xl mx-auto w-full px-4 sm:px-space-lg lg:px-margin pt-space-lg flex flex-col gap-space-lg">
      <FlightHeader flight={flight} />

      {done ? (
        <DonePanel result={done} />
      ) : !flight.reschedulable ? (
        <Panel icon="block" tone="warning">
          Este vuelo ya no se puede reprogramar: solo se reprograman vuelos programados o demorados que todavía no
          salieron.{' '}
          <Link className="underline font-bold" href={`/admin/itinerario?date=${flight.current.date}`}>
            Volver a la planilla
          </Link>
        </Panel>
      ) : (
        <>
          <section className="bg-surface-container-lowest border border-slate-200 rounded-2xl p-space-lg shadow-sm flex flex-col gap-space-md">
            <h2 className="text-lg font-extrabold text-indigo-950">Nuevo itinerario</h2>

            <div className="flex flex-col gap-space-xs">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-space-md">
                <label className="flex flex-col gap-space-xs">
                  <span className={SMALL_LABEL}>Nueva fecha</span>
                  <input
                    className={`${INPUT} ${scheduleErrors.length > 0 ? INVALID : ''}`}
                    max={lastSchedulableDate(today)}
                    min={today}
                    onChange={(e) => update({ date: e.target.value })}
                    type="date"
                    value={input.date}
                  />
                </label>
                <label className="flex flex-col gap-space-xs">
                  <span className={SMALL_LABEL}>Hora de salida</span>
                  <input
                    className={`${INPUT} ${scheduleErrors.length > 0 ? INVALID : ''}`}
                    onChange={(e) => update({ departureTime: e.target.value })}
                    type="time"
                    value={input.departureTime}
                  />
                </label>
                {/* La llegada se calcula con la duracion de la ruta: no se edita (decision de la US-11B). */}
                <div className="flex flex-col gap-space-xs">
                  <span className={SMALL_LABEL}>Hora de llegada</span>
                  <div
                    aria-live="polite"
                    className="w-full bg-slate-100 border border-slate-200 px-3.5 py-2.5 rounded-xl flex items-center gap-2 text-sm"
                    title="Se calcula con la duración de la ruta"
                  >
                    <span className="font-medium text-slate-800">{arrival?.time ?? '—'}</span>
                    {arrival?.nextDay && (
                      <span className="bg-rose-100 border border-rose-200 text-[#E11D48] text-[10px] font-black px-1.5 py-0.5 rounded-md uppercase">
                        +1 día
                      </span>
                    )}
                    <span className="ml-auto text-xs font-bold text-indigo-950">Calculada</span>
                  </div>
                </div>
              </div>
              <FieldErrors messages={scheduleErrors} />
            </div>

            <label className="flex flex-col gap-space-xs">
              <span className={SMALL_LABEL}>Aeronave</span>
              <select
                className={`${SELECT} ${aircraftErrors.length > 0 ? INVALID : ''}`}
                onChange={(e) => update({ aircraftId: e.target.value })}
                value={input.aircraftId}
              >
                {!aircraft.some((a) => a.id === flight.current.aircraftId) && (
                  <option value={flight.current.aircraftId}>
                    {flight.aircraft.model} · {flight.aircraft.registration} (no operativo)
                  </option>
                )}
                {aircraft.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.model} · {a.registration} ({a.totalSeats} butacas)
                  </option>
                ))}
              </select>
            </label>
            <FieldErrors messages={aircraftErrors} />

            {/* Fuera del WF-11B: la US-11B tambien permite cambiar la ruta (decidido con el equipo). */}
            <label className="flex flex-col gap-space-xs">
              <span className={SMALL_LABEL}>Ruta</span>
              <select
                className={`${SELECT} ${routeErrors.length > 0 ? INVALID : ''}`}
                onChange={(e) => update({ routeId: e.target.value })}
                value={input.routeId}
              >
                {!routes.some((r) => r.id === flight.current.routeId) && (
                  <option value={flight.current.routeId}>
                    {flight.route.origin} → {flight.route.destination} · {flight.route.code} (inactiva)
                  </option>
                )}
                {routes.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.origin} → {r.destination} · {r.code} · {formatDuration(r.durationMinutes)}
                  </option>
                ))}
              </select>
            </label>
            <FieldErrors messages={routeErrors} />

            {resized.length > 0 && (
              <Panel icon="airline_seat_recline_normal" title="Capacidad ajustada al avión nuevo" tone="warning">
                <MessageList
                  messages={resized.map(
                    (c) => `${c.name}: ${c.capacity} → ${c.newCapacity} asientos${c.sold > 0 ? ` (${c.sold} vendidos)` : ''}`,
                  )}
                />
              </Panel>
            )}

            {result && <PassengerNotice code={flight.code} passengers={result.affectedPassengers} />}

            <p className="flex items-start gap-1.5 text-xs text-slate-500">
              <span className="material-symbols-outlined text-[16px] text-slate-400">info</span>
              <span>
                Entre dos salidas del mismo aeropuerto tiene que haber al menos {rules.gapMinutes} min, y el mismo avión
                necesita {formatDuration(rules.turnaroundMinutes)} entre un aterrizaje y el siguiente despegue. La ruta solo
                se puede cambiar si el vuelo no tiene reservas activas, y la aeronave, si no hay asientos asignados ni
                bloqueados.
              </span>
            </p>
          </section>

          {error && (
            <div className="flex flex-col gap-space-xs p-space-md rounded-xl font-label-md text-label-md bg-error-container text-on-error-container" role="alert">
              <span className="font-bold">{error.message}</span>
              {error.details.length > 0 && <MessageList messages={error.details} />}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-end gap-3">
            <span className="text-sm text-slate-500">
              {check.loading
                ? 'Verificando…'
                : !complete
                  ? 'Completá la fecha y la hora de salida.'
                  : result && !result.changed
                    ? 'Modificá un valor para habilitar la actualización.'
                    : ''}
            </span>
            <Link
              className="px-5 py-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-bold text-sm shadow-sm transition-all"
              href={`/admin/itinerario?date=${flight.current.date}`}
            >
              Volver
            </Link>
            <button
              className="px-6 py-3 rounded-xl bg-[#E11D48] hover:bg-[#BE123C] text-white font-bold text-sm shadow-lg shadow-rose-900/30 transition-all active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed"
              disabled={!canSubmit}
              onClick={save}
              type="button"
            >
              {submitting ? 'Actualizando…' : 'Actualizar Itinerario del Vuelo'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/** Encabezado del WF-11B: codigo, titulo e itinerario programado. Mismo estilo que el WF-11A. */
function FlightHeader({ flight }: { flight: FlightItinerary }) {
  return (
    <div className="flex flex-col gap-space-sm">
      <div className="flex flex-wrap items-center gap-space-xs font-label-md text-label-md text-on-surface-variant">
        <span>Administración</span>
        <span className="text-outline-variant">/</span>
        <Link className="hover:underline" href={`/admin/itinerario?date=${flight.current.date}`}>
          Planilla del día
        </Link>
        <span className="text-outline-variant">/</span>
        <span className="text-secondary font-bold">Reprogramar</span>
      </div>
      <div className="flex flex-col gap-1 bg-[#2E1065] text-white p-space-lg rounded-xl shadow-md">
        <span className="w-fit px-2.5 py-0.5 rounded-full bg-rose-100 text-[#E11D48] font-mono text-xs font-black">
          {flight.code}
        </span>
        <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight">Reprogramación de itinerario</h1>
        <p className="text-sm text-purple-200">
          {flight.route.origin} → {flight.route.destination} · Programado: {shortDate(flight.current.date)} ·{' '}
          {flight.current.departureTime} → {flight.arrivalTime}
        </p>
      </div>
    </div>
  );
}

function FieldErrors({ messages }: { messages: string[] }) {
  if (messages.length === 0) return null;
  return (
    <div className="flex flex-col gap-0.5 -mt-space-xs" role="alert">
      {messages.map((m) => (
        <p key={m} className="flex items-start gap-1 text-sm font-semibold text-rose-700">
          <span className="material-symbols-outlined text-[18px]">warning</span>
          <span>{m}</span>
        </p>
      ))}
    </div>
  );
}

/** Aviso del WF-11B. El mail a los pasajeros lo envia RF-06 (Sprint 3). */
function PassengerNotice({ passengers, code }: { passengers: number; code: string }) {
  if (passengers === 0) {
    return <p className="text-sm text-slate-500">El vuelo no tiene pasajeros con reserva activa.</p>;
  }
  return (
    <p className="flex items-start gap-1.5 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-900">
      <span className="material-symbols-outlined text-[18px] text-amber-600">warning</span>
      <span>
        Este cambio notificará por email a{' '}
        <strong>
          {passengers} {passengers === 1 ? 'pasajero' : 'pasajeros'}
        </strong>{' '}
        con reserva activa en el vuelo {code}.
      </span>
    </p>
  );
}

function DonePanel({ result }: { result: RescheduleResult }) {
  return (
    <Panel icon="check_circle" title={`Vuelo ${result.code} reprogramado`} tone="success">
      <div className="flex flex-col gap-1">
        <span>
          {result.affectedPassengers === 0
            ? 'El vuelo no tenía pasajeros con reserva activa.'
            : `${result.affectedPassengers} ${result.affectedPassengers === 1 ? 'pasajero recibirá' : 'pasajeros recibirán'} la reprogramación.`}
        </span>
        <Link className="underline font-bold w-fit" href={`/admin/itinerario?date=${result.date}`}>
          Ver la planilla del {fullDay(result.date)}
        </Link>
      </div>
    </Panel>
  );
}
