import type { CounterFieldErrors } from '@/lib/mostrador/validation';
export type CounterPassenger = { firstName: string; lastName: string; documentNumber: string; seatId?: string };
export function PassengerFields({ passengers, onChange, disabled, errors = {} }: {
  passengers: CounterPassenger[]; onChange: (index: number, field: keyof CounterPassenger, value: string) => void; disabled: boolean;
  errors?: CounterFieldErrors;
}) {
  return <>{passengers.map((p, i) => <fieldset key={i} disabled={disabled}><legend>Pasajero {i + 1}</legend><div className="counter-fields">
    {(['firstName', 'lastName', 'documentNumber'] as const).map(field => {
      const id = `counter-passenger-${i}-${field}`;
      const error = errors[`passengers.${i}.${field}`];
      return <div className="counter-field" key={field}><label htmlFor={id}>{({ firstName: 'Nombre', lastName: 'Apellido', documentNumber: 'DNI (7 u 8 dígitos)' })[field]}</label>
        <input id={id} required maxLength={field === 'documentNumber' ? 8 : 80} autoComplete={field === 'firstName' ? 'given-name' : field === 'lastName' ? 'family-name' : undefined}
          inputMode={field === 'documentNumber' ? 'numeric' : undefined} pattern={field === 'documentNumber' ? '[0-9]{7,8}' : undefined}
          aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-error` : undefined}
          value={p[field]} onChange={e => onChange(i, field, e.target.value)} />
        {error && <p id={`${id}-error`} className="counter-field-error">{error}</p>}
      </div>;
    })}
  </div></fieldset>)}</>;
}
