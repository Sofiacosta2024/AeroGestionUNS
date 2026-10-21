export type CounterSeat = { id: string; rowNumber: number; columnLetter: string; cabinClass: string; status: string; allowedForFare: boolean };
export function SeatPicker({ seats, selectedIds, activePassenger, onPassenger, onSeat, disabled, errors = [] }: {
  seats: CounterSeat[]; selectedIds: (string | undefined)[]; activePassenger: number; onPassenger: (i: number) => void;
  onSeat: (seatId: string) => void; disabled: boolean;
  errors?: (string | undefined)[];
}) {
  const rows = [...new Set(seats.filter(s => s.allowedForFare).map(s => s.rowNumber))];
  return <div className="counter-seat-picker"><label>Elegir asiento para el pasajero<select value={activePassenger} onChange={e => onPassenger(Number(e.target.value))} disabled={disabled}
    aria-invalid={errors.some(Boolean) ? true : undefined} aria-describedby={errors.some(Boolean) ? 'counter-seat-errors' : undefined}>
    {selectedIds.map((id, i) => <option key={i} value={i}>Pasajero {i + 1} · {seats.find(s => s.id === id) ? `${seats.find(s => s.id === id)!.rowNumber}${seats.find(s => s.id === id)!.columnLetter}` : 'Sin elegir'}</option>)}
  </select></label><div id="counter-seat-errors">{errors.map((error, i) => error && <p key={i} className="counter-field-error">Pasajero {i + 1}: {error}</p>)}</div>
    <p>Elegí una ubicación libre. Las ubicaciones oscuras ya fueron seleccionadas.</p>
    <div className="counter-seat-map" aria-label="Mapa de asientos">{rows.map(row => <div className="counter-seat-row" key={row}><span>{row}</span>{seats.filter(s => s.allowedForFare && s.rowNumber === row).map(s => {
      const chosen = selectedIds.includes(s.id);
      return <button type="button" key={s.id} disabled={disabled || s.status !== 'FREE' || (chosen && selectedIds[activePassenger] !== s.id)}
        aria-pressed={chosen} aria-label={`Asiento ${s.rowNumber}${s.columnLetter}, ${chosen ? 'seleccionado' : s.status === 'FREE' ? 'libre' : 'ocupado'}`}
        onClick={() => onSeat(s.id)}>{s.rowNumber}{s.columnLetter}</button>;
    })}</div>)}</div>
  </div>;
}
