'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { FlightResults, type CounterFlight, type Offer } from '@/components/mostrador/flight-results';
import { PassengerFields, type CounterPassenger } from '@/components/mostrador/passenger-fields';
import { SeatPicker, type CounterSeat } from '@/components/mostrador/seat-picker';
import { SaleConfirmation } from '@/components/mostrador/sale-confirmation';
import { counterSaleSchema, counterFieldErrors, type CounterFieldErrors } from '@/lib/mostrador/validation';
import type { CounterQuote, CounterSaleInput, CounterSaleResult } from '@/lib/mostrador/types';
import { formatExactArs as formatArs, toDateInput } from '@/lib/format';
import { commercialCabin } from '@/lib/cabin';

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, cache: 'no-store' });
  const result = await response.json();
  if (!response.ok || !result.ok) throw new Error(result.error?.message ?? 'No se pudo completar la operación');
  return result.data as T;
}
const emptyPassenger = (): CounterPassenger => ({ firstName: '', lastName: '', documentNumber: '' });
export default function CounterSaleClient() {
  const [airports, setAirports] = useState<{ iataCode: string; city: string }[]>([]);
  const [filters, setFilters] = useState({ origin: 'BHI', destination: 'AEP', date: toDateInput(new Date()) });
  const [count, setCount] = useState(1);
  const [passengers, setPassengers] = useState<CounterPassenger[]>([emptyPassenger()]);
  const [flights, setFlights] = useState<CounterFlight[]>([]);
  const [selected, setSelected] = useState<{ flight: CounterFlight; offer: Offer } | null>(null);
  const [seatMode, setSeatMode] = useState<'AUTO' | 'MANUAL'>('AUTO');
  const [seats, setSeats] = useState<CounterSeat[]>([]);
  const [activePassenger, setActivePassenger] = useState(0);
  const [contactEmail, setEmail] = useState('');
  const [contactPhone, setPhone] = useState('');
  const [paymentMethod, setMethod] = useState<CounterSaleInput['paymentMethod']>('CASH');
  const [quote, setQuote] = useState<CounterQuote | null>(null);
  const [refreshQuote, setRefreshQuote] = useState(0);
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [sale, setSale] = useState<CounterSaleResult | null>(null);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<CounterFieldErrors>({});
  const [searchError, setSearchError] = useState('');
  const [notice, setNotice] = useState('');
  const [quoteError, setQuoteError] = useState('');
  const attempt = useRef<CounterSaleInput | null>(null);
  const sending = useRef(false);
  const customerForm = useRef<HTMLFormElement>(null);
  const locked = busy || uncertain;

  function showFieldErrors(errors: CounterFieldErrors) {
    setFieldErrors(errors);
    window.requestAnimationFrame(() => customerForm.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
  }
  function clearFieldError(key: string) {
    setFieldErrors(old => { const next = { ...old }; delete next[key]; return next; });
  }

  useEffect(() => {
    const controller = new AbortController();
    json<{ data: { iataCode: string; city: string }[] }>('/api/airports?pageSize=100', { signal: controller.signal })
      .then(r => setAirports(r.data)).catch(() => { /* Los campos IATA siguen disponibles. */ });
    return () => controller.abort();
  }, []);
  const search = useCallback(async () => {
    if (filters.origin === filters.destination) { setSearchError('El origen y el destino deben ser diferentes'); return; }
    setSearching(true); setSearchError('');
    try {
      const params = new URLSearchParams({ ...filters, passengers: String(count), available: 'false', pageSize: '100' });
      const r = await json<{ data: CounterFlight[] }>(`/api/flights?${params}`);
      setFlights(r.data.filter(f => new Date(f.departureAt) > new Date()));
      setNotice(r.data.length ? '' : 'No se encontraron vuelos para los criterios ingresados.');
    } catch (e) { setSearchError(e instanceof Error ? e.message : 'No se pudo buscar vuelos'); }
    finally { setSearching(false); }
  }, [filters, count]);
  useEffect(() => {
    const refresh = () => { if (!locked && !sale) { setRefreshQuote(v => v + 1); if (flights.length) void search(); } };
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, [locked, sale, flights.length, search]);
  const flightId = selected?.flight.id;
  const fareId = selected?.offer.id;
  useEffect(() => {
    if (!flightId || !fareId || uncertain) return;
    const controller = new AbortController();
    setQuote(null); setQuoteError(''); setSeats([]);
    json<CounterQuote>('/api/v1/mostrador/cotizacion', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ flightId, fareId, passengersCount: count, seatMode }), signal: controller.signal })
      .then(setQuote).catch(e => { if (!controller.signal.aborted) setQuoteError(e instanceof Error ? e.message : 'No se pudo cotizar'); });
    if (seatMode === 'MANUAL') json<{ seats: CounterSeat[] }>(`/api/flights/${flightId}/seats?fareId=${fareId}`, { signal: controller.signal })
      .then(r => setSeats(r.seats)).catch(() => { if (!controller.signal.aborted) setQuoteError('No se pudo cargar el mapa de asientos. Volvé a cotizar.'); });
    return () => controller.abort();
  }, [flightId, fareId, count, seatMode, refreshQuote, uncertain]);
  function changeCount(n: number) {
    setFieldErrors({});
    setCount(n); setPassengers(old => Array.from({ length: n }, (_, i) => old[i] ?? emptyPassenger())); setActivePassenger(0); setQuote(null);
  }
  function select(flight: CounterFlight, offer: Offer) {
    setSelected({ flight, offer }); setPassengers(old => old.map(p => ({ ...p, seatId: undefined }))); setSeatMode('AUTO'); setQuote(null);
  }
  async function issue() {
    if (sending.current || !selected || !quote) return;
    setError(''); setFieldErrors({});
    const parsed = counterSaleSchema.safeParse(attempt.current ?? {
      requestId: crypto.randomUUID(), flightId: selected.flight.id, fareId: selected.offer.id, quotedTotal: quote.totalAmount,
      seatMode, passengers, contactEmail, contactPhone, paymentMethod,
    });
    if (!parsed.success) {
      const errors = counterFieldErrors(parsed.error.issues);
      showFieldErrors(errors);
      if (!Object.keys(errors).length) setError('Revisá los datos de la venta antes de continuar.');
      return;
    }
    attempt.current = parsed.data;
    sending.current = true; setBusy(true);
    try {
      const response = await fetch('/api/v1/mostrador/ventas', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(attempt.current), signal: AbortSignal.timeout(90000) });
      const result = await response.json();
      if (!response.ok || !result.ok) {
        // Un 5xx puede ocurrir después del commit: conservar la misma solicitud para consultar/reintentar.
        if (response.status >= 500) throw new Error('No pudimos confirmar la respuesta. Reintentá la misma venta para verificar su estado.');
        attempt.current = null; setUncertain(false);
        const details: unknown = result.error?.details;
        const errors = result.error?.code === 'VALIDATION_ERROR' && Array.isArray(details)
          ? counterFieldErrors(details.filter((item): item is { campo: string; mensaje: string } =>
            !!item && typeof item === 'object' && typeof item.campo === 'string' && typeof item.mensaje === 'string')
            .map(item => ({ path: item.campo.split('.'), message: item.mensaje }))) : {};
        if (Object.keys(errors).length) showFieldErrors(errors);
        else setError(result.error?.message ?? 'No se pudo emitir la venta');
        setRefreshQuote(v => v + 1); return;
      }
      setSale(result.data); setUncertain(false); attempt.current = null;
    } catch {
      setUncertain(true); setError('No pudimos confirmar la respuesta. Reintentá la misma venta: no se duplicará el cobro.');
    } finally { sending.current = false; setBusy(false); }
  }
  function newSale() {
    setSale(null); setSelected(null); setQuote(null); setPassengers([emptyPassenger()]); setCount(1);
    setEmail(''); setPhone(''); setError(''); setFieldErrors({}); setMethod('CASH'); setSeatMode('AUTO'); void search();
  }
  return <main className="counter-main"><h1>Venta presencial de pasajes</h1>
    {sale ? <SaleConfirmation sale={sale} onNewSale={newSale} /> : <>
      <section className="counter-panel"><h2>Buscar vuelo</h2><form className="counter-search" onSubmit={e => { e.preventDefault(); setSelected(null); setQuote(null); void search(); }}>
        {(['origin', 'destination'] as const).map(field => <label key={field}>{field === 'origin' ? 'Origen' : 'Destino'}
          <input list="counter-airports" required pattern="[A-Z]{3}" maxLength={3} value={filters[field]} disabled={locked}
            onChange={e => { setFilters(v => ({ ...v, [field]: e.target.value.toUpperCase() })); setSelected(null); setQuote(null); }} /></label>)}
        <datalist id="counter-airports">{airports.map(a => <option key={a.iataCode} value={a.iataCode}>{a.city}</option>)}</datalist>
        <label>Fecha<input type="date" min={toDateInput(new Date())} required value={filters.date} disabled={locked}
          onChange={e => { setFilters(v => ({ ...v, date: e.target.value })); setSelected(null); setQuote(null); }} /></label>
        <label>Pasajeros (1 a 9)<select value={count} disabled={locked} onChange={e => changeCount(Number(e.target.value))}>{Array.from({ length: 9 }, (_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}</select></label>
        <button className="counter-primary" disabled={locked || searching}>{searching ? 'Buscando…' : 'Buscar'}</button>
      </form>{searchError && <p className="counter-error" role="alert">{searchError}</p>}<p className="counter-search-status" role="status">{notice}</p></section>
      <FlightResults flights={flights} selected={selected} passengersCount={count} disabled={locked || searching} onSelect={select} />
      <form ref={customerForm} noValidate onSubmit={e => { e.preventDefault(); /* Sólo el botón explícito confirma el cobro presencial. */ }}>
        <div className="counter-grid"><section className="counter-panel"><h2>Datos del cliente</h2>
          <PassengerFields passengers={passengers} disabled={locked} errors={fieldErrors} onChange={(i, field, value) => {
            clearFieldError(`passengers.${i}.${field}`);
            // Editing a repeated DNI also clears the stale warning on its previous match.
            const previousDocument = passengers[i]?.documentNumber;
            if (field === 'documentNumber' && previousDocument && /^\d{7,8}$/.test(previousDocument))
              passengers.forEach((p, j) => { if (p.documentNumber === previousDocument) clearFieldError(`passengers.${j}.documentNumber`); });
            setPassengers(old => old.map((p, j) => j === i ? { ...p, [field]: value } : p));
          }} />
          <div className="counter-fields"><div className="counter-field"><label htmlFor="counter-email">Email</label>
            <input id="counter-email" required type="email" autoComplete="email" maxLength={160} disabled={locked} value={contactEmail}
              aria-invalid={fieldErrors.contactEmail ? true : undefined} aria-describedby={fieldErrors.contactEmail ? 'counter-email-error' : undefined}
              onChange={e => { setEmail(e.target.value); clearFieldError('contactEmail'); }} />
            {fieldErrors.contactEmail && <p id="counter-email-error" className="counter-field-error">{fieldErrors.contactEmail}</p>}</div>
            <div className="counter-field"><label htmlFor="counter-phone">Teléfono (8 a 15 dígitos)</label>
              <input id="counter-phone" required type="tel" inputMode="numeric" pattern="[0-9]{8,15}" maxLength={15} disabled={locked} value={contactPhone}
                aria-invalid={fieldErrors.contactPhone ? true : undefined} aria-describedby={fieldErrors.contactPhone ? 'counter-phone-error' : undefined}
                onChange={e => { setPhone(e.target.value); clearFieldError('contactPhone'); }} />
              {fieldErrors.contactPhone && <p id="counter-phone-error" className="counter-field-error">{fieldErrors.contactPhone}</p>}</div></div>
          <h3>Asiento</h3><div className="counter-mode">{(['AUTO', 'MANUAL'] as const).map(mode => <button type="button" key={mode} aria-pressed={seatMode === mode}
            disabled={locked || !selected || (mode === 'MANUAL' && commercialCabin(selected.offer) === 'ECONOMY' && !selected.offer.seatSelectionFee)}
            onClick={() => { setSeatMode(mode); setPassengers(old => old.map(p => ({ ...p, seatId: undefined }))); }}>{mode === 'AUTO' ? 'Asignación automática' : 'Elegir en mapa'}</button>)}</div>
          <p className="counter-muted">En Economy la elección de asiento tiene recargo. En Economy Premium y Primera Clase está incluida.</p>
          {selected && commercialCabin(selected.offer) === 'ECONOMY' && !selected.offer.seatSelectionFee && <p className="counter-muted">La elección de ubicación se habilita cuando la tarifa tenga un recargo configurado.</p>}
          {seatMode === 'MANUAL' && <SeatPicker seats={seats} selectedIds={passengers.map(p => p.seatId)} activePassenger={activePassenger} onPassenger={setActivePassenger} disabled={locked}
            errors={passengers.map((_, i) => fieldErrors[`passengers.${i}.seatId`])}
            onSeat={id => { clearFieldError(`passengers.${activePassenger}.seatId`); setPassengers(old => old.map((p, i) => i === activePassenger ? { ...p, seatId: id } : p)); }} />}
        </section><section className="counter-panel"><h2>Método de pago</h2><fieldset disabled={locked}><legend>Confirmar cobro presencial</legend><div className="counter-methods">
          {(['CASH', 'CREDIT_CARD', 'DEBIT_CARD'] as const).map(method => <label key={method} data-selected={paymentMethod === method}><input type="radio" name="counter-method" value={method} checked={paymentMethod === method} onChange={() => setMethod(method)} />{({ CASH: 'Efectivo', CREDIT_CARD: 'Tarjeta de crédito', DEBIT_CARD: 'Tarjeta de débito' })[method]}</label>)}
        </div></fieldset><p className="counter-muted">Emití la venta una vez confirmado el cobro en caja o en la terminal presencial.</p>
          <div className="counter-total" aria-live="polite">{selected ? <><p>{selected.flight.code} · {selected.offer.name} · {count} {count === 1 ? 'pasajero' : 'pasajeros'}</p>
            {quote ? <><p>Tarifa {formatArs(quote.baseAmount)} + elección de asiento {formatArs(quote.seatSelectionAmount)}</p><strong>Total: {formatArs(quote.totalAmount)} {quote.currency}</strong></> : <p>{quoteError || 'Cotizando…'}</p>}</> : 'Seleccioná un vuelo y una clase.'}</div>
          {error && <p className="counter-error" role="alert">{error}</p>}
          {quoteError && <button type="button" disabled={locked} onClick={() => setRefreshQuote(v => v + 1)}>Volver a cotizar</button>}
          <button type="button" className="counter-primary counter-submit" disabled={busy || !quote || (seatMode === 'MANUAL' && passengers.some(p => !p.seatId))} onClick={() => void issue()}>
            {busy ? 'Emitiendo…' : uncertain ? 'Reintentar la misma venta' : 'Emitir Pasaje en Mostrador'}</button>
        </section></div>
      </form>
    </>}
  </main>;
}
