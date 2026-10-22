'use client';

import { useRef, useState } from 'react';
import { formatAmountInput, parseAmountInput } from '@/lib/format';
import { apiRequest } from '../api-client';
import { commercialCabin } from '@/lib/cabin';

export type SeatFeeFare = { id: string; code: string; name: string; cabinClass: string; isActive: boolean; seatSelectionFee: number };

export default function SeatFeesForm({ fares }: { fares: SeatFeeFare[] }) {
  return <div className="flex flex-col gap-4">{fares.length ? fares.map(fare => <SeatFeeRow key={fare.id} fare={fare} />) : <p>No hay tarifas para configurar.</p>}</div>;
}

function SeatFeeRow({ fare }: { fare: SeatFeeFare }) {
  const [savedFee, setSavedFee] = useState(fare.seatSelectionFee);
  const [draft, setDraft] = useState(formatAmountInput(fare.seatSelectionFee));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [serverError, setServerError] = useState('');
  const inFlight = useRef(false);
  const included = commercialCabin(fare) !== 'ECONOMY';
  const amount = parseAmountInput(draft);
  const validationError = !draft.trim() || !Number.isFinite(amount) ? 'Ingresá un importe válido.'
    : amount < 0 ? 'El adicional no puede ser negativo.'
    : amount > 9999999999.99 ? 'El importe es demasiado alto.'
    : Math.abs(amount * 100 - Math.round(amount * 100)) > 0.0001 ? 'Ingresá como máximo dos decimales.' : '';
  const error = validationError || serverError;
  const inputId = `seat-fee-${fare.id}`;

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (included || validationError || inFlight.current || amount === savedFee) return;
    inFlight.current = true; setBusy(true); setMessage(''); setServerError('');
    try {
      const result = await apiRequest<{ seatSelectionFee: string | number }>('PATCH', `/api/fares/${fare.id}`, { seatSelectionFee: amount });
      const updated = Number(result.seatSelectionFee);
      setSavedFee(updated); setDraft(formatAmountInput(updated)); setMessage('Adicional guardado correctamente.');
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'No se pudo guardar el adicional.');
    } finally { inFlight.current = false; setBusy(false); }
  }

  return <form onSubmit={save} className="rounded-xl bg-surface-container-lowest border border-outline-variant p-5 flex flex-wrap items-start gap-4">
    <div className="flex-1 min-w-48"><h2 className="font-bold">{fare.name}</h2><p className="text-sm text-on-surface-variant">{fare.code}{!fare.isActive && ' · Inactiva'}</p></div>
    {included ? <p className="text-sm text-on-surface-variant">Elección de asiento incluida, sin adicional.</p> : <><div className="flex-1 min-w-48"><label htmlFor={inputId} className="block text-sm font-semibold mb-1">Adicional fijo por asiento ($)</label>
      <input id={inputId} type="text" inputMode="decimal" required disabled={busy} value={draft}
        aria-invalid={error ? true : undefined} aria-describedby={`${inputId}-help${error ? ` ${inputId}-error` : ''}`}
        className="w-full rounded-lg border border-outline-variant p-2 text-on-surface bg-surface"
        onChange={event => { setDraft(event.target.value); setMessage(''); setServerError(''); }} />
      <p id={`${inputId}-help`} className="text-xs text-on-surface-variant mt-1">Por pasajero. Ej.: 3.500,50. 0 = sin recargo.</p>
      {error && <p id={`${inputId}-error`} role="alert" className="text-sm text-error mt-1">{error}</p>}
      <p role="status" className="text-sm mt-1">{message}</p>
    </div>
    <button type="submit" disabled={busy || Boolean(validationError) || amount === savedFee} className="rounded-lg bg-primary text-on-primary font-semibold px-4 py-2 mt-6 disabled:opacity-40">{busy ? 'Guardando…' : 'Guardar'}</button></>}
  </form>;
}
