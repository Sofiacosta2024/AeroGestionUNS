import Link from 'next/link';
import type { Receipt } from '@/lib/payment-email';
import { formatArs, formatFullDate, formatTime } from '@/lib/format';

export function BookingSteps({
  confirmed = false,
  preparing = false,
}: {
  confirmed?: boolean;
  preparing?: boolean;
}) {
  const current = preparing ? 1 : confirmed ? 3 : 2;
  return (
    <ol className="booking-steps" aria-label="Etapas de la reserva">
      {['Vuelos', 'Asientos & Pasajeros', 'Pago', 'Confirmación'].map((label, i) => (
        <li
          key={label}
          className={i === current ? 'current' : i < current ? 'done' : ''}
          aria-current={i === current ? 'step' : undefined}
        >
          <span className="step-number">{i < current ? '✓' : i + 1}</span>
          <span>
            <small>PASO {i + 1}</small>
            {label}
          </span>
        </li>
      ))}
    </ol>
  );
}

export function MobileBookingHeader({ title }: { title: string }) {
  return (
    <header className="mobile-booking-header">
      <Link href="/vuelos" aria-label="Volver a vuelos">
        ←
      </Link>
      <strong>{title}</strong>
      <span className="mobile-profile" aria-hidden="true">
        ♙
      </span>
    </header>
  );
}

export function RouteDetails({
  receipt,
  compact = false,
}: {
  receipt: Receipt;
  compact?: boolean;
}) {
  return (
    <div className={compact ? 'flight-summary' : 'ticket-routes'}>
      {receipt.flights.map((f) => (
        <section key={f.code} className="route-section">
          <div className="route-heading">
            <strong>{f.code}</strong>
            <span>{formatFullDate(f.departureAt)}</span>
          </div>
          <div className="route-airports">
            <div>
              <b>{f.origin.split(' · ')[0]}</b>
              <p>{f.origin.split(' · ')[1]}</p>
              <strong>{formatTime(f.departureAt)} ART</strong>
            </div>
            <span className="route-plane" aria-hidden="true">
              ✈<small>{f.isDirect ? 'Directo' : 'Con escalas'}</small>
            </span>
            <div>
              <b>{f.destination.split(' · ')[0]}</b>
              <p>{f.destination.split(' · ')[1]}</p>
              <strong>{formatTime(f.arrivalAt)} ART</strong>
            </div>
          </div>
        </section>
      ))}
    </div>
  );
}

export function PriceSummary({ receipt }: { receipt: Receipt }) {
  return (
    <section className="booking-card price-summary">
      <RouteDetails receipt={receipt} compact />
      <div className="card-padding">
        <p className="eyebrow">RESUMEN DE LA RESERVA</p>
        <div className="summary-line">
          <span>Pasajeros</span>
          <strong>{receipt.passengers.length}</strong>
        </div>
        <div className="summary-line">
          <span>Reserva</span>
          <strong>{receipt.code}</strong>
        </div>
        <p className="muted">
          Importe registrado en la reserva, sin cargos adicionales.
        </p>
        <div className="total-box">
          <div>
            <small>IMPORTE FINAL</small>
            <h3>Total a pagar</h3>
          </div>
          <div>
            <b>{formatArs(receipt.amount)}</b>
            <small>{receipt.currency} · Pesos argentinos</small>
          </div>
        </div>
      </div>
    </section>
  );
}

export function PassengerCards({
  receipt,
  details = [],
}: {
  receipt: Receipt;
  details?: { document: string; birthDate: string | null }[];
}) {
  return (
    <div className="passenger-list">
      {receipt.passengers.map((p, i) => (
        <article className="booking-card" key={i}>
          <div className="passenger-heading">
            <span className="passenger-number">{i + 1}</span>
            <div>
              <h3>{p.name}</h3>
              <small>
                {i === 0 ? 'PASAJERO PRINCIPAL' : 'PASAJERO ACOMPAÑANTE'}
              </small>
            </div>
            <span className="seat-pill">{p.seat}</span>
          </div>
          <div className="mobile-passenger-name">
            <small>Nombre y apellido completo</small>
            <p>{p.name}</p>
          </div>
          <div className="passenger-data">
            <div>
              <small>DOCUMENTO</small>
              <p>{details[i]?.document ?? 'Registrado en la reserva'}</p>
            </div>
            <div>
              <small>FECHA DE NACIMIENTO</small>
              <p>
                {details[i]?.birthDate
                  ? formatFullDate(details[i].birthDate!)
                  : 'Sin informar'}
              </p>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}
