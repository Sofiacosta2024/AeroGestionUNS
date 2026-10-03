'use client';

import { formatDuration } from '@/lib/format';
import type { SchedulingRules } from '@/lib/scheduling/config';
import type { FormAircraft, FormAirport, FormRoute } from '@/lib/scheduling/form-data';
import { ALL_DAYS, WEEKEND, WORKDAYS, type FormState, type ScheduleMode } from './form-model';
import NewRouteForm from './new-route-form';
import SectionTitle from './section-title';

type Props = {
  form: FormState;
  airports: FormAirport[];
  aircraft: FormAircraft[];
  route: FormRoute | null;
  rules: SchedulingRules;
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
  'w-full bg-white px-3.5 py-2.5 rounded-xl font-medium text-slate-800 border border-slate-200 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#E11D48]/20 focus:border-[#E11D48] transition-all text-sm';
const SELECT =
  'w-full bg-white px-3.5 py-3 rounded-xl font-bold text-slate-800 border border-slate-200 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#E11D48]/20 focus:border-[#E11D48] transition-all text-sm cursor-pointer';
const SMALL_LABEL = 'font-label-sm text-[11px] font-bold uppercase tracking-wider text-slate-500';

/** Card 1 del diseno: ruta, avion, fechas, hora y dias de operacion. */
export default function ScheduleSection(props: Props) {
  const { form, airports, aircraft, route, rules, today, plannedCount, arrival, onChange, onRouteCreated } = props;
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
          <span className="flex items-center gap-1.5 font-bold text-slate-700">
            <span className="material-symbols-outlined text-[17px] text-[#E11D48]">flight_takeoff</span>
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
          <span className="flex items-center gap-1.5 font-bold text-slate-700">
            <span className="material-symbols-outlined text-[17px] text-blue-600">flight_land</span>
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
          <span className="flex items-center gap-1.5 font-bold text-slate-700">
            <span className="material-symbols-outlined text-[17px] text-purple-700">airlines</span>
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

      <p className="flex items-start gap-1.5 text-xs text-slate-500">
        <span className="material-symbols-outlined text-[16px] text-slate-400">info</span>
        <span>
          Se valida que entre dos salidas del mismo aeropuerto haya al menos {rules.gapMinutes} min y que el mismo avión
          tenga al menos {formatDuration(rules.turnaroundMinutes)} entre un aterrizaje y el siguiente despegue.
        </span>
      </p>

      {needsRoute && (
        <NewRouteForm destination={form.destination} onCreated={onRouteCreated} origin={form.origin} />
      )}

      {/* Selector de modo resaltado como segmented control */}
      <div className="flex items-center gap-1.5 bg-slate-100 p-1.5 rounded-2xl border border-slate-200/80 w-fit shadow-inner" role="radiogroup">
        {(['single', 'recurring'] as ScheduleMode[]).map((mode) => (
          <button
            key={mode}
            aria-checked={form.mode === mode}
            className={`px-5 py-2.5 rounded-xl font-bold text-xs sm:text-sm transition-all duration-150 flex items-center gap-2 ${
              form.mode === mode
                ? 'bg-[#1F0A43] text-white shadow-md shadow-[#1F0A43]/25'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/80'
            }`}
            onClick={() => onChange({ mode })}
            role="radio"
            type="button"
          >
            <span className="material-symbols-outlined text-[17px]">
              {mode === 'single' ? 'event' : 'date_range'}
            </span>
            <span>{mode === 'single' ? 'Vuelo único' : 'Cronograma'}</span>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-space-md bg-slate-50 border border-slate-200/70 p-space-md rounded-2xl">
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
        
        {/* Campo diferente / calculado: Arribo estimado */}
        <div className="flex flex-col gap-space-xs">
          <span className="font-label-sm text-[11px] font-bold uppercase tracking-wider text-indigo-900 flex items-center gap-1">
            <span className="material-symbols-outlined text-[14px] text-indigo-600">auto_mode</span>
            Arribo estimado (STA)
          </span>
          <div className="w-full bg-indigo-50/70 border-2 border-dashed border-indigo-200 px-3.5 py-2 rounded-xl flex flex-col justify-center min-h-[42px] shadow-sm" aria-live="polite">
            <div className="flex items-center gap-2">
              <span className="text-sm sm:text-base font-extrabold text-indigo-950 font-mono">
                {arrival ? arrival.time : '—'}
              </span>
              {arrival?.nextDay && (
                <span className="bg-rose-100 border border-rose-200 text-[#E11D48] text-[10px] font-black px-1.5 py-0.5 rounded-md uppercase">
                  +1 día
                </span>
              )}
            </div>
            <span className="text-[10px] text-indigo-600/80 font-medium">Calculado automáticamente</span>
          </div>
        </div>
      </div>

      {form.mode === 'recurring' && (
        <div className="flex flex-col gap-space-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-space-xs">
            <span className="font-label-md text-label-md text-on-surface font-bold">Frecuencia semanal de operación</span>
            <div className="flex items-center gap-space-xs font-label-sm text-label-sm">
              <span className="text-slate-500 font-semibold text-xs">Filtros rápidos:</span>
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
                  className={`flex flex-col items-center justify-center p-3 rounded-2xl transition-all duration-150 ${
                    active
                      ? 'bg-[#1F0A43] text-white border-2 border-[#E11D48] shadow-md shadow-purple-950/25 scale-[1.02]'
                      : 'bg-white border border-slate-200 text-slate-400 hover:border-slate-300 hover:text-slate-700 shadow-sm'
                  }`}
                  onClick={() => toggleDay(d.value)}
                  type="button"
                >
                  <span className="text-[10px] uppercase font-bold tracking-wider opacity-80">{d.label}</span>
                  <span className="text-base sm:text-lg font-black mt-0.5">{d.letter}</span>
                  <span className={`text-[10px] font-bold mt-1 px-1.5 py-0.5 rounded-full ${
                    active ? 'bg-[#E11D48] text-white' : 'bg-slate-100 text-slate-400'
                  }`}>
                    {active ? 'Activo' : 'Off'}
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
      className={`px-3 py-1 rounded-lg text-xs font-bold transition-all shadow-sm ${
        active
          ? 'bg-[#1F0A43] text-white'
          : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
      }`}
      onClick={() => props.onSelect([...props.days].sort((a, b) => a - b))}
      type="button"
    >
      {props.label}
    </button>
  );
}
