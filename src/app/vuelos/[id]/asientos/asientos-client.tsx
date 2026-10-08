'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { CabinClass } from '@prisma/client';
import { formatArs, formatFullDate, formatTime } from '@/lib/format';
import type { FlightSeatView } from '@/lib/seat-locks';

type AsientosClientProps = {
  flight: {
    id: string;
    code: string;
    departureAt: string;
    arrivalAt: string;
    isDirect: boolean;
    originAirport: { iataCode: string; city: string; name: string };
    destinationAirport: { iataCode: string; city: string; name: string };
    aircraft: {
      id: string;
      model: string;
      registration: string;
      layout: string | null;
      seatCount: number;
    };
  };
  initialFare: {
    id: string;
    name: string;
    cabinClass: CabinClass;
    price: number;
    currency: string;
  } | null;
  allFares: Array<{
    id: string;
    name: string;
    cabinClass: CabinClass;
    price: number;
    currency: string;
  }>;
  initialSeats: FlightSeatView[];
  initialPassengersCount: number;
  currentUser: { email: string; role: string } | null;
};

export default function AsientosClient({
  flight,
  initialFare,
  allFares,
  initialSeats,
  initialPassengersCount,
  currentUser,
}: AsientosClientProps) {
  const router = useRouter();

  const [selectedFareId, setSelectedFareId] = useState<string>(
    initialFare?.id ?? allFares[0]?.id ?? '',
  );
  const [passengersCount, setPassengersCount] = useState<number>(initialPassengersCount);
  const [selectedSeatIds, setSelectedSeatIds] = useState<string[]>([]);
  const [seats, setSeats] = useState<FlightSeatView[]>(initialSeats);
  const [contactEmail, setContactEmail] = useState<string>(currentUser?.email ?? '');
  const [contactPhone, setContactPhone] = useState<string>('');
  const [passengerData, setPassengerData] = useState<
    Array<{ firstName: string; lastName: string; documentType: 'DNI' | 'PASAPORTE'; documentNumber: string }>
  >(() =>
    Array.from({ length: initialPassengersCount }, (_, i) => ({
      firstName: '',
      lastName: '',
      documentType: 'DNI',
      documentNumber: '',
    })),
  );

  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);

  const currentFare = useMemo(
    () => allFares.find((f) => f.id === selectedFareId) ?? allFares[0],
    [allFares, selectedFareId],
  );

  // Agrupar asientos por fila
  const rowsMap = useMemo(() => {
    const map = new Map<number, FlightSeatView[]>();
    for (const seat of seats) {
      if (!map.has(seat.rowNumber)) map.set(seat.rowNumber, []);
      map.get(seat.rowNumber)!.push(seat);
    }
    // Ordenar columnas dentro de cada fila
    for (const [_, rowSeats] of map) {
      rowSeats.sort((a, b) => a.columnLetter.localeCompare(b.columnLetter));
    }
    return Array.from(map.entries()).sort((a, b) => a[0] - b[0]);
  }, [seats]);

  const is2x2 = flight.aircraft.layout?.startsWith('2-2');

  // Cambiar cantidad de pasajeros requerida (1 a 9)
  const handlePassengersCountChange = (count: number) => {
    const safeCount = Math.min(9, Math.max(1, count));
    setPassengersCount(safeCount);
    if (selectedSeatIds.length > safeCount) {
      setSelectedSeatIds((prev) => prev.slice(0, safeCount));
    }
    setPassengerData((prev) => {
      const next = [...prev];
      while (next.length < safeCount) {
        next.push({ firstName: '', lastName: '', documentType: 'DNI', documentNumber: '' });
      }
      return next.slice(0, safeCount);
    });
  };

  // Click en una butaca
  const handleToggleSeat = (seat: FlightSeatView) => {
    setErrorMessage(null);
    setNoticeMessage(null);

    // Si ya está seleccionada por el usuario, deseleccionar
    if (selectedSeatIds.includes(seat.id)) {
      setSelectedSeatIds((prev) => prev.filter((id) => id !== seat.id));
      return;
    }

    // Validar estado
    if (seat.status === 'OCCUPIED') {
      setErrorMessage(`El asiento ${seat.rowNumber}${seat.columnLetter} está ocupado por otro pasaje.`);
      return;
    }
    if (seat.status === 'LOCKED') {
      setErrorMessage(
        `El asiento ${seat.rowNumber}${seat.columnLetter} no está disponible (bloqueado temporalmente por otro usuario).`,
      );
      return;
    }

    // Validar clase
    if (currentFare && seat.cabinClass !== currentFare.cabinClass) {
      setErrorMessage(
        `El asiento ${seat.rowNumber}${seat.columnLetter} es de clase ${seat.cabinClass}. Tu tarifa seleccionada es ${currentFare.name} (${currentFare.cabinClass}).`,
      );
      return;
    }

    // Validar límite
    if (selectedSeatIds.length >= passengersCount) {
      if (passengersCount < 9) {
        setNoticeMessage(
          `Ya seleccionaste ${passengersCount} asiento(s). Aumentá la cantidad de pasajeros arriba si necesitás hasta 9 lugares.`,
        );
      } else {
        setNoticeMessage('Alcanzaste el límite máximo de 9 asientos por reserva (RF-03).');
      }
      return;
    }

    setSelectedSeatIds((prev) => [...prev, seat.id]);
  };

  // Recargar mapa en tiempo real
  const refreshSeats = async () => {
    try {
      const res = await fetch(`/api/flights/${flight.id}/seats?fareId=${selectedFareId}`);
      const json = await res.json();
      if (json.ok) {
        setSeats(json.data.seats);
      }
    } catch {
      // ignore
    }
  };

  // Enviar bloqueo transaccional atómico
  const handleConfirmLock = async () => {
    setErrorMessage(null);

    if (selectedSeatIds.length !== passengersCount) {
      setErrorMessage(`Debés seleccionar exactamente ${passengersCount} asiento(s) para continuar.`);
      return;
    }

    if (!contactEmail || !contactEmail.includes('@')) {
      setErrorMessage('Ingresá un correo electrónico válido de contacto.');
      return;
    }

    // Validar datos de pasajeros
    for (let i = 0; i < passengersCount; i++) {
      const p = passengerData[i];
      if (!p?.firstName?.trim() || !p?.lastName?.trim() || !p?.documentNumber?.trim()) {
        setErrorMessage(`Completá el nombre, apellido y documento del Pasajero ${i + 1}.`);
        return;
      }
    }

    setSubmitting(true);
    try {
      const response = await fetch(`/api/flights/${flight.id}/lock-seats`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fareId: selectedFareId,
          seatIds: selectedSeatIds,
          contactEmail: contactEmail.trim().toLowerCase(),
          contactPhone: contactPhone.trim() || undefined,
          passengers: passengerData.slice(0, passengersCount),
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.ok) {
        // En caso de conflicto de concurrencia (409 "Asiento no disponible")
        if (response.status === 409) {
          setErrorMessage(
            result.error?.message === 'Asiento no disponible'
              ? '¡Asiento no disponible! Otro usuario acaba de bloquear una de las butacas seleccionadas. Por favor elegí otro lugar disponible.'
              : result.error?.message,
          );
          // Refrescar mapa para ver el estado actual
          await refreshSeats();
          // Quitar de seleccion los que ya no están libres
          setSelectedSeatIds([]);
          return;
        }
        throw new Error(result.error?.message || 'Error al bloquear asientos');
      }

      // Éxito: El asiento quedó bloqueado atómicamente por 5 minutos
      const bookingCode = result.data.bookingCode;
      router.push(`/pago/${bookingCode}`);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Error inesperado al bloquear asientos');
    } finally {
      setSubmitting(false);
    }
  };

  const totalAmount = (currentFare?.price ?? 0) * passengersCount;

  return (
    <div className="min-h-screen pb-24 text-on-surface">
      {/* Barra de Navegación */}
      <header className="sticky top-0 z-30 bg-primary/95 backdrop-blur text-surface-container-lowest border-b border-white/10 px-4 py-3">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/vuelos"
              className="flex items-center gap-1 text-primary-fixed hover:text-white transition-colors font-medium text-sm"
            >
              <span className="material-symbols-outlined text-lg">arrow_back</span>
              Volver a Vuelos
            </Link>
            <span className="text-white/20">|</span>
            <div className="flex items-center gap-2">
              <span className="font-bold text-white tracking-wide">AeroGestión</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-secondary text-white font-semibold">
                RF-03
              </span>
            </div>
          </div>
          <div className="text-xs text-primary-fixed-dim hidden sm:block">
            Vuelo <strong className="text-white">{flight.code}</strong> · {flight.aircraft.model}
          </div>
        </div>
      </header>

      {/* Etapas del Proceso */}
      <div className="bg-surface-container-low border-b border-outline-variant/20 py-4 px-4">
        <div className="max-w-4xl mx-auto">
          <ol className="flex items-center justify-between text-xs sm:text-sm font-medium">
            <li className="flex items-center gap-2 text-primary">
              <span className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold">
                ✓
              </span>
              <span>1. Vuelos</span>
            </li>
            <span className="h-0.5 w-8 sm:w-16 bg-primary" />
            <li className="flex items-center gap-2 text-secondary font-bold" aria-current="step">
              <span className="w-6 h-6 rounded-full bg-secondary text-white flex items-center justify-center font-bold">
                2
              </span>
              <span>2. Selección de Asientos</span>
            </li>
            <span className="h-0.5 w-8 sm:w-16 bg-outline-variant/30" />
            <li className="flex items-center gap-2 text-outline-variant">
              <span className="w-6 h-6 rounded-full bg-surface-container-high text-outline flex items-center justify-center">
                3
              </span>
              <span>3. Pago (5 min)</span>
            </li>
            <span className="h-0.5 w-8 sm:w-16 bg-outline-variant/30 hidden md:block" />
            <li className="hidden md:flex items-center gap-2 text-outline-variant">
              <span className="w-6 h-6 rounded-full bg-surface-container-high text-outline flex items-center justify-center">
                4
              </span>
              <span>4. Confirmación</span>
            </li>
          </ol>
        </div>
      </div>

      <main className="max-w-6xl mx-auto px-4 py-8">
        {/* Banner Informativo del Vuelo */}
        <section className="bg-surface-container rounded-2xl p-5 mb-8 border border-outline-variant/20 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-secondary">
                {flight.code} · {flight.isDirect ? 'Vuelo Directo' : 'Con Escalas'}
              </span>
              <span className="text-xs text-outline">•</span>
              <span className="text-xs text-outline">{flight.aircraft.model} ({flight.aircraft.registration})</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-on-surface">
              {flight.originAirport.city} ({flight.originAirport.iataCode}) →{' '}
              {flight.destinationAirport.city} ({flight.destinationAirport.iataCode})
            </h1>
            <p className="text-sm text-outline">
              Salida: <strong className="text-on-surface">{formatFullDate(flight.departureAt)}</strong> a las{' '}
              <strong className="text-on-surface">{formatTime(flight.departureAt)} ART</strong>
            </p>
          </div>

          {/* Selector de Tarifa y Pasajeros */}
          <div className="flex flex-wrap items-center gap-4 bg-surface-container-lowest p-3 rounded-xl border border-outline-variant/20">
            <div>
              <label className="block text-[11px] font-bold uppercase text-outline mb-1">
                Clase / Tarifa
              </label>
              <select
                value={selectedFareId}
                onChange={(e) => {
                  setSelectedFareId(e.target.value);
                  setSelectedSeatIds([]); // Limpiar selección al cambiar clase
                }}
                className="text-xs font-semibold bg-surface border border-outline-variant rounded-lg px-2.5 py-1.5 text-on-surface focus:outline-none focus:ring-2 focus:ring-secondary"
              >
                {allFares.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name} ({f.cabinClass}) - {formatArs(f.price)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase text-outline mb-1">
                Pasajeros (1-9)
              </label>
              <div className="flex items-center border border-outline-variant rounded-lg overflow-hidden bg-surface">
                <button
                  type="button"
                  onClick={() => handlePassengersCountChange(passengersCount - 1)}
                  disabled={passengersCount <= 1}
                  className="px-2.5 py-1 text-xs font-bold hover:bg-surface-container disabled:opacity-30"
                >
                  -
                </button>
                <span className="px-3 py-1 text-xs font-bold">{passengersCount}</span>
                <button
                  type="button"
                  onClick={() => handlePassengersCountChange(passengersCount + 1)}
                  disabled={passengersCount >= 9}
                  className="px-2.5 py-1 text-xs font-bold hover:bg-surface-container disabled:opacity-30"
                >
                  +
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Mensajes de Alerta y Notificación */}
        {errorMessage && (
          <div
            role="alert"
            className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 flex items-start gap-3"
          >
            <span className="material-symbols-outlined shrink-0">error</span>
            <div className="text-sm">
              <strong className="font-bold">Atención: </strong>
              <span>{errorMessage}</span>
            </div>
          </div>
        )}

        {noticeMessage && (
          <div
            role="status"
            className="mb-6 p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-400 flex items-start gap-3"
          >
            <span className="material-symbols-outlined shrink-0">info</span>
            <div className="text-sm font-medium">{noticeMessage}</div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Columna Izquierda: Mapa de Cabina */}
          <section className="lg:col-span-7 bg-surface-container-low rounded-2xl p-6 border border-outline-variant/20 shadow-sm">
            <div className="flex items-center justify-between mb-6 pb-4 border-b border-outline-variant/20">
              <div>
                <h2 className="text-lg font-bold text-on-surface flex items-center gap-2">
                  <span className="material-symbols-outlined text-secondary">flight</span>
                  Mapa Interactivo del Avión
                </h2>
                <p className="text-xs text-outline">
                  Hacé clic en los asientos disponibles para seleccionarlos (Disposición {flight.aircraft.layout ?? '3-3'})
                </p>
              </div>
              <button
                type="button"
                onClick={refreshSeats}
                className="text-xs text-primary hover:underline flex items-center gap-1 font-medium"
              >
                <span className="material-symbols-outlined text-sm">refresh</span>
                Actualizar
              </button>
            </div>

            {/* Leyenda de Estados */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-6 p-3 bg-surface-container rounded-xl text-xs">
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded-md border-2 border-emerald-500 bg-emerald-500/10" />
                <span>Disponible</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded-md bg-secondary text-white font-bold flex items-center justify-center text-[10px]">
                  ✓
                </div>
                <span>Seleccionado</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded-md bg-amber-500/20 border border-amber-500 flex items-center justify-center text-amber-600">
                  <span className="material-symbols-outlined text-[12px]">lock</span>
                </div>
                <span>Bloqueado (5 min)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded-md bg-outline-variant/40 opacity-60" />
                <span>Ocupado</span>
              </div>
            </div>

            {/* Fuselaje del Avión */}
            <div className="relative max-w-md mx-auto bg-surface-container-lowest border-2 border-outline-variant/30 rounded-t-[100px] rounded-b-3xl p-6 pt-12 shadow-inner">
              {/* Nariz / Cabina de mando */}
              <div className="text-center mb-8 pb-4 border-b border-dashed border-outline-variant/30">
                <span className="material-symbols-outlined text-3xl text-outline-variant rotate-180">
                  navigation
                </span>
                <p className="text-[10px] font-bold uppercase tracking-widest text-outline">
                  Cabina de Mando / Frente
                </p>
              </div>

              {/* Filas de Asientos */}
              <div className="space-y-3">
                {rowsMap.map(([rowNum, rowSeats]) => {
                  const isFirstClassRow = rowNum === 1;
                  const leftSeats = is2x2
                    ? rowSeats.slice(0, 2)
                    : rowSeats.slice(0, Math.ceil(rowSeats.length / 2));
                  const rightSeats = is2x2
                    ? rowSeats.slice(2)
                    : rowSeats.slice(Math.ceil(rowSeats.length / 2));

                  return (
                    <div key={rowNum} className="space-y-1">
                      {isFirstClassRow && (
                        <div className="text-center py-1">
                          <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20">
                            ★ Primera Clase
                          </span>
                        </div>
                      )}

                      {rowNum === 2 && (
                        <div className="text-center py-1 pt-2">
                          <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-outline-variant/10 text-outline">
                            Clase Economy
                          </span>
                        </div>
                      )}

                      <div className="flex items-center justify-between gap-1 sm:gap-2">
                        {/* Lado Izquierdo */}
                        <div className="flex items-center gap-1 sm:gap-1.5 flex-1 justify-end">
                          {leftSeats.map((seat) => (
                            <SeatButton
                              key={seat.id}
                              seat={seat}
                              isSelected={selectedSeatIds.includes(seat.id)}
                              selectionIndex={selectedSeatIds.indexOf(seat.id) + 1}
                              targetCabinClass={currentFare?.cabinClass ?? 'ECONOMY'}
                              onClick={() => handleToggleSeat(seat)}
                            />
                          ))}
                        </div>

                        {/* Pasillo central con número de fila */}
                        <div className="w-8 sm:w-10 text-center shrink-0">
                          <span className="text-[11px] font-mono font-bold text-outline">
                            {rowNum}
                          </span>
                        </div>

                        {/* Lado Derecho */}
                        <div className="flex items-center gap-1 sm:gap-1.5 flex-1 justify-start">
                          {rightSeats.map((seat) => (
                            <SeatButton
                              key={seat.id}
                              seat={seat}
                              isSelected={selectedSeatIds.includes(seat.id)}
                              selectionIndex={selectedSeatIds.indexOf(seat.id) + 1}
                              targetCabinClass={currentFare?.cabinClass ?? 'ECONOMY'}
                              onClick={() => handleToggleSeat(seat)}
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Cola del avión */}
              <div className="text-center mt-8 pt-4 border-t border-dashed border-outline-variant/30">
                <p className="text-[10px] font-bold uppercase tracking-widest text-outline">
                  Parte Posterior / Salidas de Emergencia
                </p>
              </div>
            </div>
          </section>

          {/* Columna Derecha: Asignación Nominal & Confirmación */}
          <aside className="lg:col-span-5 space-y-6">
            <div className="bg-surface-container-low rounded-2xl p-6 border border-outline-variant/20 shadow-sm space-y-6">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-secondary">
                  Resumen de la Selección
                </span>
                <h3 className="text-lg font-extrabold text-on-surface">
                  Asientos Elegidos: {selectedSeatIds.length} de {passengersCount}
                </h3>
              </div>

              {/* Lista de asientos seleccionados */}
              <div className="space-y-2">
                {selectedSeatIds.length === 0 ? (
                  <div className="p-4 rounded-xl bg-surface-container text-center text-sm text-outline border border-dashed border-outline-variant/30">
                    Hacé clic en el mapa del avión para seleccionar {passengersCount} asiento(s).
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {selectedSeatIds.map((id, index) => {
                      const seat = seats.find((s) => s.id === id);
                      return (
                        <div
                          key={id}
                          className="px-3 py-1.5 rounded-lg bg-secondary text-white font-bold text-xs flex items-center gap-2 shadow"
                        >
                          <span>Pasajero {index + 1}:</span>
                          <span className="bg-white/20 px-1.5 py-0.5 rounded font-mono">
                            {seat ? `${seat.rowNumber}${seat.columnLetter}` : id}
                          </span>
                          <button
                            type="button"
                            onClick={() => setSelectedSeatIds((prev) => prev.filter((i) => i !== id))}
                            className="text-white/80 hover:text-white font-bold"
                            title="Quitar selección"
                          >
                            ×
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Formulario de Pasajeros */}
              <div className="space-y-4 pt-2 border-t border-outline-variant/20">
                <h4 className="text-xs font-bold uppercase tracking-wider text-outline">
                  Datos de los Pasajeros
                </h4>

                {Array.from({ length: passengersCount }).map((_, index) => {
                  const assignedSeatId = selectedSeatIds[index];
                  const assignedSeat = seats.find((s) => s.id === assignedSeatId);

                  return (
                    <div
                      key={index}
                      className="p-3 rounded-xl bg-surface-container border border-outline-variant/20 space-y-3"
                    >
                      <div className="flex items-center justify-between text-xs font-bold">
                        <span>Pasajero {index + 1}</span>
                        <span className="text-secondary font-mono">
                          {assignedSeat
                            ? `Butaca ${assignedSeat.rowNumber}${assignedSeat.columnLetter}`
                            : 'Sin butaca asignada'}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="text"
                          placeholder="Nombre"
                          value={passengerData[index]?.firstName ?? ''}
                          onChange={(e) => {
                            const val = e.target.value;
                            setPassengerData((prev) => {
                              const next = [...prev];
                              next[index] = { ...next[index]!, firstName: val };
                              return next;
                            });
                          }}
                          className="text-xs px-2.5 py-1.5 rounded-lg bg-surface border border-outline-variant text-on-surface"
                        />
                        <input
                          type="text"
                          placeholder="Apellido"
                          value={passengerData[index]?.lastName ?? ''}
                          onChange={(e) => {
                            const val = e.target.value;
                            setPassengerData((prev) => {
                              const next = [...prev];
                              next[index] = { ...next[index]!, lastName: val };
                              return next;
                            });
                          }}
                          className="text-xs px-2.5 py-1.5 rounded-lg bg-surface border border-outline-variant text-on-surface"
                        />
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <select
                          value={passengerData[index]?.documentType ?? 'DNI'}
                          onChange={(e) => {
                            const val = e.target.value as 'DNI' | 'PASAPORTE';
                            setPassengerData((prev) => {
                              const next = [...prev];
                              next[index] = { ...next[index]!, documentType: val };
                              return next;
                            });
                          }}
                          className="text-xs px-2 py-1.5 rounded-lg bg-surface border border-outline-variant text-on-surface"
                        >
                          <option value="DNI">DNI</option>
                          <option value="PASAPORTE">Pasaporte</option>
                        </select>
                        <input
                          type="text"
                          placeholder="N° Documento"
                          value={passengerData[index]?.documentNumber ?? ''}
                          onChange={(e) => {
                            const val = e.target.value;
                            setPassengerData((prev) => {
                              const next = [...prev];
                              next[index] = { ...next[index]!, documentNumber: val };
                              return next;
                            });
                          }}
                          className="col-span-2 text-xs px-2.5 py-1.5 rounded-lg bg-surface border border-outline-variant text-on-surface"
                        />
                      </div>
                    </div>
                  );
                })}

                <div className="space-y-2 pt-2">
                  <label className="block text-xs font-bold text-outline">
                    Correo Electrónico de Contacto
                  </label>
                  <input
                    type="email"
                    placeholder="ejemplo@uns.edu.ar"
                    value={contactEmail}
                    onChange={(e) => setContactEmail(e.target.value)}
                    className="w-full text-xs px-3 py-2 rounded-lg bg-surface border border-outline-variant text-on-surface"
                  />
                </div>
              </div>

              {/* Cuadro de Precio y Botón de Bloqueo */}
              <div className="pt-4 border-t border-outline-variant/20 space-y-4">
                <div className="flex items-baseline justify-between">
                  <span className="text-xs uppercase font-bold text-outline">Total a pagar:</span>
                  <span className="text-2xl font-black text-secondary">
                    {formatArs(totalAmount)} <small className="text-xs font-normal">ARS</small>
                  </span>
                </div>

                <div className="bg-primary/5 p-3 rounded-xl border border-primary/20 text-xs text-primary space-y-1">
                  <div className="flex items-center gap-1 font-bold">
                    <span className="material-symbols-outlined text-sm">timer</span>
                    Bloqueo Atómico por 5 Minutos (RF-03)
                  </div>
                  <p className="text-[11px] text-outline leading-tight">
                    Al confirmar, tus butacas quedarán congeladas exclusivamente para vos. Tendrás 5 minutos
                    para abonar antes de que se liberen automáticamente.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleConfirmLock}
                  disabled={submitting || selectedSeatIds.length !== passengersCount}
                  className="w-full py-3.5 px-4 rounded-xl bg-secondary text-white font-bold text-sm hover:bg-secondary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg flex items-center justify-center gap-2 cursor-pointer"
                >
                  {submitting ? (
                    <>
                      <span className="material-symbols-outlined animate-spin text-sm">progress_activity</span>
                      Bloqueando plazas atómicamente...
                    </>
                  ) : (
                    <>
                      <span>Bloquear Asientos &amp; Continuar al Pago</span>
                      <span className="material-symbols-outlined text-sm">arrow_forward</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}

function SeatButton({
  seat,
  isSelected,
  selectionIndex,
  targetCabinClass,
  onClick,
}: {
  seat: FlightSeatView;
  isSelected: boolean;
  selectionIndex: number;
  targetCabinClass: CabinClass;
  onClick: () => void;
}) {
  const isMatchClass = seat.cabinClass === targetCabinClass;
  const isLockedByOther = seat.status === 'LOCKED';
  const isOccupied = seat.status === 'OCCUPIED';

  let btnClasses =
    'relative w-8 h-8 sm:w-10 sm:h-10 rounded-lg text-xs font-bold transition-all flex flex-col items-center justify-center ';

  if (isSelected) {
    btnClasses += 'bg-secondary text-white shadow-md ring-2 ring-secondary scale-105 z-10';
  } else if (isOccupied) {
    btnClasses += 'bg-outline-variant/30 text-outline-variant cursor-not-allowed opacity-60';
  } else if (isLockedByOther) {
    btnClasses +=
      'bg-amber-500/20 text-amber-700 dark:text-amber-400 border border-amber-500 cursor-not-allowed';
  } else if (!isMatchClass) {
    btnClasses += 'bg-surface-container text-outline/40 border border-outline-variant/30 opacity-40 hover:opacity-70';
  } else {
    btnClasses +=
      'bg-emerald-500/15 border border-emerald-500/40 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/30 hover:border-emerald-500 cursor-pointer shadow-sm';
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isOccupied || isLockedByOther}
      className={btnClasses}
      title={`${seat.rowNumber}${seat.columnLetter} · ${seat.cabinClass} · ${seat.type} (${
        isSelected ? 'Seleccionado por vos' : seat.status
      })`}
    >
      {isSelected ? (
        <>
          <span className="text-[10px] leading-none font-bold">P{selectionIndex}</span>
          <span className="text-[9px] leading-none opacity-80">{seat.columnLetter}</span>
        </>
      ) : isLockedByOther ? (
        <span className="material-symbols-outlined text-[14px]">lock</span>
      ) : isOccupied ? (
        <span className="material-symbols-outlined text-[14px]">person_off</span>
      ) : (
        <>
          <span className="text-[10px] font-bold leading-none">{seat.columnLetter}</span>
          <span className="text-[8px] leading-none opacity-60">{seat.type === 'WINDOW' ? 'V' : 'P'}</span>
        </>
      )}
    </button>
  );
}
