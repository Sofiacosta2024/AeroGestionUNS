import { formatExactArs as formatArs, formatTime } from '@/lib/format';
import { commercialCabin } from '@/lib/cabin';
export type Offer = { id: string; name: string; code?: string; cabinClass: string; price: number; availableSeats: number; currency: string; seatSelectionFee: number };
export type CounterFlight = { id: string; code: string; departureAt: string; arrivalAt: string; prices: Offer[] };
export function FlightResults({ flights, selected, passengersCount, onSelect, disabled }: {
  flights: CounterFlight[]; selected: { flight: CounterFlight; offer: Offer } | null; passengersCount: number;
  onSelect: (flight: CounterFlight, offer: Offer) => void; disabled: boolean;
}) {
  return <div className="counter-table-wrap"><table><caption className="sr-only">Disponibilidad y tarifas por clase</caption><thead><tr><th>Vuelo</th><th>Salida</th><th>Llegada</th><th>Economy</th><th>Economy Premium</th><th>Primera Clase</th></tr></thead><tbody>
    {!flights.length && <tr><td colSpan={6}>Buscá vuelos para consultar disponibilidad.</td></tr>}
    {flights.map(f => <tr key={f.id}><th scope="row">{f.code}</th><td>{formatTime(f.departureAt)}</td><td>{formatTime(f.arrivalAt)}</td>
      {['ECONOMY', 'PREMIUM', 'FIRST'].map(cabin => <td key={cabin}>{f.prices.filter(o => commercialCabin(o) === cabin).map(o =>
        <button type="button" key={o.id} disabled={disabled || o.availableSeats < passengersCount} aria-pressed={selected?.flight.id === f.id && selected.offer.id === o.id}
          className="counter-offer" onClick={() => onSelect(f, o)} title={o.name}>{formatArs(o.price)} <span className={o.availableSeats ? 'counter-badge' : 'counter-badge sold'}>{o.availableSeats ? `${o.availableSeats} libres` : 'Agotado'}</span></button>)}</td>)}
    </tr>)}
  </tbody></table></div>;
}
