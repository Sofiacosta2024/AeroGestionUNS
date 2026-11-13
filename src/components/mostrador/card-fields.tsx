import { digitsOnly } from '@/lib/mock-payment';
import type { CounterFieldErrors } from '@/lib/mostrador/validation';

export const emptyCounterCard = { cardNumber: '', cardholder: '', expiry: '', cvv: '' };
type Card = typeof emptyCounterCard;

function formatExpiry(value: string) {
  const digits = digitsOnly(value, 4);
  return digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits;
}

const fields: Array<{
  name: keyof Card; label: string; maxLength: number; placeholder: string; numeric?: boolean;
  parse?: (value: string) => string; display?: (value: string) => string;
}> = [
  { name: 'cardNumber', label: 'Número de tarjeta', maxLength: 19, placeholder: '0000 0000 0000 0000',
    numeric: true, parse: (value: string) => digitsOnly(value, 16),
    display: (value: string) => value.replace(/(.{4})/g, '$1 ').trim() },
  { name: 'cardholder', label: 'Nombre del titular', maxLength: 100, placeholder: 'Como figura en la tarjeta' },
  { name: 'expiry', label: 'Vencimiento', maxLength: 5, placeholder: 'MM/AA', numeric: true, parse: formatExpiry },
  { name: 'cvv', label: 'Código CVV', maxLength: 4, placeholder: '•••', numeric: true, parse: (value: string) => digitsOnly(value, 4) },
];

export function CounterCardFields({ card, errors, onChange }: {
  card: Card;
  errors: CounterFieldErrors;
  onChange: (field: keyof Card, value: string) => void;
}) {
  return <>
    <div className="counter-fields counter-card-fields">
      {fields.map(({ name, label, maxLength, placeholder, numeric, parse, display }) => {
        const id = `counter-card-${name}`;
        const error = errors[`card.${name}`];
        return <div key={name} className="counter-field">
          <label htmlFor={id}>{label}</label>
          <input id={id} required type={name === 'cvv' ? 'password' : 'text'}
            inputMode={numeric ? 'numeric' : undefined} autoComplete="off"
            placeholder={placeholder} maxLength={maxLength}
            value={display ? display(card[name]) : card[name]}
            aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-error` : undefined}
            onChange={e => onChange(name, parse ? parse(e.target.value) : e.target.value)} />
          {error && <p id={`${id}-error`} className="counter-field-error">{error}</p>}
        </div>;
      })}
    </div>
    <p className="counter-muted">Pago simulado. Usá una tarjeta ficticia de 16 dígitos. El número <strong>1111 1111 1111 1111</strong> simula un rechazo.</p>
  </>;
}
