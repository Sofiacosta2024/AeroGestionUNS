'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import type { PasajeroAfectado, VueloAlternativo } from '@/lib/contingencias';
import { apiRequest, ApiRequestError } from '../../api-client';

export type VueloAlternativoClient = Omit<VueloAlternativo, 'departureAt' | 'arrivalAt'> & {
  departureAt: string | Date;
  arrivalAt: string | Date;
};

type Props = {
  flight: {
    id: string;
    code: string;
    origin: string;
    destination: string;
    originCity: string;
    destinationCity: string;
    departureAt: string;
    arrivalAt: string;
    status: string;
    notes: string | null;
    aircraftRegistration: string;
    aircraftModel: string;
  };
  passengers: PasajeroAfectado[];
  initialAlternativeFlights: VueloAlternativoClient[];
};

function toLocalDateStr(dateVal: string | Date | null | undefined): string {
  if (!dateVal) return '';
  try {
    const d = typeof dateVal === 'string' ? new Date(dateVal) : dateVal;
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Argentina/Buenos_Aires',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d);
  } catch {
    return '';
  }
}

export default function ReallocationView({
  flight,
  passengers: initialPassengers,
  initialAlternativeFlights,
}: Props) {
  const router = useRouter();

  const [passengers, setPassengers] = useState<PasajeroAfectado[]>(initialPassengers);
  const [alternativeFlights] = useState<VueloAlternativoClient[]>(initialAlternativeFlights);

  // Fecha seleccionada para filtrar vuelos alternativos (por defecto la fecha del vuelo o vacio)
  const defaultDateStr = flight.departureAt ? toLocalDateStr(flight.departureAt) : '';
  const [filterDate, setFilterDate] = useState<string>(defaultDateStr);
  const [filterSeatsMode, setFilterSeatsMode] = useState<'sufficient' | 'all'>('all');

  // Pasajeros pendientes
  const pendingPassengers = useMemo(
    () => passengers.filter((p) => !p.isReassigned),
    [passengers],
  );

  // Checkboxes de selección de pasajeros (por default todos los pendientes seleccionados)
  const [selectedPassengerIds, setSelectedPassengerIds] = useState<Set<string>>(() => {
    return new Set(pendingPassengers.map((p) => p.id));
  });

  // Vuelo alternativo seleccionado
  const [selectedFlightId, setSelectedFlightId] = useState<string | null>(null);

  // Estados de proceso y feedback
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Pasajeros efectivamente seleccionados
  const selectedPassengers = useMemo(
    () => pendingPassengers.filter((p) => selectedPassengerIds.has(p.id)),
    [pendingPassengers, selectedPassengerIds],
  );

  // Conteo de pasajeros seleccionados por clase
  const selectedCounts = useMemo(() => {
    let economy = 0;
    let economyPremium = 0;
    let primeraClase = 0;

    for (const p of selectedPassengers) {
      const lower = p.fareName.toLowerCase();
      if (lower.includes('premium') || lower.includes('flex')) economyPremium++;
      else if (lower.includes('primera') || p.cabinClass === 'FIRST' || p.cabinClass === 'BUSINESS') primeraClase++;
      else economy++;
    }

    return {
      total: selectedPassengers.length,
      economy,
      economyPremium,
      primeraClase,
    };
  }, [selectedPassengers]);

  // Filtrado de vuelos alternativos por fecha
  const filteredFlights = useMemo(() => {
    return alternativeFlights.filter((alt) => {
      if (filterDate) {
        const altDateStr = toLocalDateStr(alt.departureAt);
        if (altDateStr !== filterDate) return false;
      }
      return true;
    });
  }, [alternativeFlights, filterDate]);

  // Filtrado según modo de cupos
  const displayedFlights = useMemo(() => {
    return filteredFlights.filter((alt) => {
      if (filterSeatsMode === 'sufficient') {
        let ecoAvail = 0;
        let premAvail = 0;
        let firstAvail = 0;
        for (const f of alt.classAvailability) {
          const lower = f.name.toLowerCase();
          if (lower.includes('premium') || lower.includes('flex')) premAvail += f.availableSeats;
          else if (lower.includes('primera') || f.cabinClass === 'FIRST' || f.cabinClass === 'BUSINESS') firstAvail += f.availableSeats;
          else ecoAvail += f.availableSeats;
        }
        const hasEnoughTotal = alt.availableSeatsTotal >= selectedCounts.total;
        const hasEnoughEco = ecoAvail >= selectedCounts.economy;
        const hasEnoughPrem = premAvail >= selectedCounts.economyPremium;
        const hasEnoughFirst = firstAvail >= selectedCounts.primeraClase;
        return selectedCounts.total > 0
          ? hasEnoughTotal && hasEnoughEco && hasEnoughPrem && hasEnoughFirst
          : alt.availableSeatsTotal > 0;
      }
      return true;
    });
  }, [filteredFlights, filterSeatsMode, selectedCounts]);

  // Vuelo seleccionado actualmente
  const currentSelectedFlight = useMemo(
    () => alternativeFlights.find((f) => f.id === selectedFlightId) || null,
    [alternativeFlights, selectedFlightId],
  );

  // Toggle de selección individual
  function togglePassenger(id: string) {
    setSelectedPassengerIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setErrorMessage(null);
  }

  // Toggle seleccionar todos los pendientes
  const allPendingSelected =
    pendingPassengers.length > 0 && selectedPassengers.length === pendingPassengers.length;

  function toggleSelectAll() {
    if (allPendingSelected) {
      setSelectedPassengerIds(new Set());
    } else {
      setSelectedPassengerIds(new Set(pendingPassengers.map((p) => p.id)));
    }
    setErrorMessage(null);
  }

  // Ejecución de la reasignación
  async function handleReassign() {
    if (!selectedFlightId) {
      setErrorMessage('Por favor seleccione un vuelo de reemplazo.');
      return;
    }

    if (selectedPassengers.length === 0) {
      setErrorMessage('Seleccione al menos un pasajero para reasignar.');
      return;
    }

    // Verificar disponibilidad en cliente antes de enviar
    if (currentSelectedFlight) {
      let ecoAvail = 0;
      let premAvail = 0;
      let firstAvail = 0;

      for (const f of currentSelectedFlight.classAvailability) {
        const lower = f.name.toLowerCase();
        if (lower.includes('premium') || lower.includes('flex')) premAvail += f.availableSeats;
        else if (lower.includes('primera') || f.cabinClass === 'FIRST' || f.cabinClass === 'BUSINESS') firstAvail += f.availableSeats;
        else ecoAvail += f.availableSeats;
      }

      const totalAvail = currentSelectedFlight.availableSeatsTotal;
      const reqTotal = selectedCounts.total;

      if (
        totalAvail < reqTotal ||
        ecoAvail < selectedCounts.economy ||
        premAvail < selectedCounts.economyPremium ||
        firstAvail < selectedCounts.primeraClase
      ) {
        setErrorMessage(
          `El vuelo seleccionado solo dispone de ${totalAvail} asientos libres. Se requieren ${reqTotal} ubicaciones para reasignar a los pasajeros.`
        );
        return;
      }
    }

    setBusy(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    // Obtener los bookingIds de los pasajeros seleccionados
    const uniqueBookingIds = Array.from(new Set(selectedPassengers.map((p) => p.bookingId)));

    try {
      const res = await apiRequest<{
        reallocatedCount: number;
        newFlightCode: string;
        message: string;
      }>('POST', `/api/admin/vuelos/${flight.id}/reprogramar-pasajeros`, {
        newFlightId: selectedFlightId,
        bookingIds: uniqueBookingIds,
      });

      setSuccessMessage(res.message);

      // Actualizar estado local de los pasajeros reasignados
      const reassignedIds = new Set(selectedPassengers.map((p) => p.id));
      setPassengers((prev) =>
        prev.map((p) =>
          reassignedIds.has(p.id)
            ? { ...p, status: 'Reasignado', isReassigned: true }
            : p,
        ),
      );
      setSelectedPassengerIds(new Set());
      router.refresh();
    } catch (err) {
      setErrorMessage(
        err instanceof ApiRequestError
          ? err.message
          : 'Ocurrió un error al reasignar a los pasajeros. Verifique la disponibilidad.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-7xl mx-auto w-full px-4 sm:px-space-lg lg:px-margin pt-space-md flex flex-col gap-6">
      {/* Navegación y encabezado WF-12B */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <nav className="text-xs text-on-surface-variant font-medium flex items-center gap-2 mb-1">
            <Link href="/admin/itinerario" className="hover:text-primary transition-colors">
              Itinerario
            </Link>
            <span>/</span>
            <Link href="/admin/contingencias" className="hover:text-primary transition-colors">
              Contingencias
            </Link>
            <span>/</span>
            <span className="text-primary font-bold">Reasignación</span>
          </nav>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold text-primary tracking-tight">
              Reasignación de pasajeros afectados
            </h1>
            <span className="px-3 py-1 rounded-full bg-red-100 border border-red-200 text-red-700 text-xs font-bold tracking-wide">
              {flight.code} · Cancelado
            </span>
          </div>
          <p className="text-sm text-on-surface-variant mt-1">
            Ruta: {flight.origin} ({flight.originCity}) → {flight.destination} ({flight.destinationCity})
          </p>
        </div>

        <Link
          href="/admin/itinerario"
          className="self-start sm:self-auto inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-surface-container text-primary hover:bg-surface-container-high text-sm font-semibold transition-colors"
        >
          <span className="material-symbols-outlined text-[18px]">arrow_back</span>
          Volver a la planilla
        </Link>
      </div>

      {successMessage && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm font-medium flex items-center gap-3 shadow-sm animate-fade-in">
          <span className="material-symbols-outlined text-emerald-600 text-2xl">
            check_circle
          </span>
          <div className="flex-1">
            <strong className="font-bold">¡Reasignación completada!</strong> {successMessage}
          </div>
          <button
            type="button"
            onClick={() => setSuccessMessage(null)}
            className="text-emerald-700 hover:text-emerald-900 font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {/* Grid principal de dos columnas WF-12B */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Columna Izquierda: Pasajeros afectados */}
        <section className="lg:col-span-7 bg-surface-container-lowest rounded-2xl p-6 shadow-md border border-surface-container-high flex flex-col gap-4">
          <div className="flex items-center justify-between border-b border-surface-container pb-3">
            <h2 className="text-lg font-bold text-primary">
              Pasajeros afectados ({passengers.length})
            </h2>
            <span className="text-xs font-semibold text-on-surface-variant">
              {pendingPassengers.length} pendientes · {passengers.length - pendingPassengers.length} reasignados
            </span>
          </div>

          {passengers.length === 0 ? (
            <div className="p-8 text-center text-on-surface-variant text-sm">
              No hay reservas ni pasajeros registrados en este vuelo.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-surface-container-high text-xs uppercase text-outline font-semibold">
                    <th className="py-2.5 px-2 w-8">
                      <input
                        type="checkbox"
                        checked={allPendingSelected}
                        onChange={toggleSelectAll}
                        disabled={pendingPassengers.length === 0}
                        title="Seleccionar todos los pendientes"
                        className="rounded border-outline-variant text-secondary focus:ring-secondary w-4 h-4 cursor-pointer"
                      />
                    </th>
                    <th className="py-2.5 px-3">Pasajero</th>
                    <th className="py-2.5 px-3">DNI</th>
                    <th className="py-2.5 px-3">Clase</th>
                    <th className="py-2.5 px-3 text-right">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-container text-sm">
                  {passengers.map((p) => {
                    const isSelected = selectedPassengerIds.has(p.id);

                    return (
                      <tr
                        key={p.id}
                        className={`transition-colors ${
                          p.isReassigned
                            ? 'bg-emerald-50/20 text-on-surface-variant'
                            : isSelected
                              ? 'bg-surface-container-low/80 font-medium'
                              : 'hover:bg-surface-container-low/40'
                        }`}
                      >
                        <td className="py-3 px-2">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            disabled={p.isReassigned}
                            onChange={() => togglePassenger(p.id)}
                            className="rounded border-outline-variant text-secondary focus:ring-secondary w-4 h-4 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                          />
                        </td>
                        <td className="py-3 px-3 font-semibold text-primary">
                          {p.fullName}
                          <span className="block text-[11px] text-on-surface-variant font-normal">
                            Reserva: {p.bookingCode}
                          </span>
                        </td>
                        <td className="py-3 px-3 font-mono text-xs text-on-surface-variant">
                          {p.documentNumber || '-'}
                        </td>
                        <td className="py-3 px-3">
                          <span className="text-xs font-semibold text-primary">
                            {p.fareName}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-right">
                          {p.isReassigned ? (
                            <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                              Reasignado
                            </span>
                          ) : (
                            <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200">
                              Pendiente de Reasignación
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Columna Derecha: Vuelos alternativos y panel de reasignación */}
        <section className="lg:col-span-5 bg-surface-container-lowest rounded-2xl p-6 shadow-md border border-surface-container-high flex flex-col gap-4">
          <div className="border-b border-surface-container pb-3">
            <h2 className="text-lg font-bold text-primary">Vuelos alternativos</h2>
            <p className="text-xs text-on-surface-variant mt-0.5">
              Misma ruta: {flight.origin} → {flight.destination}
            </p>
          </div>

          {/* Filtros: Fecha y asientos libres WF-12B */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="filter-date-input" className="block text-xs font-semibold text-on-surface-variant mb-1">
                Fecha
              </label>
              <input
                id="filter-date-input"
                type="date"
                value={filterDate}
                onChange={(e) => setFilterDate(e.target.value)}
                className="w-full rounded-lg border border-outline-variant bg-surface-container-low px-3 py-1.5 text-xs text-primary font-mono focus:border-secondary focus:ring-1 focus:ring-secondary cursor-pointer"
              />
              <div className="flex gap-1.5 mt-1.5">
                <button
                  type="button"
                  onClick={() => setFilterDate(defaultDateStr)}
                  className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-colors border ${
                    filterDate === defaultDateStr
                      ? 'bg-primary text-white border-primary'
                      : 'bg-surface-container-low text-primary border-outline-variant hover:bg-surface-container'
                  }`}
                >
                  Día del vuelo
                </button>
                <button
                  type="button"
                  onClick={() => setFilterDate('')}
                  className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-colors border ${
                    !filterDate
                      ? 'bg-primary text-white border-primary'
                      : 'bg-surface-container-low text-primary border-outline-variant hover:bg-surface-container'
                  }`}
                >
                  Todos los días
                </button>
              </div>
            </div>
            <div>
              <label htmlFor="filter-seats-select" className="block text-xs font-semibold text-on-surface-variant mb-1">
                Asientos libres
              </label>
              <select
                id="filter-seats-select"
                value={filterSeatsMode}
                onChange={(e) => setFilterSeatsMode(e.target.value as 'sufficient' | 'all')}
                className="w-full rounded-lg border border-outline-variant bg-surface-container-low px-3 py-1.5 text-xs text-primary font-medium focus:border-secondary focus:ring-1 focus:ring-secondary cursor-pointer"
              >
                <option value="all">Ver todos los vuelos</option>
                <option value="sufficient">Suficientes por clase</option>
              </select>
            </div>
          </div>

          {/* Lista de vuelos alternativos WF-12B */}
          <div className="flex flex-col gap-3 mt-1">
            {displayedFlights.length === 0 ? (
              <div className="p-6 rounded-xl bg-surface-container-low text-center text-xs text-on-surface-variant">
                No se encontraron vuelos alternativos que coincidan con los filtros seleccionados.
              </div>
            ) : (
              displayedFlights.map((alt) => {
                const isSelected = selectedFlightId === alt.id;
                const departureTimeStr = alt.departureAt
                  ? new Date(alt.departureAt).toLocaleTimeString('es-AR', {
                      hour: '2-digit',
                      minute: '2-digit',
                      timeZone: 'America/Argentina/Buenos_Aires',
                    })
                  : '';

                // Calcular disponibilidad por clase para este vuelo
                let ecoAvail = 0;
                let premAvail = 0;
                let firstAvail = 0;

                for (const f of alt.classAvailability) {
                  const lower = f.name.toLowerCase();
                  if (lower.includes('premium') || lower.includes('flex')) premAvail += f.availableSeats;
                  else if (lower.includes('primera') || f.cabinClass === 'FIRST' || f.cabinClass === 'BUSINESS') firstAvail += f.availableSeats;
                  else ecoAvail += f.availableSeats;
                }

                // Chequeo de elegibilidad frente a los pasajeros actualmente seleccionados
                const hasEnoughTotal = alt.availableSeatsTotal >= selectedCounts.total;
                const hasEnoughEco = ecoAvail >= selectedCounts.economy;
                const hasEnoughPrem = premAvail >= selectedCounts.economyPremium;
                const hasEnoughFirst = firstAvail >= selectedCounts.primeraClase;
                const isSufficientForSelection =
                  selectedCounts.total > 0
                    ? hasEnoughTotal && hasEnoughEco && hasEnoughPrem && hasEnoughFirst
                    : alt.availableSeatsTotal > 0;

                return (
                  <div
                    key={alt.id}
                    onClick={() => {
                      setSelectedFlightId(alt.id);
                      setErrorMessage(null);
                    }}
                    className={`p-3.5 rounded-xl border transition-all cursor-pointer flex flex-col gap-1.5 ${
                      isSelected
                        ? 'border-secondary bg-red-50/20 shadow-md ring-2 ring-secondary/20'
                        : 'border-surface-container-high bg-surface-container-lowest hover:border-outline-variant hover:bg-surface-container-low/30'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <input
                          type="radio"
                          name="selected_flight"
                          checked={isSelected}
                          onChange={() => {
                            setSelectedFlightId(alt.id);
                            setErrorMessage(null);
                          }}
                          className="text-secondary focus:ring-secondary cursor-pointer"
                        />
                        <span className="font-bold text-sm text-primary font-mono">
                          {alt.code} · {departureTimeStr}
                        </span>
                      </div>

                      {isSufficientForSelection ? (
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                          Cupos suficientes
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-red-100 text-red-800 border border-red-200">
                          {alt.availableSeatsTotal} libres
                        </span>
                      )}
                    </div>

                    <div className="text-xs text-on-surface-variant flex flex-wrap gap-x-3 gap-y-1 pl-6">
                      <span>Economy {ecoAvail}</span>
                      <span>·</span>
                      <span>Economy Premium {premAvail}</span>
                      <span>·</span>
                      <span>Primera Clase {firstAvail}</span>
                    </div>

                    {!isSufficientForSelection && (alt.ineligibilityReason || alt.availableSeatsTotal < selectedCounts.total) && (
                      <p className="text-[11px] text-red-700 font-medium pl-6 pt-0.5">
                        {alt.ineligibilityReason || `${alt.code} no dispone de suficientes asientos libres.`}
                      </p>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Resumen de selección dinámica WF-12B */}
          {selectedPassengers.length > 0 && currentSelectedFlight && (
            <div className="p-3 rounded-xl bg-surface-container text-xs text-primary font-medium leading-relaxed">
              <strong>Seleccionados: {selectedCounts.total} pasajeros</strong> ({selectedCounts.economy} Economy ·{' '}
              {selectedCounts.economyPremium} Economy Premium · {selectedCounts.primeraClase} Primera Clase) ·{' '}
              <span className="text-emerald-700 font-bold">
                Cupos en {currentSelectedFlight.code}
              </span>.
            </div>
          )}

          {/* Mensaje de Error / Excepción WF-12B-E1 */}
          {errorMessage && (
            <div
              role="alert"
              className="p-3.5 rounded-xl bg-[#fff1f2] border border-[#fecdd3] text-[#9f1239] text-xs font-semibold leading-relaxed shadow-sm animate-fade-in"
            >
              <div className="flex items-start gap-2">
                <span className="material-symbols-outlined text-red-600 text-[18px] shrink-0 mt-0.5">
                  error
                </span>
                <div>
                  <p>{errorMessage}</p>
                  <p className="text-[10px] text-red-500 font-normal mt-0.5">
                    Los cupos cambiaron por ventas simultáneas o capacidad insuficiente.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Botón de acción masiva WF-12B */}
          <button
            type="button"
            onClick={handleReassign}
            disabled={busy || selectedPassengers.length === 0 || !selectedFlightId}
            className="w-full mt-2 py-3 px-4 rounded-xl bg-secondary hover:bg-secondary/90 text-white font-bold text-sm shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {busy ? (
              <>
                <span className="material-symbols-outlined text-[18px] animate-spin">
                  progress_activity
                </span>
                <span>Reasignando pasajeros...</span>
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-[18px]">
                  airline_seat_recline_normal
                </span>
                <span>Reasignar Pasajeros al Nuevo Vuelo</span>
              </>
            )}
          </button>
        </section>
      </div>
    </div>
  );
}
