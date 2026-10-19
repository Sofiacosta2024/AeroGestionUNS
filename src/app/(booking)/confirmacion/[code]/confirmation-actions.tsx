'use client';
import { useRef, useState } from 'react';
import type { EmailResult } from '@/lib/payment-email';
import type { TravelDocuments } from '@/lib/travel-documents';

export default function ConfirmationActions({
  code,
  initialEmail,
  documents,
}: {
  code: string;
  initialEmail: EmailResult | null;
  documents: TravelDocuments;
}) {
  const busy = useRef(false);
  const [sending, setSending] = useState(false);
  const [pdfBusy, setPdfBusy] = useState<'pass' | 'invoice' | null>(null);
  const [email, setEmail] = useState(initialEmail);
  async function download(kind: 'pass' | 'invoice') {
    if (pdfBusy) return;
    setPdfBusy(kind);
    try {
      const { buildPassPdf, buildInvoicePdf } = await import('@/lib/pdf/documents');
      const pdf =
        kind === 'pass' ? buildPassPdf(documents) : buildInvoicePdf(documents);
      pdf.save(`${kind === 'pass' ? 'pasaje' : 'factura'}-${documents.bookingCode}.pdf`);
    } finally {
      setPdfBusy(null);
    }
  }
  async function resend() {
    if (busy.current) return;
    busy.current = true;
    setSending(true);
    try {
      const response = await fetch(
        `/api/bookings/${encodeURIComponent(code)}/payment-email`,
        { method: 'POST' },
      );
      const result = await response.json();
      if (!response.ok || !result.ok)
        throw new Error(
          result.error?.message ?? 'No pudimos reenviar el correo.',
        );
      setEmail(result.data.email);
    } catch (error) {
      setEmail({
        status: 'failed',
        message:
          error instanceof Error
            ? error.message
            : 'No pudimos reenviar el correo. Tu pago sigue confirmado.',
      });
    } finally {
      busy.current = false;
      setSending(false);
    }
  }
  return (
    <section className="booking-card documentation">
      <h2>Documentación</h2>
      <p className="muted">
        Descargá el pasaje de cada viajero y la factura de tu compra.
      </p>
      <button
        className="booking-button"
        type="button"
        disabled={pdfBusy !== null}
        onClick={() => download('pass')}
      >
        {pdfBusy === 'pass' ? 'Generando…' : '↓ Descargar pasaje PDF'}
      </button>
      <button
        className="booking-button secondary"
        type="button"
        disabled={pdfBusy !== null}
        onClick={() => download('invoice')}
      >
        {pdfBusy === 'invoice' ? 'Generando…' : '↓ Descargar factura PDF'}
      </button>
      <button
        className="booking-button secondary"
        type="button"
        disabled={sending}
        onClick={resend}
      >
        {sending ? 'Enviando…' : '✉ Reenviar por email'}
      </button>
      <div
        aria-live="polite"
        className={`alert-box ${email?.status === 'accepted' ? 'success-alert' : ''}`}
      >
        {email?.message ??
          'No hay un resultado de envío registrado. Podés solicitar el correo con el botón de arriba.'}
      </div>
    </section>
  );
}

export function CopyBookingCode({ code }: { code: string }) {
  const [message, setMessage] = useState('');
  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setMessage('Copiado');
    } catch {
      setMessage('Seleccioná el código para copiarlo');
    }
  }
  return (
    <div className="mobile-booking-code">
      <div>
        <small>CÓDIGO DE RESERVA (PNR)</small>
        <strong>{code}</strong>
      </div>
      <button type="button" onClick={copy}>
        {message === 'Copiado' ? '✓ Copiado' : '▣ Copiar'}
      </button>
      <span className="copy-feedback" role="status">
        {message !== 'Copiado' ? message : ''}
      </span>
    </div>
  );
}
