'use client';

import type { FormAircraft, FormAirport, FormRoute } from '@/lib/scheduling/form-data';
import { ALL_DAYS, WEEKEND, WORKDAYS, type FormState, type ScheduleMode } from './form-model';
import NewRouteForm from './new-route-form';
import SectionTitle from './section-title';

type Props = {
  form: FormState;
  airports: FormAirport[];
  aircraft: FormAircraft[];
  route: FormRoute | null;
  today: string;
  plannedCount: number;
  arrival: { time: string; nextDay: boolean } | null;
  onChange: (patch: Partial<FormState>) => void;
  onRouteCreated: (route: FormRoute) => void;
};

/** Lunes a domingo, como en el diseno. */
const WEEK = [
  { value: 1, label: 'LUN', letter: 'L' },
  { value: 2, label: 'MAR', letter: 'M' },
  { value: 3, label: 'MIÉ', letter: 'M' },
  { value: 4, label: 'JUE', letter: 'J' },
  { value: 5, label: 'VIE', letter: 'V' },
  { value: 6, label: 'SÁB', letter: 'S' },
  { value: 0, label: 'DOM', letter: 'D' },
];

const INPUT =
  'w-full bg-surface-container-lowest px-space-md py-2 rounded-lg font-code-telemetry text-code-telemetry text-primary border-0 shadow-sm focus:ring-2 focus:ring-secondary/30';
const SELECT =
  'w-full bg-surface-container-low px-space-md py-3 rounded-lg font-headline-sm text-headline-sm text-primary border-0 focus:ring-2 focus:ring-secondary/30';
const SMALL_LABEL = 'font-label-sm text-label-sm uppercase text-on-surface-variant';

/** Card 1 del diseno: ruta, avion, fechas, hora y dias de operacion. */
export default function ScheduleSection(props: Props) {
  const { form, airports, aircraft, route, today, plannedCount, arrival, onChange, onRouteCreated } = props;
  const needsRoute = form.origin && form.destination && form.origin !== form.destination && !route;

  function toggleDay(day: number) {
    const weekdays = form.weekdays.includes(day)
      ? form.weekdays.filter((d) => d !== day)
      : [...form.weekdays, day].sort((a, b) => a - b);
    onChange({ weekdays });
  }

  return (
    <section className="bg-surface-container-lowest rounded-xl p-space-lg shadow-md flex flex-col gap-space-lg">
      <SectionTitle number={1} title="Ruta, frecuencias e itinerario" />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-space-md">
        <label className="flex flex-col gap-space-xs font-label-md text-label-md text-on-surface">
          <span className="flex items-center gap-1">
            <span className="material-symbols-outlined text-[16px] text-secondary">flight_takeoff</span>
            Aeropuerto de origen
          </span>
          <select className={SELECT} value={form.origin} onChange={(e) => onChange({ origin: e.target.value })}>
            {airports.map((a) => (
              <option key={a.iataCode} value={a.iataCode}>
                [{a.iataCode}] {a.city}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-space-xs font-label-md text-label-md text-on-surface">
          <span className="flex items-center gap-1">
            <span className="material-symbols-outlined text-[16px] text-secondary">flight_land</span>
            Aeropuerto de destino
          </span>
          <select className={SELECT} value={form.destination} onChange={(e) => onChange({ destination: e.target.value })}>
            <option value="">Elegir destino</option>
            {airports
              .filter((a) => a.iataCode !== form.origin)
              .map((a) => (
                <option key={a.iataCode} value={a.iataCode}>
                  [{a.iataCode}] {a.city}
                </option>
              ))}
          </select>
        </label>

        <label className="flex flex-col gap-space-xs font-label-md text-label-md text-on-surface">
          <span className="flex items-center gap-1">
            <span className="material-symbols-outlined text-[16px] text-secondary">airlines</span>
            Aeronave
          </span>
          <select className={SELECT} value={form.aircraftId} onChange={(e) => onChange({ aircraftId: e.target.value })}>
            <option value="">Elegir avión</option>
            {aircraft.map((a) => (
              <option key={a.id} value={a.id}>
                {a.registration} · {a.model}
              </option>
            ))}
          </select>
        </label>
      </div>

      {needsRoute && (
        <NewRouteForm destination={form.destination} onCreated={onRouteCreated} origin={form.origin} />
      )}

      <div className="flex items-center gap-space-xs bg-surface-container p-space-xs rounded-lg w-fit" role="radiogroup">
        {(['single', 'recurring'] as ScheduleMode[]).map((mode) => (
          <button
            key={mode}
            aria-checked={form.mode === mode}
            className={`px-space-md py-space-sm rounded-lg font-label-lg text-label-lg transition-colors ${
              form.mode === mode ? 'bg-primary-container text-on-primary' : 'text-primary hover:bg-surface-container-high'
            }`}
            onClick={() => onChange({ mode })}
            role="radio"
            type="button"
          >
            {mode === 'single' ? 'Vuelo único' : 'Cronograma'}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-space-md bg-surface-container-low p-space-md rounded-xl">
        {form.mode === 'single' ? (
          <label className="flex flex-col gap-space-xs">
            <span className={SMALL_LABEL}>Fecha del vuelo</span>
            <input className={INPUT} min={today} onChange={(e) => onChange({ date: e.target.value })} type="date" value={form.date} />
          </label>
        ) : (
          <>
            <label className="flex flex-col gap-space-xs">
              <span className={SMALL_LABEL}>Inicio de vigencia</span>
              <input className={INPUT} min={today} onChange={(e) => onChange({ validFrom: e.target.value })} type="date" value={form.validFrom} />
            </label>
            <label className="flex flex-col gap-space-xs">
              <span className={SMALL_LABEL}>Fin de vigencia</span>
              <input className={INPUT} min={form.validFrom || today} onChange={(e) => onChange({ validTo: e.target.value })} type="date" value={form.validTo} />
            </label>
          </>
        )}
        <label className="flex flex-col gap-space-xs">
          <span className={SMALL_LABEL}>Salida programada (STD, hora ART)</span>
          <input className={INPUT} onChange={(e) => onChange({ departureTime: e.target.value })} type="time" value={form.departureTime} />
        </label>
        <div className="flex flex-col gap-space-xs">
          <span className={SMALL_LABEL}>Arribo estimado (STA)</span>
          <span className={`${INPUT} flex items-center gap-space-xs bg-surface-container`} aria-live="polite">
            {arrival ? `${arrival.time}${arrival.nextDay ? ' (+1 día)' : ''}` : '—'}
            <span className="font-label-sm text-label-sm text-outline normal-case">calculado con la duración de la ruta</span>
          </span>
        </div>
      </div>

      {form.mode === 'recurring' && (
        <div className="flex flex-col gap-space-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-space-xs">
            <span className="font-label-md text-label-md text-on-surface font-bold">Frecuencia semanal de operación</span>
            <div className="flex items-center gap-space-xs font-label-sm text-label-sm">
              <span className="text-on-surface-variant">Filtros rápidos:</span>
              <QuickFilter label="Todos" days={ALL_DAYS} current={form.weekdays} onSelect={(weekdays) => onChange({ weekdays })} />
              <QuickFilter label="Días hábiles" days={WORKDAYS} current={form.weekdays} onSelect={(weekdays) => onChange({ weekdays })} />
              <QuickFilter label="Fin de semana" days={WEEKEND} current={form.weekdays} onSelect={(weekdays) => onChange({ weekdays })} />
            </div>
          </div>
          <div className="grid grid-cols-7 gap-space-xs sm:gap-space-sm">
            {WEEK.map((d) => {
              const active = form.weekdays.includes(d.value);
              return (
                <button
                  key={d.value}
                  aria-pressed={active}
                  className={`flex flex-col items-center justify-center p-space-sm rounded-lg transition-all ${
                    active
                      ? 'bg-primary-container text-surface-container-lowest shadow-sm'
                      : 'bg-surface-container-low text-outline opacity-60 hover:opacity-90'
                  }`}
                  onClick={() => toggleDay(d.value)}
                  type="button"
                >
                  <span className="font-label-sm text-label-sm uppercase tracking-wider opacity-80">{d.label}</span>
                  <span className="font-headline-sm text-headline-sm font-bold mt-1">{d.letter}</span>
                  <span className={`text-[10px] uppercase font-code-telemetry mt-1 ${active ? 'text-secondary-fixed' : ''}`}>
                    {active ? 'Activo' : 'Inactivo'}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <p className="font-label-md text-label-md text-on-surface-variant">
        {plannedCount > 0
          ? `Se ${plannedCount === 1 ? 'generará 1 vuelo' : `generarán ${plannedCount} vuelos`}. El número de vuelo (AG-####) se asigna al publicar, uno por vuelo.`
          : 'Elegí la fecha (o la vigencia y los días) para ver cuántos vuelos se generan.'}
      </p>
    </section>
  );
}

function QuickFilter(props: { label: string; days: number[]; current: number[]; onSelect: (days: number[]) => void }) {
  const active = props.days.length === props.current.length && props.days.every((d) => props.current.includes(d));
  return (
    <button
      className={`px-2.5 py-1 rounded font-semibold transition-colors ${
        active ? 'bg-primary-container text-surface-container-lowest' : 'bg-surface-container hover:bg-surface-container-high text-primary'
      }`}
      onClick={() => props.onSelect([...props.days].sort((a, b) => a - b))}
      type="button"
    >
      {props.label}
    </button>
  );
}
