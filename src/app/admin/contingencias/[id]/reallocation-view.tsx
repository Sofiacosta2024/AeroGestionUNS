'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import type { BookingStatus } from '@prisma/client';
import { apiRequest, ApiRequestError } from '../../api-client';

type FlightInfo = {
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

type ReservaItem = {
  id: string;
  bookingCode: string;
  leadPassengerName: string;
  companionsCount: number;
  passengersCount: number;
  passengersSummary: string;
  cabinClass: string;
  cabinClassDisplay: string;
  status: BookingStatus;
  respuestaPasajero: 'PENDIENTE' | 'ACEPTA' | 'RECHAZA';
  vueloPropuesto: {
    id: string;
    code: string;
    departureAt: string;
    arrivalAt: string;
  } | null;
  propuestaMotivo: string | null;
  asientosAsignados: string[];
  vueloOriginalCode: string;
  createdAt: string;
};

type Metrics = {
  totalAfectadas: number;
  totalPasajeros: number;
  conPropuesta: number;
  reprogramadas: number;
  sinAlternativa: number;
  pendientesSinRespuesta: number;
};

type Props = {
  flight: FlightInfo;
  initialMetrics: Metrics;
  initialReservas: ReservaItem[];
};

type VueloAlternativoOption = {
  id: string;
  code: string;
  departureAt: string;
  arrivalAt: string;
  aircraftRegistration: string;
  aircraftModel: string;
  totalSeats: number;
  availableSeatsTotal: number;
  classAvailability: {
    fareId: string;
    name: string;
    cabinClass: string;
    availableSeats: number;
    price: number;
  }[];
  isCurrentProposal: boolean;
  hasEnoughSeats: boolean;
  requiredSeats: number;
  availableSeatsInClass: number;
  ineligibilityMessage?: string;
};

export default function ReallocationView({
  flight,
  initialMetrics,
  initialReservas,
}: Props) {
  const router = useRouter();

  const [reservas, setReservas] = useState<ReservaItem[]>(initialReservas);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Estados para Drawer WF-12B-E (Cambiar vuelo)
  const [drawerBooking, setDrawerBooking] = useState<ReservaItem | null>(null);
  const [drawerDateFilter, setDrawerDateFilter] = useState<string>('');
  const [drawerFlights, setDrawerFlights] = useState<VueloAlternativoOption[]>([]);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [drawerSelectedFlightId, setDrawerSelectedFlightId] = useState<string | null>(null);
  const [drawerError, setDrawerError] = useState<string | null>(null);

  // Estados para Modal WF-12B-C (Cancelar reserva por rechazo)
  const [cancelModalBooking, setCancelModalBooking] = useState<ReservaItem | null>(null);

  // Recalcular métricas dinámicas
  const metrics: Metrics = useMemo(() => {
    let conPropuesta = 0;
    let reprogramadas = 0;
    let sinAlternativa = 0;
    let pendientesSinRespuesta = 0;
    let totalPasajeros = 0;

    for (const r of reservas) {
      totalPasajeros += r.passengersCount;
      if (r.status === 'REASIGNACION_PROPUESTA') {
        conPropuesta++;
        if (!r.respuestaPasajero || r.respuestaPasajero === 'PENDIENTE') {
          pendientesSinRespuesta++;
        }
      } else if (r.status === 'REPROGRAMADA') {
        reprogramadas++;
      } else if (r.status === 'SIN_ALTERNATIVA') {
        sinAlternativa++;
      }
    }

    return {
      totalAfectadas: reservas.length,
      totalPasajeros,
      conPropuesta,
      reprogramadas,
      sinAlternativa,
      pendientesSinRespuesta,
    };
  }, [reservas]);

  // Selección en lote
  const toggleSelectRow = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allEligibleSelected =
    reservas.length > 0 &&
    reservas.every((r) => r.status === 'REPROGRAMADA' || selectedIds.has(r.id));

  const toggleSelectAll = () => {
    if (allEligibleSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(reservas.filter((r) => r.status !== 'REPROGRAMADA').map((r) => r.id)));
    }
  };

  // 1. Cambiar respuesta del pasajero (dropdown)
  const handleRespuestaChange = async (bookingId: string, newRespuesta: 'PENDIENTE' | 'ACEPTA' | 'RECHAZA') => {
    try {
      setReservas((prev) =>
        prev.map((r) => (r.id === bookingId ? { ...r, respuestaPasajero: newRespuesta } : r))
      );

      await apiRequest('PATCH', `/api/admin/reservas/${bookingId}/respuesta`, {
        respuesta: newRespuesta,
      });
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Error al actualizar respuesta' });
    }
  };

  // 2. Confirmar individual (botón Confirmar de la fila)
  const handleConfirmSingle = async (bookingId: string) => {
    setBusy(true);
    setFeedback(null);
    try {
      const res = await apiRequest<{ confirmedCount: number; message: string }>(
        'POST',
        '/api/admin/reservas/confirmar-reasignacion',
        { bookingIds: [bookingId] }
      );

      setReservas((prev) =>
        prev.map((r) =>
          r.id === bookingId
            ? { ...r, status: 'REPROGRAMADA', propuestaMotivo: 'Confirmado por Admin' }
            : r
        )
      );
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(bookingId);
        return next;
      });
      setFeedback({ type: 'success', message: res.message });
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Error al confirmar la reserva' });
    } finally {
      setBusy(false);
    }
  };

  // 3. Confirmar seleccionadas (acción masiva)
  const handleConfirmSelected = async () => {
    const toConfirm = reservas.filter(
      (r) => selectedIds.has(r.id) && r.status === 'REASIGNACION_PROPUESTA' && r.respuestaPasajero !== 'RECHAZA'
    );

    if (toConfirm.length === 0) {
      setFeedback({
        type: 'error',
        message: 'No hay reservas seleccionadas aptas para confirmar (deben tener propuesta y no estar en Rechaza).',
      });
      return;
    }

    setBusy(true);
    setFeedback(null);
    try {
      const ids = toConfirm.map((r) => r.id);
      const res = await apiRequest<{ confirmedCount: number; message: string }>(
        'POST',
        '/api/admin/reservas/confirmar-reasignacion',
        { bookingIds: ids }
      );

      const confirmedSet = new Set(ids);
      setReservas((prev) =>
        prev.map((r) =>
          confirmedSet.has(r.id)
            ? { ...r, status: 'REPROGRAMADA', propuestaMotivo: 'Confirmado por Admin' }
            : r
        )
      );
      setSelectedIds(new Set());
      setFeedback({ type: 'success', message: res.message });
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Error al confirmar seleccionadas' });
    } finally {
      setBusy(false);
    }
  };

  // 4. Confirmar pendientes sin respuesta (política 24h)
  const handleConfirmPendientesSinRespuesta = async () => {
    if (metrics.pendientesSinRespuesta === 0) {
      setFeedback({ type: 'error', message: 'No hay reservas pendientes sin respuesta para confirmar.' });
      return;
    }

    setBusy(true);
    setFeedback(null);
    try {
      const res = await apiRequest<{ confirmedCount: number; message: string }>(
        'POST',
        '/api/admin/reservas/confirmar-reasignacion',
        { mode: 'pending_no_response', flightId: flight.id }
      );

      setReservas((prev) =>
        prev.map((r) =>
          r.status === 'REASIGNACION_PROPUESTA' && r.respuestaPasajero === 'PENDIENTE'
            ? { ...r, status: 'REPROGRAMADA', propuestaMotivo: 'Confirmado por Admin' }
            : r
        )
      );
      setFeedback({ type: 'success', message: res.message });
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Error al confirmar pendientes sin respuesta' });
    } finally {
      setBusy(false);
    }
  };

  // 5. Recalcular sin alternativa
  const handleRecalcularSinAlternativa = async () => {
    if (metrics.sinAlternativa === 0) {
      setFeedback({ type: 'error', message: 'No hay reservas sin alternativa para recalcular.' });
      return;
    }

    setBusy(true);
    setFeedback(null);
    try {
      const updated = await apiRequest<{ reservas: ReservaItem[]; metrics: Metrics }>(
        'POST',
        `/api/admin/vuelos/${flight.id}/propuestas`,
        {}
      );

      setReservas(updated.reservas);
      setFeedback({
        type: 'success',
        message: 'Se recalculó el motor de reasignación para las reservas sin alternativa.',
      });
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Error al recalcular alternativas' });
    } finally {
      setBusy(false);
    }
  };

  // 6. Abrir drawer "Cambiar vuelo" WF-12B-E
  const handleOpenDrawer = async (reserva: ReservaItem) => {
    setDrawerBooking(reserva);
    setDrawerSelectedFlightId(reserva.vueloPropuesto?.id || null);
    setDrawerError(null);
    setDrawerLoading(true);
    try {
      const res = await apiRequest<{ flights: VueloAlternativoOption[] }>(
        'GET',
        `/api/admin/reservas/${reserva.id}/vuelos-alternativos`
      );
      setDrawerFlights(res.flights);
      if (res.flights && res.flights.length > 0 && !reserva.vueloPropuesto?.id) {
        setDrawerSelectedFlightId(res.flights[0]?.id || null);
      }
    } catch (err: any) {
      setDrawerError(err.message || 'Error al cargar vuelos alternativos');
    } finally {
      setDrawerLoading(false);
    }
  };

  // Filtrado de vuelos dentro del Drawer WF-12B-E
  const filteredDrawerFlights = useMemo(() => {
    if (!drawerDateFilter) return drawerFlights;
    return drawerFlights.filter((f) => {
      const dStr = f.departureAt ? f.departureAt.slice(0, 10) : '';
      return dStr === drawerDateFilter;
    });
  }, [drawerFlights, drawerDateFilter]);

  // Vuelo seleccionado actualmente en el drawer
  const currentDrawerSelectedFlight = useMemo(() => {
    return drawerFlights.find((f) => f.id === drawerSelectedFlightId) || null;
  }, [drawerFlights, drawerSelectedFlightId]);

  // Ejecutar cambio de vuelo desde drawer
  const handleConfirmCambioVuelo = async () => {
    if (!drawerBooking || !drawerSelectedFlightId || !currentDrawerSelectedFlight) return;

    if (!currentDrawerSelectedFlight.hasEnoughSeats) {
      setDrawerError(
        currentDrawerSelectedFlight.ineligibilityMessage ||
          `El vuelo ${currentDrawerSelectedFlight.code} solo dispone de ${currentDrawerSelectedFlight.availableSeatsInClass} asientos libres. Se requieren ${drawerBooking.passengersCount} para reubicar la reserva ${drawerBooking.bookingCode}.`
      );
      return;
    }

    setBusy(true);
    setDrawerError(null);
    try {
      const res = await apiRequest<{ bookingCode: string; newFlightCode: string; message: string }>(
        'POST',
        `/api/admin/reservas/${drawerBooking.id}/cambiar-vuelo`,
        { newFlightId: drawerSelectedFlightId }
      );

      setReservas((prev) =>
        prev.map((r) =>
          r.id === drawerBooking.id
            ? {
                ...r,
                status: r.status === 'REPROGRAMADA' ? 'REPROGRAMADA' : 'REASIGNACION_PROPUESTA',
                respuestaPasajero: r.status === 'REPROGRAMADA' ? r.respuestaPasajero : 'PENDIENTE',
                vueloPropuesto: {
                  id: currentDrawerSelectedFlight.id,
                  code: currentDrawerSelectedFlight.code,
                  departureAt: currentDrawerSelectedFlight.departureAt,
                  arrivalAt: currentDrawerSelectedFlight.arrivalAt,
                },
                propuestaMotivo: 'Cambiado por Admin',
              }
            : r
        )
      );

      setFeedback({ type: 'success', message: res.message });
      setDrawerBooking(null);
    } catch (err: any) {
      setDrawerError(err.message || 'Error al cambiar vuelo');
    } finally {
      setBusy(false);
    }
  };

  // 7. Abrir modal cancelar reserva WF-12B-C
  const handleOpenCancelModal = (reserva: ReservaItem) => {
    setCancelModalBooking(reserva);
  };

  // Ejecutar cancelación de reserva
  const handleConfirmCancelReserva = async () => {
    if (!cancelModalBooking) return;
    setBusy(true);
    try {
      const res = await apiRequest<{ bookingCode: string; message: string }>(
        'POST',
        `/api/admin/reservas/${cancelModalBooking.id}/cancelar-contingencia`,
        {}
      );

      setReservas((prev) =>
        prev.filter((r) => r.id !== cancelModalBooking.id)
      );

      setFeedback({ type: 'success', message: res.message });
      setCancelModalBooking(null);
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Error al cancelar la reserva' });
    } finally {
      setBusy(false);
    }
  };

  // Formato de hora legible en ART
  const formatDeparture = (iso: string) => {
    try {
      return new Date(iso).toLocaleTimeString('es-AR', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'America/Argentina/Buenos_Aires',
      });
    } catch {
      return '';
    }
  };

  const formatDateDisplay = (iso: string) => {
    try {
      const d = new Date(iso);
      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const year = d.getFullYear();
      const time = d.toLocaleTimeString('es-AR', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'America/Argentina/Buenos_Aires',
      });
      return `${day}/${month}/${year} ${time}`;
    } catch {
      return '';
    }
  };

  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex flex-col gap-6 font-sans">
      {/* 1. Header institucional WF-12B */}
      <div className="rounded-2xl bg-[#170040] text-white p-5 shadow-lg flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-bold tracking-tight">
            Reasignación operativa de pasajeros afectados
          </h1>
          <span className="px-3 py-1 rounded-full bg-[#ba0035] text-white text-xs font-bold tracking-wider uppercase border border-red-400/30">
            {flight.code} · CANCELADO
          </span>
        </div>
        <div className="text-xs text-white/80 font-medium flex items-center gap-2">
          <span>
            {flight.origin} → {flight.destination} · {formatDateDisplay(flight.departureAt)} · Motivo:{' '}
            <strong className="text-white font-bold">{flight.notes?.replace('Cancelado por motivo: ', '') || 'Contingencia'}</strong>
          </span>
          <Link
            href="/admin/itinerario"
            className="ml-3 inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-semibold transition-colors"
          >
            Volver
          </Link>
        </div>
      </div>

      {/* 2. Mensajes de Feedback */}
      {feedback && (
        <div
          role="alert"
          className={`p-4 rounded-xl text-sm font-medium flex items-center justify-between shadow-sm animate-fade-in ${
            feedback.type === 'success'
              ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
              : 'bg-red-50 border border-red-200 text-red-800'
          }`}
        >
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-lg">
              {feedback.type === 'success' ? 'check_circle' : 'error'}
            </span>
            <span>{feedback.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-xs font-bold opacity-70 hover:opacity-100"
          >
            ✕
          </button>
        </div>
      )}

      {/* 3. 4 Tarjetas de Métricas WF-12B */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Reservas afectadas */}
        <div className="bg-white rounded-2xl p-5 border border-surface-container-high shadow-sm flex flex-col gap-1">
          <span className="text-3xl font-extrabold text-[#170040]">
            {metrics.totalAfectadas}
          </span>
          <p className="text-xs text-on-surface-variant font-medium">
            Reservas afectadas · {metrics.totalPasajeros} pasajeros
          </p>
        </div>

        {/* Card 2: Con vuelo propuesto por el sistema */}
        <div className="bg-white rounded-2xl p-5 border border-surface-container-high shadow-sm flex flex-col gap-1">
          <span className="text-3xl font-extrabold text-[#170040]">
            {metrics.conPropuesta}
          </span>
          <p className="text-xs text-on-surface-variant font-medium">
            Con vuelo propuesto por el sistema
          </p>
        </div>

        {/* Card 3: Reprogramadas (confirmadas) */}
        <div className="bg-white rounded-2xl p-5 border border-surface-container-high shadow-sm flex flex-col gap-1">
          <span className="text-3xl font-extrabold text-emerald-600">
            {metrics.reprogramadas}
          </span>
          <p className="text-xs text-on-surface-variant font-medium">
            Reprogramadas (confirmadas)
          </p>
        </div>

        {/* Card 4: Sin alternativa disponible */}
        <div className="bg-white rounded-2xl p-5 border border-surface-container-high shadow-sm flex flex-col gap-1">
          <span className="text-3xl font-extrabold text-amber-600">
            {metrics.sinAlternativa}
          </span>
          <p className="text-xs text-on-surface-variant font-medium">
            Sin alternativa disponible
          </p>
        </div>
      </div>

      {/* 4. Tabla Principal de Reservas Afectadas WF-12B */}
      <div className="bg-white rounded-2xl border border-surface-container-high shadow-sm overflow-hidden flex flex-col">
        {/* Encabezado de la tabla */}
        <div className="px-6 py-4 border-b border-surface-container flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-surface-container-lowest">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-primary">
              Reservas afectadas ({metrics.totalAfectadas})
            </h2>
            <span className="text-xs font-semibold text-on-surface-variant">
              · Seleccionadas: {selectedIds.size}
            </span>
          </div>

          <div className="px-3 py-1 rounded-full bg-surface-container-low border border-surface-container text-[11px] text-on-surface-variant font-medium">
            Criterio automático: misma ruta y clase · salida ≤ 72 h · la más cercana a la original · reserva indivisible
          </div>
        </div>

        {/* Grilla / Tabla */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-surface-container-low/60 text-on-surface-variant font-bold border-b border-surface-container">
              <tr>
                <th className="py-3 px-4 w-10">
                  <input
                    type="checkbox"
                    checked={allEligibleSelected}
                    onChange={toggleSelectAll}
                    aria-label="Seleccionar todas las reservas"
                    className="rounded border-outline-variant text-[#170040] focus:ring-[#170040] cursor-pointer"
                  />
                </th>
                <th className="py-3 px-4 font-semibold">Reserva</th>
                <th className="py-3 px-4 font-semibold">Pasajeros</th>
                <th className="py-3 px-4 font-semibold">Clase</th>
                <th className="py-3 px-4 font-semibold">Vuelo propuesto</th>
                <th className="py-3 px-4 font-semibold">Respuesta del pasajero</th>
                <th className="py-3 px-4 font-semibold">Estado</th>
                <th className="py-3 px-4 text-right font-semibold">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-container text-on-surface">
              {reservas.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-on-surface-variant italic">
                    No hay reservas registradas en este vuelo cancelado.
                  </td>
                </tr>
              ) : (
                reservas.map((reserva) => {
                  const isSelected = selectedIds.has(reserva.id);
                  const isReprogramada = reserva.status === 'REPROGRAMADA';
                  const isSinAlternativa = reserva.status === 'SIN_ALTERNATIVA';
                  const isRechaza = reserva.respuestaPasajero === 'RECHAZA';
                  const canConfirm =
                    reserva.status === 'REASIGNACION_PROPUESTA' &&
                    reserva.vueloPropuesto !== null &&
                    !isRechaza;

                  return (
                    <tr
                      key={reserva.id}
                      className={`hover:bg-surface-container-low/30 transition-colors ${
                        isSelected ? 'bg-indigo-50/20' : ''
                      }`}
                    >
                      {/* Checkbox */}
                      <td className="py-3.5 px-4">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          disabled={isReprogramada}
                          onChange={() => toggleSelectRow(reserva.id)}
                          aria-label={`Seleccionar reserva ${reserva.bookingCode}`}
                          className="rounded border-outline-variant text-[#170040] focus:ring-[#170040] cursor-pointer disabled:opacity-40"
                        />
                      </td>

                      {/* Código de reserva */}
                      <td className="py-3.5 px-4 font-mono font-bold text-sm text-primary">
                        {reserva.bookingCode}
                      </td>

                      {/* Pasajeros */}
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-primary">{reserva.leadPassengerName}</div>
                        <div className="text-[11px] text-on-surface-variant">{reserva.passengersSummary}</div>
                      </td>

                      {/* Clase */}
                      <td className="py-3.5 px-4 font-bold text-primary">
                        {reserva.cabinClassDisplay}
                      </td>

                      {/* Vuelo propuesto */}
                      <td className="py-3.5 px-4">
                        {reserva.vueloPropuesto ? (
                          <div>
                            <div className="font-bold text-primary font-mono text-xs">
                              {reserva.vueloPropuesto.code} · {formatDeparture(reserva.vueloPropuesto.departureAt)}
                            </div>
                            <div className="text-[11px] text-on-surface-variant">
                              {reserva.propuestaMotivo || 'Propuesta automática'}
                            </div>
                          </div>
                        ) : (
                          <div className="text-on-surface-variant italic text-[11px]">
                            {reserva.propuestaMotivo || 'Sin vuelo con cupo en las próximas 72 h'}
                          </div>
                        )}
                      </td>

                      {/* Respuesta del pasajero (Dropdown) */}
                      <td className="py-3.5 px-4">
                        {isSinAlternativa ? (
                          <span className="text-on-surface-variant">—</span>
                        ) : (
                          <div className="relative inline-block">
                            <select
                              value={reserva.respuestaPasajero}
                              disabled={isReprogramada || busy}
                              onChange={(e) =>
                                handleRespuestaChange(
                                  reserva.id,
                                  e.target.value as 'PENDIENTE' | 'ACEPTA' | 'RECHAZA'
                                )
                              }
                              aria-label={`Respuesta del pasajero para reserva ${reserva.bookingCode}`}
                              className={`appearance-none text-xs font-bold rounded-lg px-2.5 py-1 pr-6 border cursor-pointer focus:outline-none focus:ring-1 focus:ring-offset-1 transition-all ${
                                reserva.respuestaPasajero === 'ACEPTA'
                                  ? 'bg-emerald-50 text-emerald-800 border-emerald-300 focus:ring-emerald-500'
                                  : reserva.respuestaPasajero === 'RECHAZA'
                                  ? 'bg-red-50 text-red-800 border-red-300 focus:ring-red-500'
                                  : 'bg-slate-50 text-slate-800 border-slate-300 focus:ring-slate-500'
                              } disabled:opacity-60 disabled:cursor-not-allowed`}
                            >
                              <option value="PENDIENTE">Pendiente ▾</option>
                              <option value="ACEPTA">Acepta ▾</option>
                              <option value="RECHAZA">Rechaza ▾</option>
                            </select>
                            <span className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] text-on-surface-variant">
                              ▼
                            </span>
                          </div>
                        )}
                      </td>

                      {/* Estado */}
                      <td className="py-3.5 px-4">
                        {reserva.status === 'REPROGRAMADA' ? (
                          <span className="inline-block px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                            REPROGRAMADA
                          </span>
                        ) : reserva.status === 'SIN_ALTERNATIVA' ? (
                          <span className="inline-block px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                            SIN_ALTERNATIVA
                          </span>
                        ) : (
                          <span className="inline-block px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-purple-100 text-purple-900 border border-purple-200">
                            REASIGNACIÓN_PROPUESTA
                          </span>
                        )}
                      </td>

                      {/* Acciones */}
                      <td className="py-3.5 px-4 text-right">
                        {isReprogramada ? (
                          <span className="text-[11px] text-outline italic">Sin acciones</span>
                        ) : (
                          <div className="inline-flex items-center gap-1.5">
                            {/* Botón Confirmar */}
                            <button
                              type="button"
                              onClick={() => handleConfirmSingle(reserva.id)}
                              disabled={!canConfirm || busy}
                              className="px-2.5 py-1 rounded-md bg-[#170040] hover:bg-[#280666] text-white font-semibold text-[11px] transition-colors disabled:opacity-30 disabled:cursor-not-allowed shadow-xs"
                            >
                              Confirmar
                            </button>

                            {/* Botón Cambiar vuelo */}
                            <button
                              type="button"
                              onClick={() => handleOpenDrawer(reserva)}
                              disabled={busy}
                              className="px-2.5 py-1 rounded-md border border-outline-variant hover:bg-surface-container font-semibold text-[11px] text-primary transition-colors disabled:opacity-50"
                            >
                              Cambiar vuelo
                            </button>

                            {/* Botón Cancelar */}
                            <button
                              type="button"
                              onClick={() => handleOpenCancelModal(reserva)}
                              disabled={busy}
                              className="px-2.5 py-1 rounded-md border border-red-200 hover:bg-red-50 font-semibold text-[11px] text-red-600 transition-colors disabled:opacity-50"
                            >
                              Cancelar
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Barra inferior de acciones masivas WF-12B */}
        <div className="px-6 py-3.5 bg-surface-container-low/60 border-t border-surface-container flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="text-xs font-semibold text-primary mr-1">
              {selectedIds.size} seleccionadas
            </span>

            {/* Confirmar seleccionadas */}
            <button
              type="button"
              onClick={handleConfirmSelected}
              disabled={busy || selectedIds.size === 0}
              className="px-3.5 py-1.5 rounded-lg bg-[#170040] hover:bg-[#250d54] text-white font-bold text-xs shadow-xs transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Confirmar seleccionadas
            </button>

            {/* Confirmar pendientes sin respuesta */}
            <button
              type="button"
              onClick={handleConfirmPendientesSinRespuesta}
              disabled={busy || metrics.pendientesSinRespuesta === 0}
              className="px-3.5 py-1.5 rounded-lg border border-outline-variant bg-white hover:bg-surface-container text-primary font-bold text-xs shadow-xs transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Confirmar pendientes sin respuesta ({metrics.pendientesSinRespuesta})
            </button>

            {/* Recalcular sin alternativa */}
            <button
              type="button"
              onClick={handleRecalcularSinAlternativa}
              disabled={busy || metrics.sinAlternativa === 0}
              className="px-3.5 py-1.5 rounded-lg border border-outline-variant bg-white hover:bg-surface-container text-primary font-bold text-xs shadow-xs transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Recalcular sin alternativa ({metrics.sinAlternativa})
            </button>
          </div>

          <div className="text-xs text-on-surface-variant font-medium">
            Mostrando {reservas.length} de {metrics.totalAfectadas}
          </div>
        </div>
      </div>

      {/* 5. Leyenda informativa inferior WF-12B */}
      <div className="p-4 rounded-xl bg-surface-container-low border border-surface-container text-xs text-on-surface-variant leading-relaxed">
        <strong>Regla de selección automática:</strong> misma ruta y misma clase · salida dentro de las 72 h
        posteriores a la original (y al menos 2 h desde ahora) · se elige el vuelo con salida más cercana a la
        original · la reserva se mueve completa (no se separa a los pasajeros) · prioridad de asignación: Primera
        Clase → Eco. Premium → Economy, luego por fecha de compra.
      </div>

      {/* ========================================================================= */}
      {/* 6. Panel Lateral Slide-Over "Cambiar vuelo" WF-12B-E                      */}
      {/* ========================================================================= */}
      {drawerBooking && (
        <div className="fixed inset-0 z-50 overflow-hidden bg-black/40 backdrop-blur-xs flex justify-end animate-fade-in">
          <div className="w-full max-w-md bg-white h-full shadow-2xl border-l border-surface-container flex flex-col justify-between">
            {/* Header del Drawer */}
            <div className="p-5 border-b border-surface-container flex items-start justify-between">
              <div>
                <h3 className="text-base font-bold text-primary">
                  Cambiar vuelo · Reserva {drawerBooking.bookingCode}
                </h3>
                <p className="text-xs text-on-surface-variant mt-0.5">
                  {drawerBooking.leadPassengerName} {drawerBooking.companionsCount > 0 ? `+${drawerBooking.companionsCount}` : ''} ·{' '}
                  {drawerBooking.cabinClassDisplay} · {flight.origin} → {flight.destination}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDrawerBooking(null)}
                className="text-on-surface-variant hover:text-primary font-bold text-lg p-1"
                aria-label="Cerrar panel"
              >
                ✕
              </button>
            </div>

            {/* Cuerpo del Drawer */}
            <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4">
              {/* Filtro por fecha */}
              <div>
                <label htmlFor="drawer-date-input" className="block text-xs font-semibold text-primary mb-1">
                  Filtrar por fecha
                </label>
                <input
                  id="drawer-date-input"
                  type="date"
                  value={drawerDateFilter}
                  onChange={(e) => setDrawerDateFilter(e.target.value)}
                  className="w-full rounded-lg border border-outline-variant bg-surface-container-low px-3 py-1.5 text-xs text-primary font-mono focus:border-secondary focus:ring-1 focus:ring-secondary cursor-pointer"
                />
              </div>

              {/* Lista de vuelos alternativos */}
              <div>
                <h4 className="text-xs font-bold text-primary mb-2">
                  Vuelos alternativos (misma ruta · ordenados por cercanía a la salida original)
                </h4>

                {drawerLoading ? (
                  <div className="p-8 text-center text-xs text-on-surface-variant flex items-center justify-center gap-2">
                    <span className="material-symbols-outlined animate-spin text-base">progress_activity</span>
                    <span>Cargando vuelos alternativos...</span>
                  </div>
                ) : filteredDrawerFlights.length === 0 ? (
                  <div className="p-6 rounded-xl bg-surface-container-low text-center text-xs text-on-surface-variant">
                    No se encontraron vuelos alternativos disponibles en esa fecha.
                  </div>
                ) : (
                  <div className="flex flex-col gap-2.5">
                    {filteredDrawerFlights.map((cand) => {
                      const isSelected = drawerSelectedFlightId === cand.id;
                      const isCurrentProp = cand.isCurrentProposal;

                      let ecoAvail = 0;
                      let premAvail = 0;
                      let firstAvail = 0;
                      for (const f of cand.classAvailability) {
                        const lower = f.name.toLowerCase();
                        if (lower.includes('premium')) premAvail += f.availableSeats;
                        else if (lower.includes('primera') || f.cabinClass === 'FIRST') firstAvail += f.availableSeats;
                        else ecoAvail += f.availableSeats;
                      }

                      return (
                        <div
                          key={cand.id}
                          onClick={() => {
                            setDrawerSelectedFlightId(cand.id);
                            setDrawerError(null);
                          }}
                          className={`p-3.5 rounded-xl border transition-all cursor-pointer flex flex-col gap-1.5 ${
                            isSelected
                              ? 'border-secondary bg-red-50/20 shadow-xs ring-1 ring-secondary'
                              : 'border-surface-container-high bg-white hover:border-outline-variant hover:bg-surface-container-low/30'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <input
                                type="radio"
                                name="drawer_flight"
                                checked={isSelected}
                                onChange={() => {
                                  setDrawerSelectedFlightId(cand.id);
                                  setDrawerError(null);
                                }}
                                aria-label={`Seleccionar vuelo ${cand.code}`}
                                className="text-secondary focus:ring-secondary cursor-pointer"
                              />
                              <span className="font-bold text-xs text-primary font-mono">
                                {cand.code} · {cand.departureAt.slice(0, 10)} {formatDeparture(cand.departureAt)}
                              </span>
                            </div>

                            {isSelected ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-pink-100 text-pink-900 border border-pink-200">
                                Seleccionado
                              </span>
                            ) : isCurrentProp ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-900 border border-purple-200">
                                Propuesta actual
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-800 border border-slate-200">
                                Disponible
                              </span>
                            )}
                          </div>

                          <div className="text-[11px] text-on-surface-variant flex flex-wrap gap-x-2 gap-y-0.5 pl-5">
                            <span>Libres: Economy {ecoAvail}</span>
                            <span>·</span>
                            <span>Eco. Premium {premAvail}</span>
                            <span>·</span>
                            <span>Primera {firstAvail}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Detalle de requerimiento */}
              <div className="text-xs text-primary font-semibold">
                Requeridos para esta reserva: {drawerBooking.cabinClass} {drawerBooking.passengersCount}
              </div>

              {/* Alerta de Error / Excepción literal WF-12B-E */}
              {currentDrawerSelectedFlight && !currentDrawerSelectedFlight.hasEnoughSeats && (
                <div
                  role="alert"
                  className="p-3.5 rounded-xl bg-[#fff1f2] border border-[#fecdd3] text-[#9f1239] text-xs font-semibold leading-relaxed shadow-xs animate-fade-in"
                >
                  {currentDrawerSelectedFlight.ineligibilityMessage ||
                    `El vuelo ${currentDrawerSelectedFlight.code} solo dispone de ${currentDrawerSelectedFlight.availableSeatsInClass} asientos libres en ${drawerBooking.cabinClass}. Se requieren ${drawerBooking.passengersCount} para reubicar la reserva ${drawerBooking.bookingCode}.`}
                </div>
              )}

              {drawerError && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs font-medium">
                  {drawerError}
                </div>
              )}
            </div>

            {/* Footer del Drawer */}
            <div className="p-5 border-t border-surface-container bg-surface-container-lowest">
              <button
                type="button"
                onClick={handleConfirmCambioVuelo}
                disabled={
                  busy ||
                  !currentDrawerSelectedFlight ||
                  !currentDrawerSelectedFlight.hasEnoughSeats
                }
                className="w-full py-2.5 px-4 rounded-xl bg-secondary hover:bg-secondary/90 text-white font-bold text-xs shadow-md transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {busy ? (
                  <>
                    <span className="material-symbols-outlined text-base animate-spin">progress_activity</span>
                    <span>Confirmando cambio...</span>
                  </>
                ) : (
                  <span>Confirmar cambio de vuelo</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 7. Modal de Cancelación de Reserva por Rechazo WF-12B-C                   */}
      {/* ========================================================================= */}
      {cancelModalBooking && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in">
          <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-surface-container overflow-hidden">
            <div className="p-6 flex flex-col gap-4">
              <h3 className="text-lg font-bold text-primary">
                ¿Cancelar la reserva {cancelModalBooking.bookingCode}?
              </h3>

              <p className="text-xs text-on-surface-variant leading-relaxed">
                La pasajera rechazó las alternativas ofrecidas. Al confirmar se libera el asiento en el vuelo propuesto
                y la reserva pasa a <strong className="text-primary font-bold">CANCELADO</strong> con reembolso
                pendiente de gestión en mostrador.
              </p>

              {/* Cuadro de resumen WF-12B-C */}
              <div className="rounded-xl bg-surface-container-low border border-surface-container p-4 text-xs flex flex-col gap-2">
                <div className="grid grid-cols-3 gap-2">
                  <span className="text-on-surface-variant font-medium">Pasajero/a:</span>
                  <span className="col-span-2 font-bold text-primary">
                    {cancelModalBooking.leadPassengerName} · {cancelModalBooking.cabinClassDisplay}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <span className="text-on-surface-variant font-medium">Vuelo cancelado:</span>
                  <span className="col-span-2 font-semibold text-primary">
                    {flight.code} · {formatDateDisplay(flight.departureAt)}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <span className="text-on-surface-variant font-medium">Asiento que se libera:</span>
                  <span className="col-span-2 font-semibold text-primary">
                    {cancelModalBooking.vueloPropuesto?.code || 'Vuelo propuesto'} ·{' '}
                    {cancelModalBooking.asientosAsignados.length > 0
                      ? cancelModalBooking.asientosAsignados.join(', ')
                      : 'Asiento retenido'}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <span className="text-on-surface-variant font-medium">Motivo registrado:</span>
                  <span className="col-span-2 font-bold text-red-700">
                    Contingencia – rechaza alternativas
                  </span>
                </div>
              </div>

              {/* Botones de acción WF-12B-C */}
              <div className="flex items-center justify-end gap-3 mt-2">
                <button
                  type="button"
                  onClick={() => setCancelModalBooking(null)}
                  disabled={busy}
                  className="px-4 py-2 rounded-xl border border-outline-variant bg-white hover:bg-surface-container text-primary font-semibold text-xs transition-colors"
                >
                  Volver
                </button>

                <button
                  type="button"
                  onClick={handleConfirmCancelReserva}
                  disabled={busy}
                  className="px-4 py-2 rounded-xl bg-secondary hover:bg-secondary/90 text-white font-bold text-xs shadow-md transition-colors disabled:opacity-50 flex items-center gap-1.5"
                >
                  {busy ? (
                    <>
                      <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span>
                      <span>Cancelando...</span>
                    </>
                  ) : (
                    <span>Cancelar reserva</span>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
