import { redirect } from 'next/navigation';
import { loadCheckout, toReceipt } from '@/lib/checkout';
import {
  BookingSteps,
  MobileBookingHeader,
  PassengerCards,
  PriceSummary,
} from '@/components/BookingViews';
import PaymentForm from './payment-form';
export const dynamic = 'force-dynamic';

export default async function PaymentPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const { booking } = await loadCheckout(code);
  if (
    booking.payments.some((p) => p.status === 'APPROVED') &&
    booking.status !== 'CANCELLED'
  )
    redirect(`/confirmacion/${booking.bookingCode}`);
  const receipt = toReceipt(booking);
  const available =
    ['PENDING', 'CONFIRMED'].includes(booking.status) &&
    booking.passengers.length === booking.passengersCount;
  return (
    <div className="payment-screen">
      <MobileBookingHeader title="Pago de la reserva" />
      <BookingSteps />
      <main className="booking-main">
        <div className="booking-grid">
          <div>
            <p className="eyebrow">
              VERIFICACIÓN DE PASAJEROS · {booking.bookingCode}
            </p>
            <h1>Pasajeros &amp; Datos de Facturación</h1>
            <p className="muted">
              Confirmá que la información coincida con los documentos vigentes
              al momento del embarque.
            </p>
            <PassengerCards
              receipt={receipt}
              details={booking.passengers.map((p) => ({
                document: `${p.documentType} ${p.documentNumber}`,
                birthDate: p.birthDate?.toISOString().slice(0, 10) ?? null,
              }))}
            />
            <section
              className="booking-card card-padding"
              style={{ marginTop: 24 }}
            >
              <h2>Datos de contacto</h2>
              <p className="eyebrow">CORREO ELECTRÓNICO DEL PASAJERO</p>
              <p>{booking.contactEmail}</p>
              <p className="muted">
                Podés actualizar el correo de confirmación en el formulario de
                pago.
              </p>
              {booking.contactPhone && <p>Teléfono: {booking.contactPhone}</p>}
            </section>
            <div className="info-box">
              <strong>Entorno de simulación</strong>
              <p>
                Este pago es una prueba para el proyecto universitario. No se
                realizará ningún cobro real. Utilizá datos de tarjeta ficticios.
              </p>
            </div>
          </div>
          <aside>
            <PriceSummary receipt={receipt} />
            {available ? (
              <PaymentForm
                code={booking.bookingCode}
                amount={receipt.amount}
                email={receipt.email}
              />
            ) : (
              <div className="alert-box" role="alert">
                {booking.status === 'CANCELLED'
                  ? 'Esta reserva está cancelada y no admite pagos.'
                  : 'La reserva no está lista para el pago. Debe tener los datos de todos sus pasajeros y un estado pendiente o confirmado.'}
              </div>
            )}
          </aside>
        </div>
      </main>
    </div>
  );
}
