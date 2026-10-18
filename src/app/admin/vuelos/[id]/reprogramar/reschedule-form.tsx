'use client';

import Link from 'next/link';
import { useState } from 'react';
import { formatDuration, formatFullDate, formatWeekday } from '@/lib/format';
import { lastSchedulableDate, type SchedulingRules } from '@/lib/scheduling/config';
import type { FormAircraft, FormRoute } from '@/lib/scheduling/form-data';
import type { FlightItinerary, RescheduleEvaluation, RescheduleResult } from '@/lib/scheduling/reschedule';
import type { RescheduleInput } from '@/lib/validation';
import { apiRequest, errorDetails } from '../../../api-client';
import { useLiveCheck, type CheckState } from '../../../use-live-check';
import { MessageList, Panel } from '../../nuevo/check-panel';
import { arrivalPreview } from '../../nuevo/form-model';
import { INPUT, SELECT, SMALL_LABEL } from '../../nuevo/schedule-section';
import SectionTitle from '../../nuevo/section-title';

type Props = {
  flight: FlightItinerary;
  routes: FormRoute[];
  aircraft: FormAircraft[];
  rules: SchedulingRules;
  today: string;
};

const fullDay = (date: string) => `${formatWeekday(date)} ${formatFullDate(date)}`;

/**
 * Pantalla de reprogramacion (US-11B, WF-11B): nueva fecha, hora de salida, ruta y avion
 * de un vuelo publicado. La llegada se calcula; el chequeo en vivo muestra choques,
 * pasajeros afectados y la capacidad por clase si cambia el avion.
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
  const route = routes.find((r) => r.id === input.routeId);
  const arrival = arrivalPreview(input.departureTime, route?.durationMinutes);
  const canSubmit = check.result?.canSave === true && !check.loading && !submitting;

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
          <section className="bg-surface-container-lowest rounded-xl p-space-lg shadow-md flex flex-col gap-space-lg">
            <SectionTitle number={1} title="Nuevo itinerario" subtitle="Fecha, horario, ruta y aeronave del vuelo" />

            <div className="grid grid-cols-1 md:grid-cols-3 gap-space-md bg-slate-50 border border-slate-200/70 p-space-md rounded-2xl">
              <label className="flex flex-col gap-space-xs">
                <span className={SMALL_LABEL}>Fecha del vuelo</span>
                <input
                  className={INPUT}
                  max={lastSchedulableDate(today)}
                  min={today}
                  onChange={(e) => update({ date: e.target.value })}
                  type="date"
                  value={input.date}
                />
              </label>
              <label className="flex flex-col gap-space-xs">
                <span className={SMALL_LABEL}>Salida programada (STD, hora ART)</span>
                <input
                  className={INPUT}
                  onChange={(e) => update({ departureTime: e.target.value })}
                  type="time"
                  value={input.departureTime}
                />
              </label>
              <div className="flex flex-col gap-space-xs">
                <span className={SMALL_LABEL}>Arribo estimado (STA)</span>
                <div className="w-full bg-indigo-50/70 border-2 border-dashed border-indigo-200 px-3.5 py-2 rounded-xl flex items-center gap-2 min-h-[42px]" aria-live="polite">
                  <span className="text-sm sm:text-base font-extrabold text-indigo-950 font-mono">{arrival?.time ?? '—'}</span>
                  {arrival?.nextDay && (
                    <span className="bg-rose-100 border border-rose-200 text-[#E11D48] text-[10px] font-black px-1.5 py-0.5 rounded-md uppercase">
                      +1 día
                    </span>
                  )}
                  <span className="text-[10px] text-indigo-600/80 font-medium ml-auto">Calculado con la duración de la ruta</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-space-md">
              <label className="flex flex-col gap-space-xs">
                <span className={SMALL_LABEL}>Ruta</span>
                <select className={SELECT} onChange={(e) => update({ routeId: e.target.value })} value={input.routeId}>
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
              <label className="flex flex-col gap-space-xs">
                <span className={SMALL_LABEL}>Aeronave</span>
                <select className={SELECT} onChange={(e) => update({ aircraftId: e.target.value })} value={input.aircraftId}>
                  {!aircraft.some((a) => a.id === flight.current.aircraftId) && (
                    <option value={flight.current.aircraftId}>
                      {flight.aircraft.registration} · {flight.aircraft.model} (no operativo)
                    </option>
                  )}
                  {aircraft.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.registration} · {a.model} · {a.totalSeats} asientos
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <p className="flex items-start gap-1.5 text-xs text-slate-500">
              <span className="material-symbols-outlined text-[16px] text-slate-400">info</span>
              <span>
                Se valida que entre dos salidas del mismo aeropuerto haya al menos {rules.gapMinutes} min y que el mismo avión
                tenga al menos {formatDuration(rules.turnaroundMinutes)} entre un aterrizaje y el siguiente despegue. La ruta
                solo se puede cambiar si el vuelo no tiene reservas activas, y el avión, si no hay asientos asignados ni
                bloqueados.
              </span>
            </p>
          </section>

          <CheckResult check={check} complete={complete} />

          {error && (
            <div className="flex flex-col gap-space-xs p-space-md rounded-xl font-label-md text-label-md bg-error-container text-on-error-container" role="alert">
              <span className="font-bold">{error.message}</span>
              {error.details.length > 0 && <MessageList messages={error.details} />}
            </div>
          )}

          <div className="bg-surface-container-lowest rounded-xl p-space-lg shadow-xl flex flex-wrap items-center justify-end gap-3">
            <Link
              className="px-4 py-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-bold text-sm shadow-sm transition-all flex items-center gap-1.5"
              href={`/admin/itinerario?date=${flight.current.date}`}
            >
              <span className="material-symbols-outlined text-[18px]">arrow_back</span>
              <span>Cancelar y volver</span>
            </Link>
            <button
              className="flex items-center gap-2 px-6 py-3.5 rounded-xl bg-[#E11D48] hover:bg-[#BE123C] text-white font-bold text-sm shadow-lg shadow-rose-900/30 transition-all active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed"
              disabled={!canSubmit}
              onClick={save}
              type="button"
            >
              <span className="material-symbols-outlined text-[20px]">update</span>
              <span>{submitting ? 'Actualizando…' : 'Actualizar Itinerario del Vuelo'}</span>
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function FlightHeader({ flight }: { flight: FlightItinerary }) {
  return (
    <div className="flex flex-col gap-space-xs bg-surface-container-lowest p-space-lg rounded-xl shadow-md">
      <div className="flex flex-wrap items-center gap-space-xs font-label-md text-label-md text-on-surface-variant">
        <span>Administración</span>
        <span className="text-outline-variant">/</span>
        <Link className="hover:underline" href={`/admin/itinerario?date=${flight.current.date}`}>
          Planilla del día
        </Link>
        <span className="text-outline-variant">/</span>
        <span className="text-secondary font-bold">Reprogramar vuelo</span>
      </div>
      <h1 className="font-headline-lg text-headline-lg text-primary tracking-tight">
        Reprogramar vuelo <span className="font-code-telemetry text-secondary">{flight.code}</span>
      </h1>
      <p className="font-body-md text-body-md text-on-surface-variant">
        Itinerario actual: {flight.route.origin} → {flight.route.destination} ·{' '}
        <span className="capitalize">{fullDay(flight.current.date)}</span> · {flight.current.departureTime} a{' '}
        {flight.arrivalTime} hs · {flight.aircraft.registration} ({flight.aircraft.model})
      </p>
    </div>
  );
}

function CheckResult({ check, complete }: { check: CheckState<RescheduleEvaluation>; complete: boolean }) {
  if (!complete) {
    return (
      <Panel icon="info" tone="neutral">
        Completá fecha, hora, ruta y avión para verificar disponibilidad.
      </Panel>
    );
  }
  if (check.loading && !check.result) {
    return (
      <Panel icon="progress_activity" tone="neutral">
        Verificando horarios, reservas y capacidad…
      </Panel>
    );
  }
  if (check.errors.length > 0) {
    return (
      <Panel icon="edit_note" title="Datos a corregir" tone="warning">
        <MessageList messages={check.errors} />
      </Panel>
    );
  }
  const result = check.result;
  if (!result) return null;

  const conflictMessages = [...new Set(result.conflicts.map((c) => c.message))];
  const resized = result.classes.filter((c) => c.newCapacity !== c.capacity);

  return (
    <div className="flex flex-col gap-space-sm">
      <Panel icon="groups" tone={result.affectedPassengers > 0 ? 'warning' : 'neutral'}>
        {result.affectedPassengers === 0
          ? 'El vuelo no tiene pasajeros con reservas activas.'
          : `${result.affectedPassengers} ${result.affectedPassengers === 1 ? 'pasajero recibirá' : 'pasajeros recibirán'} la reprogramación.`}
      </Panel>
      {resized.length > 0 && (
        <Panel icon="airline_seat_recline_normal" title="Capacidad ajustada al avión nuevo" tone="warning">
          <MessageList
            messages={resized.map(
              (c) => `${c.name}: ${c.capacity} → ${c.newCapacity} asientos${c.sold > 0 ? ` (${c.sold} vendidos)` : ''}`,
            )}
          />
        </Panel>
      )}
      {conflictMessages.length > 0 && (
        <Panel icon="event_busy" tone="error">
          <MessageList messages={conflictMessages} />
        </Panel>
      )}
      {result.issues.length > 0 && (
        <Panel icon="edit_note" title="Datos a corregir" tone="warning">
          <MessageList messages={result.issues.map((i) => i.mensaje)} />
        </Panel>
      )}
      {!result.changed && (
        <Panel icon="info" tone="neutral">
          No hay cambios respecto del itinerario actual.
        </Panel>
      )}
      {result.canSave && (
        <Panel icon="check_circle" tone="success">
          Sin conflictos: el vuelo está listo para actualizarse.
        </Panel>
      )}
    </div>
  );
}

function DonePanel({ result }: { result: RescheduleResult }) {
  return (
    <Panel icon="check_circle" title={`Vuelo ${result.code} reprogramado`} tone="success">
      <div className="flex flex-col gap-1">
        <span>
          {result.affectedPassengers === 0
            ? 'El vuelo no tenía pasajeros con reservas activas.'
            : `${result.affectedPassengers} ${result.affectedPassengers === 1 ? 'pasajero recibirá' : 'pasajeros recibirán'} la reprogramación.`}
        </span>
        <Link className="underline font-bold w-fit" href={`/admin/itinerario?date=${result.date}`}>
          Ver la planilla del {fullDay(result.date)}
        </Link>
      </div>
    </Panel>
  );
}
