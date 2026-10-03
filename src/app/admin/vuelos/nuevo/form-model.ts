import { expandOperatingDates, minutesOfDay, weekdayOf } from '@/lib/scheduling/calendar';
import type { FormRoute, ScheduleFormData } from '@/lib/scheduling/form-data';
import type { SerializedSchedule } from '@/lib/scheduling/serializers';
import type { ScheduleInput } from '@/lib/validation';

/**
 * Estado del formulario de alta y su traduccion al pedido de la API. Logica pura, sin
 * React, para que el componente solo se ocupe de pintar.
 */

export type ScheduleMode = 'single' | 'recurring';

/** Lo que el admin escribe por clase (texto crudo de los inputs). */
export type OfferDraft = { seats: string; price: string };

export type FormState = {
  origin: string;
  destination: string;
  aircraftId: string;
  mode: ScheduleMode;
  /** Fecha del vuelo unico. */
  date: string;
  validFrom: string;
  validTo: string;
  /** 0 = domingo ... 6 = sabado. */
  weekdays: number[];
  departureTime: string;
  /** Por id de tarifa (clase). */
  offers: Record<string, OfferDraft>;
};

/** Lunes a viernes: la opcion por defecto del diseno ("Dias habiles"). */
export const WORKDAYS = [1, 2, 3, 4, 5];
export const WEEKEND = [0, 6];
export const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

export function initialFormState(data: ScheduleFormData, draft: SerializedSchedule | null): FormState {
  const offers = Object.fromEntries(
    data.classes.map((c) => {
      const saved = draft?.fares.find((f) => f.fareId === c.id);
      return [c.id, { seats: saved ? String(saved.seats) : '', price: String(saved?.price ?? c.basePrice) }];
    }),
  );

  if (draft) {
    return {
      origin: draft.route.origin.iataCode,
      destination: draft.route.destination.iataCode,
      aircraftId: draft.aircraft.id,
      mode: draft.validFrom === draft.validTo ? 'single' : 'recurring',
      date: draft.validFrom,
      validFrom: draft.validFrom,
      validTo: draft.validTo,
      weekdays: draft.weekdays,
      departureTime: draft.departureTime,
      offers,
    };
  }

  const hub = data.airports.some((a) => a.iataCode === 'BHI') ? 'BHI' : (data.airports[0]?.iataCode ?? '');
  return {
    origin: hub,
    destination: '',
    aircraftId: '',
    mode: 'single',
    date: '',
    validFrom: '',
    validTo: '',
    weekdays: WORKDAYS,
    departureTime: '',
    offers,
  };
}

export function findRoute(routes: readonly FormRoute[], origin: string, destination: string): FormRoute | null {
  return routes.find((r) => r.origin === origin && r.destination === destination) ?? null;
}

/** Vigencia y dias efectivos: un vuelo unico es un cronograma de un solo dia. */
function effectivePeriod(state: FormState): { validFrom: string; validTo: string; weekdays: number[] } {
  if (state.mode === 'single') {
    return state.date
      ? { validFrom: state.date, validTo: state.date, weekdays: [weekdayOf(state.date)] }
      : { validFrom: '', validTo: '', weekdays: [] };
  }
  return { validFrom: state.validFrom, validTo: state.validTo, weekdays: state.weekdays };
}

const toNumber = (raw: string) => (raw.trim() === '' ? NaN : Number(raw));

/**
 * Pedido para la API, o null si todavia faltan datos basicos (ruta, avion, fechas, hora).
 * Las clases sin asientos o sin precio no se mandan: el servidor avisa cuales faltan.
 */
export function toScheduleInput(state: FormState, route: FormRoute | null): ScheduleInput | null {
  const period = effectivePeriod(state);
  if (!route || !state.aircraftId || !period.validFrom || !period.validTo || !state.departureTime) {
    return null;
  }
  if (period.weekdays.length === 0) return null;

  const fares = Object.entries(state.offers)
    .map(([fareId, o]) => ({ fareId, seats: toNumber(o.seats), price: toNumber(o.price) }))
    .filter((o) => Number.isFinite(o.seats) && Number.isFinite(o.price));

  return {
    routeId: route.id,
    aircraftId: state.aircraftId,
    ...period,
    departureTime: state.departureTime,
    fares,
  };
}

/** Cantidad de vuelos que generaria el periodo elegido (vista previa inmediata). */
export function plannedFlightsCount(state: FormState): number {
  const period = effectivePeriod(state);
  if (!period.validFrom || !period.validTo || period.validFrom > period.validTo) return 0;
  return expandOperatingDates(period.validFrom, period.validTo, period.weekdays).length;
}

/** Hora de llegada (salida + duracion), con aviso si cae al dia siguiente. */
export function arrivalPreview(
  departureTime: string,
  durationMinutes: number | undefined,
): { time: string; nextDay: boolean } | null {
  if (!departureTime || durationMinutes === undefined) return null;
  const total = minutesOfDay(departureTime) + durationMinutes;
  const minutes = total % 1440;
  const pad = (n: number) => String(n).padStart(2, '0');
  return { time: `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`, nextDay: total >= 1440 };
}
