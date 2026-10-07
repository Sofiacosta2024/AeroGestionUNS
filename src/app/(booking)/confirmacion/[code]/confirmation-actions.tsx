'use client';
import { useRef, useState } from 'react';
import type { EmailResult } from '@/lib/payment-email';

export default function ConfirmationActions({
  code,
  initialEmail,
}: {
  code: string;
  initialEmail: EmailResult | null;
}) {
  const busy = useRef(false);
  const [sending, setSending] = useState(false);
  const [email, setEmail] = useState(initialEmail);
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
        Guardá el comprobante de tu reserva. Podés elegir “Guardar como PDF” en
        el diálogo de impresión.
      </p>
      <button
        className="booking-button"
        type="button"
        onClick={() => window.print()}
      >
        ↓ Imprimir / guardar comprobante PDF
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
