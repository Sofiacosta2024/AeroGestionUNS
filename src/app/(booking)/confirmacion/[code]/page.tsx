import Link from 'next/link';
import { redirect } from 'next/navigation';
import { loadCheckout, toReceipt } from '@/lib/checkout';
import { prisma } from '@/lib/prisma';
import {
  BookingSteps,
  MobileBookingHeader,
  RouteDetails,
} from '@/components/BookingViews';
import { formatArs } from '@/lib/format';
import type { EmailResult } from '@/lib/payment-email';
import ConfirmationActions, { CopyBookingCode } from './confirmation-actions';
export const dynamic = 'force-dynamic';

export default async function ConfirmationPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const { booking } = await loadCheckout(code);
  const payment = booking.payments.find((p) => p.status === 'APPROVED');
  if (!payment || booking.status === 'CANCELLED')
    redirect(`/pago/${booking.bookingCode}`);
  const receipt = toReceipt(booking);
  const lastEmail = await prisma.auditLog.findFirst({
    where: { entity: 'Payment', entityId: payment.id, action: 'PAYMENT_EMAIL' },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  });
  const metadata = lastEmail?.metadata as
    Partial<EmailResult> | null | undefined;
  const email: EmailResult | null =
    metadata &&
    (metadata.status === 'accepted' || metadata.status === 'failed') &&
    typeof metadata.message === 'string'
      ? { status: metadata.status, message: metadata.message }
      : null;
  return (
    <div className="confirmation-screen">
      <MobileBookingHeader title="Confirmación y comprobante" />
      <BookingSteps confirmed />
      <main className="booking-main">
        <section className="booking-card success-banner">
          <span className="success-circle" aria-hidden="true">
            ✓
          </span>
          <div className="success-copy">
            <p className="eyebrow">PAGO SIMULADO · RESERVA CONFIRMADA</p>
            <h1>
              <span className="desktop-confirmation-title">
                ¡Pago confirmado y reserva emitida con éxito!
              </span>
              <span className="mobile-confirmation-title">
                ¡Reserva confirmada!
              </span>
            </h1>
            <p className="muted desktop-confirmation-reference">
              Código de reserva: <strong>{receipt.code}</strong>
              <br />
              Comprobante: {receipt.reference}
            </p>
            <p className="mobile-confirmation-description">
              Tu reserva está lista. Guardá el comprobante de tu vuelo.
            </p>
          </div>
          <CopyBookingCode code={receipt.code} />
          <div className="email-banner">
            <p className="eyebrow">CORREO DE CONFIRMACIÓN</p>
            <strong>{receipt.email}</strong>
            <p className="muted">
              {email?.status === 'accepted'
                ? 'Aceptado para envío por Resend. Revisá también spam.'
                : 'El pago está confirmado. Revisá el estado del correo abajo.'}
            </p>
          </div>
        </section>
        <div className="booking-grid">
          <article className="booking-card">
            <div className="ticket-header">
              <b>
                AeroGestión <span style={{ color: '#ff5179' }}>UNS</span>
              </b>
              <span>COMPROBANTE DE RESERVA · DEMO</span>
            </div>
            <RouteDetails receipt={receipt} />
            <section className="ticket-passengers">
              <p className="eyebrow">PASAJEROS CONFIRMADOS Y UBICACIONES</p>
              {receipt.passengers.map((p, i) => (
                <div className="ticket-passenger" key={i}>
                  <span className="passenger-number">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <strong style={{ flex: 1 }}>{p.name}</strong>
                  <strong>{p.seat}</strong>
                </div>
              ))}
              <div className="total-box">
                <h3>Total abonado (simulado)</h3>
                <b>{formatArs(receipt.amount)}</b>
              </div>
            </section>
            <div className="ticket-disclaimer">
              <p className="ticket-identifiers">
                Reserva: <strong>{receipt.code}</strong><br />
                Comprobante: {receipt.reference}
              </p>
              <strong>
                Proyecto universitario · No se efectuó un cobro real
              </strong>
              <p>
                Este comprobante no es una factura fiscal ni una tarjeta de
                embarque. La asignación de asientos y el check-in se gestionan
                por separado.
              </p>
            </div>
          </article>
          <aside>
            <ConfirmationActions code={receipt.code} initialEmail={email} />
            <div className="info-box">
              <h3>Antes de viajar</h3>
              <p>
                Revisá el horario del vuelo y presentate con tu documento
                vigente. Consultá la puerta de embarque en el aeropuerto.
              </p>
            </div>
            <Link className="back-link" href="/vuelos">
              ← Volver a la página principal
            </Link>
          </aside>
        </div>
      </main>
    </div>
  );
}
