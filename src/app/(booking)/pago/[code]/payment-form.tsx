'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { paymentSchema } from '@/lib/validation';
import { digitsOnly } from '@/lib/mock-payment';
import { formatArs } from '@/lib/format';

export default function PaymentForm({
  code,
  amount,
  email,
}: {
  code: string;
  amount: number;
  email: string;
}) {
  const router = useRouter();
  const busy = useRef(false);
  const [submitting, setSubmitting] = useState(false);
  const [values, setValues] = useState({
    cardNumber: '',
    cardholder: '',
    expiry: '',
    cvv: '',
    contactEmail: email,
    installments: 1,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('');
  function change(field: keyof typeof values, value: string | number) {
    setValues((v) => ({ ...v, [field]: value }));
    setErrors((e) => ({ ...e, [field]: '' }));
    setMessage('');
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy.current) return;
    setMessage('');
    const parsed = paymentSchema.safeParse(values);
    if (!parsed.success) {
      const fields: Record<string, string> = {};
      for (const issue of parsed.error.issues)
        fields[String(issue.path[0])] ??= issue.message;
      setErrors(fields);
      const first = parsed.error.issues[0];
      if (first) document.getElementById(`pay-${first.path[0]}`)?.focus();
      return;
    }
    busy.current = true;
    setSubmitting(true);
    try {
      const response = await fetch(
        `/api/bookings/${encodeURIComponent(code)}/payments`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(parsed.data),
        },
      );
      const result = await response.json();
      // Limpiamos los datos sensibles tanto al aprobar como al rechazar.
      setValues((v) => ({ ...v, cardNumber: '', cvv: '' }));
      if (!response.ok || !result.ok)
        throw new Error(
          result.error?.message ??
            'No pudimos procesar el pago. Intentá nuevamente.',
        );
      if (result.data.payment.status === 'REJECTED') {
        setMessage(
          'Pago rechazado. La tarjeta de prueba con todos unos simula un rechazo. Podés intentar con otro número de 16 dígitos. Tu reserva sigue pendiente.',
        );
        return;
      }
      router.replace(`/confirmacion/${encodeURIComponent(code)}`);
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'No pudimos procesar el pago. Intentá nuevamente.',
      );
    } finally {
      busy.current = false;
      setSubmitting(false);
    }
  }
  const field = (name: keyof typeof values) => ({
    id: `pay-${name}`,
    'aria-invalid': !!errors[name],
    'aria-describedby': errors[name] ? `error-${name}` : undefined,
  });
  const error = (name: keyof typeof values) =>
    errors[name] && (
      <span id={`error-${name}`} className="field-error">
        {errors[name]}
      </span>
    );
  return (
    <section className="booking-card payment-card">
      <div className="payment-title">
        <div>
          <h3>Pago con tarjeta</h3>
          <p className="muted">Pasarela de pago simulada</p>
        </div>
        <span className="test-badge">TEST MODE</span>
      </div>
      <form onSubmit={submit} noValidate>
        <fieldset disabled={submitting}>
          <div className="form-field">
            <label htmlFor="pay-cardNumber">NÚMERO DE TARJETA</label>
            <input
              {...field('cardNumber')}
              type="text"
              inputMode="numeric"
              autoComplete="off"
              placeholder="0000 0000 0000 0000"
              maxLength={19}
              value={values.cardNumber.replace(/(.{4})/g, '$1 ').trim()}
              onChange={(e) =>
                change('cardNumber', digitsOnly(e.target.value, 16))
              }
            />
            {error('cardNumber')}
          </div>
          <div className="form-field">
            <label htmlFor="pay-cardholder">NOMBRE DEL TITULAR</label>
            <input
              {...field('cardholder')}
              autoComplete="off"
              maxLength={100}
              placeholder="Como figura en la tarjeta"
              value={values.cardholder}
              onChange={(e) => change('cardholder', e.target.value)}
            />
            {error('cardholder')}
          </div>
          <div className="field-pair">
            <div className="form-field">
              <label htmlFor="pay-expiry">VENCIMIENTO</label>
              <input
                {...field('expiry')}
                inputMode="numeric"
                autoComplete="off"
                maxLength={5}
                placeholder="MM/AA"
                value={values.expiry}
                onChange={(e) => {
                  const d = digitsOnly(e.target.value, 4);
                  change(
                    'expiry',
                    d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d,
                  );
                }}
              />
              {error('expiry')}
            </div>
            <div className="form-field">
              <label htmlFor="pay-cvv">CÓDIGO CVV</label>
              <input
                {...field('cvv')}
                type="password"
                inputMode="numeric"
                autoComplete="off"
                maxLength={4}
                placeholder="•••"
                value={values.cvv}
                onChange={(e) => change('cvv', digitsOnly(e.target.value, 4))}
              />
              {error('cvv')}
            </div>
          </div>
          <div className="form-field">
            <label htmlFor="pay-contactEmail">EMAIL DE CONFIRMACIÓN</label>
            <input
              {...field('contactEmail')}
              type="email"
              autoComplete="email"
              maxLength={160}
              value={values.contactEmail}
              onChange={(e) => change('contactEmail', e.target.value)}
            />
            {error('contactEmail')}
          </div>
          <div className="form-field">
            <label htmlFor="pay-installments">PLAN DE FINANCIACIÓN</label>
            <select
              {...field('installments')}
              value={values.installments}
              onChange={(e) => change('installments', Number(e.target.value))}
            >
              {[1, 3, 6].map((n) => (
                <option key={n} value={n}>
                  {n} cuota{n > 1 ? 's' : ''} sin interés de{' '}
                  {formatArs(amount / n)}
                </option>
              ))}
            </select>
            {error('installments')}
          </div>
          <div aria-live="polite">
            {message && (
              <div className="alert-box" role="alert">
                {message}
              </div>
            )}
          </div>
          <button
            type="submit"
            className="booking-button"
            disabled={submitting}
          >
            {submitting ? (
              'Procesando pago…'
            ) : (
              <>
                Pagar y confirmar reserva
                <br />({formatArs(amount)}) →
              </>
            )}
          </button>
        </fieldset>
      </form>
      <div className="info-box">
        Cualquier tarjeta ficticia de 16 números es aceptada.{' '}
        <strong>1111 1111 1111 1111</strong> simula un pago rechazado.
      </div>
    </section>
  );
}
