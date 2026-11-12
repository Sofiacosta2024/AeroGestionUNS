'use client';

import { useState } from 'react';
import {
  MY_BOOKINGS_EMPTY_MESSAGE,
  type MyBookingCategory,
  type MyBookingFlightView,
  type MyBookingView,
} from '@/lib/my-bookings-view';
import { isContingencyBookingStatus } from '@/lib/contingency-status';
import { formatArs, formatDayMonth, formatFullDate, formatTime } from '@/lib/format';
import {
  bookingStatusPresentation,
  cabinClassLabel,
  type BookingTone,
} from '@/lib/public-booking-view';

/**
 * Panel "Mis Reservas" (US-15 v2.0).
 *
 * El listado se resuelve en el servidor (page.tsx) y llega ya repartido en las
 * dos pestanas; este componente solo alterna entre "Proximos Vuelos" e
 * "Historial / Pasados" y compone las tarjetas. El boton unificado "Gestionar
 * Reserva" lleva al panel de autogestion y comprobantes (US-14A) con el codigo
 * precargado.
 */

const TONE_CLASS: Record<BookingTone, string> = {
  ok: 'bg-[#DCF5EA] text-[#0F9D6B]',
  warn: 'bg-[#FFF4E0] text-[#B45309]',
  bad: 'bg-[#FFE3EA] text-[#E11D48]',
  info: 'bg-[#E6ECFF] text-[#2D0F63]',
};

const TABS: { key: MyBookingCategory; label: string }[] = [
  { key: 'upcoming', label: 'Próximos Vuelos' },
  { key: 'past', label: 'Historial / Pasados' },
];

function routeLabel(flight: MyBookingFlightView): string {
  const origin = flight.origin?.iataCode ?? '—';
  const destination = flight.destination?.iataCode ?? '—';
  return `${origin} → ${destination}`;
}

function scheduleLabel(flight: MyBookingFlightView): string {
  if (!flight.departureAt) return 'Horario a confirmar';
  const date = formatDayMonth(flight.departureAt);
  const start = formatTime(flight.departureAt);
  const end = flight.arrivalAt ? formatTime(flight.arrivalAt) : null;
  return end ? `${date} ${start} → ${end}` : `${date} ${start}`;
}

/** Tarjeta de itinerario: codigo, vuelo, fecha, estado y accion unificada. */
export function BookingCard({ booking }: { booking: MyBookingView }) {
  const status = bookingStatusPresentation(booking.status);
  const contingency = isContingencyBookingStatus(booking.status);
  const flight = booking.flights[0];

  return (
    <article className="flex flex-col gap-3 rounded-xl border border-outline-variant/60 bg-surface-container-lowest p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-col">
          <span className="font-label-sm text-label-sm uppercase tracking-wider text-outline">
            Código de reserva
          </span>
          <span className="font-headline-sm text-headline-sm text-primary-container font-bold">
            {booking.bookingCode}
          </span>
        </div>
        <span
          className={`inline-block rounded-full px-3 py-1 font-label-sm text-label-sm font-bold ${TONE_CLASS[status.tone]}`}
        >
          {status.label}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <span className="font-label-sm text-label-sm uppercase tracking-wider text-outline">
            Ruta
          </span>
          <p className="font-body-md text-body-md text-on-surface font-bold">
            {flight ? routeLabel(flight) : '—'}
          </p>
        </div>
        <div>
          <span className="font-label-sm text-label-sm uppercase tracking-wider text-outline">
            Vuelo
          </span>
          <p className="font-body-md text-body-md text-on-surface font-bold">
            {flight?.flightCode ?? '—'}
          </p>
          <p className="font-body-sm text-body-sm text-on-surface-variant">
            {[flight?.fareName, cabinClassLabel(booking.cabinClass)]
              .filter((value) => value && value !== '—')
              .join(' · ') || 'Tarifa a confirmar'}
          </p>
        </div>
        <div>
          <span className="font-label-sm text-label-sm uppercase tracking-wider text-outline">
            Horarios
          </span>
          <p className="font-body-md text-body-md text-on-surface font-bold">
            {flight ? scheduleLabel(flight) : 'Horario a confirmar'}
          </p>
          <p className="font-body-sm text-body-sm text-on-surface-variant">
            Emitida el {booking.createdAt ? formatFullDate(booking.createdAt) : '—'}
          </p>
        </div>
      </div>

      {contingency && (
        <div
          className="rounded-lg border border-secondary/30 bg-error-container px-4 py-3 text-on-error-container"
          role="status"
        >
          <p className="font-label-lg text-label-lg font-bold">
            Tu reserva está en gestión por contingencia
          </p>
          {booking.proposedFlight ? (
            <p className="font-body-sm text-body-sm">
              Vuelo propuesto: <span className="font-bold">{booking.proposedFlight.flightCode}</span>{' '}
              {routeLabel(booking.proposedFlight)} · {scheduleLabel(booking.proposedFlight)}
            </p>
          ) : (
            <p className="font-body-sm text-body-sm">
              La aerolínea está evaluando las alternativas disponibles.
            </p>
          )}
          {booking.proposalReason && (
            <p className="font-body-sm text-body-sm">Motivo: {booking.proposalReason}</p>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-outline-variant/60 pt-3">
        <span className="font-body-sm text-body-sm text-on-surface-variant">
          {booking.passengersCount}{' '}
          {booking.passengersCount === 1 ? 'pasajero' : 'pasajeros'} ·{' '}
          {formatArs(booking.totalAmount)} {booking.currency}
        </span>
        <a
          className="inline-flex h-11 items-center justify-center rounded-lg bg-secondary px-5 font-label-lg text-label-lg font-bold text-on-secondary shadow-sm transition-colors hover:bg-secondary-container"
          href={`/reserva?code=${encodeURIComponent(booking.bookingCode)}`}
        >
          Gestionar Reserva
        </a>
      </div>
    </article>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-4 rounded-xl border border-outline-variant/60 bg-surface-container-lowest px-6 py-14 text-center shadow-sm">
      <span aria-hidden="true" className="material-symbols-outlined text-5xl text-primary-container">
        luggage
      </span>
      <p className="max-w-md font-body-md text-body-md font-bold text-primary-container">
        {MY_BOOKINGS_EMPTY_MESSAGE}
      </p>
      <a
        className="inline-flex h-11 items-center justify-center rounded-lg bg-secondary px-6 font-label-lg text-label-lg font-bold text-on-secondary shadow-sm transition-colors hover:bg-secondary-container"
        href="/vuelos"
      >
        Buscar vuelos
      </a>
    </div>
  );
}

export default function MisReservasClient({
  past,
  upcoming,
  userEmail,
  userName,
}: {
  past: MyBookingView[];
  upcoming: MyBookingView[];
  userEmail: string;
  userName: string;
}) {
  const [tab, setTab] = useState<MyBookingCategory>('upcoming');
  const isCompletelyEmpty = upcoming.length === 0 && past.length === 0;
  const bookings = tab === 'upcoming' ? upcoming : past;

  return (
    <main className="mx-auto flex min-h-[calc(100vh-8rem)] w-full max-w-5xl flex-col px-4 py-8 sm:py-10 lg:min-h-[calc(100vh-5rem)]">
      <section className="flex flex-wrap items-center gap-4 rounded-xl border border-outline-variant/60 bg-surface-container-lowest p-4 shadow-sm sm:p-5">
        <span
          aria-hidden="true"
          className="flex h-14 w-14 items-center justify-center rounded-full bg-primary-container font-headline-sm text-headline-sm font-bold text-on-primary"
        >
          {userName.split(' ').map((word) => word[0]).slice(0, 2).join('').toUpperCase()}
        </span>
        <div className="flex flex-col">
          <h1 className="font-headline-md text-headline-md text-primary-container font-bold">
            {userName}
          </h1>
          <span className="font-body-sm text-body-sm text-on-surface-variant">
            {userEmail} · Pasajero registrado
          </span>
        </div>
      </section>

      <div
        aria-label="Secciones de Mis Reservas"
        className="mt-6 flex gap-1 border-b border-outline-variant/60"
        role="tablist"
      >
        {TABS.map((item) => {
          const active = tab === item.key;
          const count = item.key === 'upcoming' ? upcoming.length : past.length;
          return (
            <button
              aria-selected={active}
              className={
                active
                  ? 'border-b-[3px] border-secondary px-4 py-3 font-label-lg text-label-lg font-bold text-primary-container'
                  : 'px-4 py-3 font-label-lg text-label-lg font-bold text-outline hover:text-primary-container'
              }
              key={item.key}
              onClick={() => setTab(item.key)}
              role="tab"
              type="button"
            >
              {item.label}
              {count > 0 && <span className="ml-2 text-secondary">{count}</span>}
            </button>
          );
        })}
      </div>

      <div className="mt-6 flex flex-col gap-4" role="tabpanel">
        {isCompletelyEmpty ? (
          <EmptyState />
        ) : bookings.length === 0 ? (
          <p className="rounded-xl border border-outline-variant/60 bg-surface-container-lowest px-4 py-10 text-center font-body-md text-body-md text-on-surface-variant">
            {tab === 'upcoming'
              ? 'No tenés vuelos próximos por el momento.'
              : 'Todavía no tenés reservas en tu historial.'}
          </p>
        ) : (
          bookings.map((booking) => <BookingCard booking={booking} key={booking.bookingCode} />)
        )}
      </div>
    </main>
  );
}
