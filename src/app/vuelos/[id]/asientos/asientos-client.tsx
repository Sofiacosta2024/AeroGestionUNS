'use client';

import { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { CabinClass } from '@prisma/client';
import type { FlightSeatView } from '@/lib/seat-locks';

const AVATAR =
  'https://lh3.googleusercontent.com/aida/AEtjO1WEhfaUl0efpt8MGhPU4BBSstKaHhbeJkOote0mUJ6_jYF6PAiF6FJ3oV7QSAdXoJj44L0BuwK0AMb8x9jtVQ3_fy7ZsUgPcH9cyj-MAcA7WCfUbepbSac9uc1dl-esKJHlvyljleDzT7OiNIG0e0zFh0Xe8ICzkK0eg0ZK6ZNHsIYEAclfRhCoKbMbUSqDQdarW6j9TqCWU1zKs56C4wu8KN0_Goo_-hECEtlTYqVYoNRpNtJjTTxrdHc';

const DESTINATION_IMG =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuCLDPhxkwdDvpLHuGzES1myvcdH258uoB2RRlHnZFL3B7dQqE0xT7sbyFIng7ClMZ-yqFZIU0yIy7gAhjYnUbKF8wrWFEwWGczPInNzM_Y6fzxH2vTHA1q7e7eBDb-DaZA7IVnuNQ_XMnOZOOz5bznlTseZved6oT30VJkdCMly2qQwMPEPaPsM4N0OvFbwmzuMtXwW20Qn--T1QbkDKjsSqqRqeVXJr-7FcjUmEs0caK4iJgQeCX_F';

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

// Pasajeros por defecto basados en la maqueta
const DEFAULT_PASSENGERS_MOCK = [
  { firstName: 'Mariano', lastName: 'Rodríguez', typeLabel: 'Adulto · Pasajero 1', initials: 'MR' },
  { firstName: 'Lucía Belén', lastName: 'Gómez', typeLabel: 'Adulto · Pasajero 2', initials: 'LG' },
  { firstName: 'Carlos', lastName: 'Fernández', typeLabel: 'Adulto · Pasajero 3', initials: 'CF' },
  { firstName: 'Sofía', lastName: 'Martínez', typeLabel: 'Adulto · Pasajero 4', initials: 'SM' },
  { firstName: 'Joaquín', lastName: 'Gutiérrez', typeLabel: 'Adulto · Pasajero 5', initials: 'JG' },
  { firstName: 'Valentina', lastName: 'Díaz', typeLabel: 'Adulto · Pasajero 6', initials: 'VD' },
  { firstName: 'Mateo', lastName: 'Romero', typeLabel: 'Adulto · Pasajero 7', initials: 'MR' },
  { firstName: 'Camila', lastName: 'Álvarez', typeLabel: 'Adulto · Pasajero 8', initials: 'CA' },
  { firstName: 'Ignacio', lastName: 'Torres', typeLabel: 'Adulto · Pasajero 9', initials: 'IT' },
];

// Asientos que se muestran ocupados en la maqueta de referencia
const MOCKUP_OCCUPIED_SEATS = new Set([
  '10A', '10B', '10E', '10F',
  '11A', '11D', '11E',
  '12C', '12E', '12F',
  '13C', '13F',
  '14C', '14D',
  '15A', '15D', '15E',
]);

export default function AsientosClient({
  flight,
  initialFare,
  allFares,
  initialSeats,
  initialPassengersCount,
  currentUser,
}: AsientosClientProps) {
  const router = useRouter();

  // Asegurar al menos 2 pasajeros por defecto para coincidir con la maqueta
  const [passengersCount] = useState<number>(() => Math.max(2, initialPassengersCount));

  // Inicializar asientos seleccionados con 12A y 12B como en la maqueta
  const [selectedSeatIds, setSelectedSeatIds] = useState<string[]>(() => {
    const s12A = initialSeats.find((s) => s.rowNumber === 12 && s.columnLetter === 'A');
    const s12B = initialSeats.find((s) => s.rowNumber === 12 && s.columnLetter === 'B');
    const defaults: string[] = [];
    if (s12A) defaults.push(s12A.id);
    if (s12B) defaults.push(s12B.id);

    const needed = Math.max(2, initialPassengersCount);
    if (defaults.length < needed) {
      const freeSeats = initialSeats.filter(
        (s) =>
          s.status === 'FREE' &&
          !MOCKUP_OCCUPIED_SEATS.has(`${s.rowNumber}${s.columnLetter}`) &&
          s.cabinClass === (initialFare?.cabinClass ?? 'ECONOMY') &&
          !defaults.includes(s.id),
      );
      for (let i = 0; i < freeSeats.length && defaults.length < needed; i++) {
        defaults.push(freeSeats[i]!.id);
      }
    }
    return defaults;
  });

  const [seats, setSeats] = useState<FlightSeatView[]>(initialSeats);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Reloj oficial ART
  const [clock, setClock] = useState('14:32:08 UTC-3');
  useEffect(() => {
    const tick = () => {
      const time = new Intl.DateTimeFormat('es-AR', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
        timeZone: 'America/Argentina/Buenos_Aires',
      }).format(new Date());
      setClock(`${time} UTC-3`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  // Temporizador regresivo de 5 minutos (04:55 MIN)
  const [secondsRemaining, setSecondsRemaining] = useState(295); // 04:55
  useEffect(() => {
    const timer = setInterval(() => {
      setSecondsRemaining((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formattedTimer = useMemo(() => {
    const m = Math.floor(secondsRemaining / 60);
    const s = secondsRemaining % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')} MIN`;
  }, [secondsRemaining]);

  const currentFare = initialFare ?? allFares[0];

  // Agrupamiento por filas
  const seatsByRow = useMemo(() => {
    const map = new Map<number, FlightSeatView[]>();
    for (const seat of seats) {
      if (!map.has(seat.rowNumber)) map.set(seat.rowNumber, []);
      map.get(seat.rowNumber)!.push(seat);
    }
    for (const [_, list] of map) {
      list.sort((a, b) => a.columnLetter.localeCompare(b.columnLetter));
    }
    return map;
  }, [seats]);

  // Selección de asientos
  const handleSeatClick = (seat: FlightSeatView) => {
    setErrorMessage(null);

    if (selectedSeatIds.includes(seat.id)) {
      setSelectedSeatIds((prev) => prev.filter((id) => id !== seat.id));
      return;
    }

    if (seat.status === 'OCCUPIED' || MOCKUP_OCCUPIED_SEATS.has(`${seat.rowNumber}${seat.columnLetter}`)) {
      setErrorMessage(`El asiento ${seat.rowNumber}${seat.columnLetter} está ocupado.`);
      return;
    }
    if (seat.status === 'LOCKED') {
      setErrorMessage(
        `El asiento ${seat.rowNumber}${seat.columnLetter} está bloqueado temporalmente por otro usuario.`,
      );
      return;
    }

    if (selectedSeatIds.length >= passengersCount) {
      // Reemplaza el último si ya alcanzó el cupo de pasajeros
      setSelectedSeatIds((prev) => [...prev.slice(0, passengersCount - 1), seat.id]);
      return;
    }

    setSelectedSeatIds((prev) => [...prev, seat.id]);
  };

  // Refrescar mapa
  const refreshSeats = async () => {
    try {
      const res = await fetch(`/api/flights/${flight.id}/seats?fareId=${currentFare?.id}`);
      const json = await res.json();
      if (json.ok) setSeats(json.data.seats);
    } catch {
      // ignore
    }
  };

  // Confirmar y continuar al Pago (Paso 3)
  const handleProceedToPayment = async () => {
    setErrorMessage(null);

    if (selectedSeatIds.length === 0) {
      setErrorMessage('Debés seleccionar al menos un asiento.');
      return;
    }

    setSubmitting(true);
    try {
      const passengersPayload = selectedSeatIds.map((_, i) => ({
        firstName: DEFAULT_PASSENGERS_MOCK[i]?.firstName ?? `Pasajero`,
        lastName: DEFAULT_PASSENGERS_MOCK[i]?.lastName ?? `${i + 1}`,
        documentType: 'DNI' as const,
        documentNumber: `4${Math.floor(1000000 + Math.random() * 9000000)}`,
      }));

      const res = await fetch(`/api/flights/${flight.id}/lock-seats`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fareId: currentFare?.id,
          seatIds: selectedSeatIds,
          contactEmail: currentUser?.email ?? 'mariano.rodriguez@example.com',
          passengers: passengersPayload,
        }),
      });

      const json = await res.json();

      if (!res.ok || !json.ok) {
        if (res.status === 409) {
          setErrorMessage(
            json.error?.message === 'Asiento no disponible'
              ? 'Asiento no disponible: una de las butacas fue seleccionada por otro usuario. Por favor elegí otro lugar.'
              : json.error?.message,
          );
          await refreshSeats();
          setSelectedSeatIds([]);
          return;
        }
        throw new Error(json.error?.message || 'Error al bloquear asientos');
      }

      router.push(`/pago/${json.data.bookingCode}`);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Error inesperado al bloquear asientos');
    } finally {
      setSubmitting(false);
    }
  };

  // Total de asientos libres
  const freeSeatsCount = useMemo(() => seats.filter((s) => s.status === 'FREE').length, [seats]);

  return (
    <div className="min-h-screen bg-[#f8f9fd] text-[#170040] font-sans antialiased">
      {/* 1. TOP NAVBAR HEADER */}
      <header className="bg-[#2e1065] text-white px-6 py-3 border-b border-white/10 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Link href="/vuelos" className="flex items-center gap-2 group">
            <div className="w-8 h-8 rounded-lg bg-[#2e1065] border border-white/10 flex items-center justify-center">
              <svg className="w-5 h-5 text-[#E11D48]" fill="none" viewBox="0 0 40 40">
                <path d="M9 20.5L25.5 12L21 21.5L29 27L24 28L18 24.5L14 28.5L13.5 24L9 20.5Z" fill="currentColor" />
                <circle cx="28.5" cy="13.5" fill="#f43f5e" r="2.8" />
              </svg>
            </div>
            <div>
              <div className="flex items-baseline gap-1 leading-none">
                <span className="font-extrabold text-base tracking-tight text-white">AeroGestión</span>
                <span className="font-black text-base text-[#E11D48]">UNS</span>
              </div>
              <span className="text-[9px] font-semibold tracking-wider text-purple-200/60 uppercase block mt-0.5">
                SISTEMA OPERATIVO AERONÁUTICO
              </span>
            </div>
          </Link>

          {/* Pill BHI HUB */}
          <div className="hidden sm:flex items-center gap-2 bg-[#250d4d] border border-white/10 px-3 py-1 rounded-full text-xs font-semibold text-white/90">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span>BHI HUB · OPERATIVO</span>
          </div>
        </div>

        {/* Middle Navigation */}
        <nav className="hidden lg:flex items-center gap-2">
          <Link
            href="/vuelos"
            className="bg-[#BA0035] hover:bg-[#a0002d] text-white font-bold text-xs px-4 py-2 rounded-lg transition-colors shadow-sm"
          >
            Buscar Vuelos
          </Link>
          <button
            type="button"
            className="text-white/80 hover:text-white font-semibold text-xs px-3 py-2 transition-colors cursor-pointer"
          >
            Mis Reservas
          </button>
          <button
            type="button"
            className="text-white/80 hover:text-white font-semibold text-xs px-3 py-1.5 leading-tight text-center transition-colors cursor-pointer"
          >
            Check-in
            <br />
            Online
          </button>
          <Link
            href="/admin"
            className="text-white/80 hover:text-white font-semibold text-xs px-3 py-1.5 leading-tight text-center transition-colors"
          >
            Alta de Vuelos
            <br />
            [Admin]
          </Link>
        </nav>

        {/* Right User & Telemetry */}
        <div className="flex items-center gap-4">
          <div className="text-right hidden sm:block leading-tight">
            <span className="text-xs font-bold text-white block">{clock}</span>
            <span className="text-[9px] font-semibold text-purple-200/50 uppercase tracking-wider">
              HORA OFICIAL ART
            </span>
          </div>

          {/* Notificaciones */}
          <div className="relative cursor-pointer text-white/80 hover:text-white">
            <span className="material-symbols-outlined text-xl">notifications</span>
            <span className="absolute top-0 right-0 w-2 h-2 rounded-full bg-[#E11D48]" />
          </div>

          {/* Usuario Cmdte. Morales */}
          <div className="flex items-center gap-2.5 bg-[#250d4d] border border-white/10 rounded-full pl-3 pr-1.5 py-1">
            <div className="text-right leading-tight">
              <span className="text-xs font-bold text-white block">Cmdte. Morales</span>
              <span className="text-[9px] text-purple-200/60 font-medium">Pasajero Frecuente</span>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={AVATAR}
              alt="Avatar Cmdte. Morales"
              className="w-7 h-7 rounded-full object-cover border border-purple-400"
            />
          </div>
        </div>
      </header>

      {/* 2. STEPPER PROGRESS BAR */}
      <div className="bg-white border-b border-gray-100 py-3 px-6 sm:px-12">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          {/* Paso 1 */}
          <div className="flex items-center gap-2.5">
            <div className="w-6 h-6 rounded-full bg-[#dbeafe] text-[#1d4ed8] flex items-center justify-center font-bold text-xs">
              ✓
            </div>
            <div>
              <span className="text-[9px] font-bold uppercase text-gray-400 tracking-wider block leading-none">
                PASO 1
              </span>
              <span className="text-xs font-bold text-[#170040]">1. Vuelos</span>
            </div>
          </div>

          {/* Línea conectora 1-2 (Roja) */}
          <div className="h-[2px] flex-1 bg-[#E11D48] mx-3 sm:mx-6" />

          {/* Paso 2 (Activo) */}
          <div className="flex items-center gap-2.5">
            <div className="w-6 h-6 rounded-full bg-[#170040] text-white flex items-center justify-center font-bold text-xs">
              2
            </div>
            <div>
              <span className="text-[9px] font-black uppercase text-[#E11D48] tracking-wider block leading-none">
                ACTIVO AHORA
              </span>
              <span className="text-xs font-bold text-[#170040]">2. Asientos</span>
            </div>
          </div>

          {/* Línea conectora 2-3 (Gris) */}
          <div className="h-[2px] flex-1 bg-gray-200 mx-3 sm:mx-6" />

          {/* Paso 3 */}
          <div className="flex items-center gap-2.5 opacity-60">
            <div className="w-6 h-6 rounded-full bg-gray-100 text-gray-500 flex items-center justify-center font-bold text-xs">
              3
            </div>
            <div>
              <span className="text-[9px] font-bold uppercase text-gray-400 tracking-wider block leading-none">
                SIGUIENTE
              </span>
              <span className="text-xs font-semibold text-gray-600">3. Pago</span>
            </div>
          </div>

          {/* Línea conectora 3-4 (Gris) */}
          <div className="h-[2px] flex-1 bg-gray-200 mx-3 sm:mx-6 hidden sm:block" />

          {/* Paso 4 */}
          <div className="hidden sm:flex items-center gap-2.5 opacity-40">
            <div className="w-6 h-6 rounded-full bg-gray-100 text-gray-400 flex items-center justify-center font-bold text-xs">
              4
            </div>
            <div>
              <span className="text-[9px] font-bold uppercase text-gray-400 tracking-wider block leading-none">
                FINAL
              </span>
              <span className="text-xs font-semibold text-gray-500">4. Confirmación</span>
            </div>
          </div>
        </div>
      </div>

      {/* 3. ALERTA DE RESERVA & TIMER BANNER */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-4">
        <div className="bg-[#fff1f2] border border-[#ffe4e6] rounded-xl px-4 py-2.5 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-sm">
          <div className="flex items-center gap-2 text-xs">
            <span className="material-symbols-outlined text-[#E11D48] text-base">alarm</span>
            <span className="font-extrabold text-[#E11D48] tracking-wide">ALERTA DE RESERVA :</span>
            <span className="text-[#881337] font-medium">
              Los asientos seleccionados se liberarán automáticamente al expirar el temporizador.
            </span>
          </div>

          {/* Badge del Timer */}
          <div className="bg-white rounded-full px-3.5 py-1 border border-[#fecdd3] shadow-sm flex items-center gap-2 shrink-0">
            <span className="text-[11px] font-extrabold text-[#E11D48] tracking-wider">TIEMPO RESTANTE:</span>
            <span className="font-mono font-black text-xs text-[#E11D48] tracking-tight">{formattedTimer}</span>
          </div>
        </div>
      </div>

      {/* 4. MAIN CONTENT CONTAINER */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Header de la sección & Tasa de ocupación */}
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
              OPERACIÓN REGULAR / <span className="text-[#E11D48] font-bold">BOEING 737-800 NG</span> / CONFIGURACIÓN
              MIXTA (C12 / Y150)
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-[#170040] tracking-tight mt-0.5">
              Mapa de Cabina y Asignación
            </h1>
            <p className="text-xs text-gray-500 mt-0.5">
              Selecciona las butacas preferidas para tu vuelo a Buenos Aires (Aeroparque).
            </p>
          </div>

          {/* Widget Tasa de Ocupación */}
          <div className="bg-white border border-gray-100 rounded-2xl px-4 py-2.5 shadow-sm flex items-center gap-3 shrink-0">
            <div className="w-9 h-9 rounded-xl bg-[#e0f2fe] text-[#0369a1] flex items-center justify-center">
              <span className="material-symbols-outlined text-lg">flight_takeoff</span>
            </div>
            <div className="leading-tight">
              <span className="text-[9px] font-bold uppercase text-gray-400 tracking-wider block">
                TASA DE OCUPACIÓN
              </span>
              <span className="text-xs font-extrabold text-[#170040]">
                78.4% · 35 Libres
              </span>
            </div>
          </div>
        </div>

        {/* Mensaje de error / conflicto de concurrencia */}
        {errorMessage && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-xs px-4 py-3 rounded-xl flex items-center gap-2 shadow-sm">
            <span className="material-symbols-outlined text-base">error</span>
            <span className="font-semibold">{errorMessage}</span>
          </div>
        )}

        {/* Barra de Referencias / Leyenda */}
        <div className="bg-white border border-gray-100 rounded-2xl p-2.5 px-4 shadow-sm flex flex-wrap items-center gap-6 text-xs font-semibold">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-[#e0f2fe] border border-[#bae6fd]" />
            <span className="text-gray-700">Disponible</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-[#E11D48] text-white flex items-center justify-center text-[10px] font-bold">
              ✓
            </div>
            <span className="text-gray-700">Seleccionado</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-[#e0f2fe] border border-[#bae6fd] text-[#0284c7] flex items-center justify-center text-[10px] font-bold">
              ✕
            </div>
            <span className="text-gray-700">Ocupado</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-[#170040] text-amber-300 flex items-center justify-center text-[10px]">
              💎
            </div>
            <span className="text-gray-700">Premium Club</span>
          </div>
        </div>

        {/* 5. GRID PRINCIPAL (Fuselaje a la izquierda, Panel lateral a la derecha) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* ======================================================== */}
          {/* FUSELAJE DEL AVIÓN (Columna Izquierda: 7 cols)           */}
          {/* ======================================================== */}
          <div className="lg:col-span-7">
            <div className="relative bg-white border border-gray-200/80 rounded-t-[140px] rounded-b-3xl p-6 pt-10 shadow-sm max-w-[460px] mx-auto">
              {/* Cockpit / Proa */}
              <div className="text-center mb-6">
                <div className="inline-flex flex-col items-center justify-center bg-[#f0f4ff] border border-blue-100 rounded-full px-4 py-1.5 shadow-inner">
                  <div className="w-3 h-3 text-[#E11D48] mb-0.5">
                    <svg viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 2L1 21h22L12 2zm0 4.5l6.5 11.5h-13L12 6.5z" />
                    </svg>
                  </div>
                  <span className="text-[9px] font-black uppercase tracking-widest text-[#170040]">
                    COCKPIT · PROA
                  </span>
                </div>
              </div>

              {/* Galley Delantero */}
              <div className="bg-[#f1f5f9] text-gray-700 py-2 px-4 rounded-xl flex items-center justify-between text-xs font-bold mb-6">
                <div className="flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-sm">coffee</span>
                  <span>GALLEY DELANTERO</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-sm">wc</span>
                  <span>BAÑO A</span>
                </div>
              </div>

              {/* Header Sector Premium Primera Clase */}
              <div className="flex items-center justify-between mb-3 px-1">
                <div className="flex items-center gap-1.5 text-xs font-bold text-[#170040]">
                  <span className="w-2 h-2 rounded-full bg-[#170040]" />
                  <span>SECTOR PREMIUM PRIMERA CLASE</span>
                </div>
                <div className="bg-[#240c54] text-white text-[10px] font-bold px-2 py-0.5 rounded-md">
                  Pitch 38&quot; · Recline 7&quot;
                </div>
              </div>

              {/* FILAS DE PRIMERA CLASE (1, 2, 3) */}
              <div className="space-y-2 mb-6">
                {[1, 2, 3].map((rowNum) => {
                  const rowSeats = seatsByRow.get(rowNum) ?? [];
                  const leftSeats = rowSeats.slice(0, 2);
                  const rightSeats = rowSeats.slice(2, 4);

                  return (
                    <div key={rowNum} className="flex items-center justify-between gap-2 px-2">
                      {/* Lado Izquierdo (A, C) */}
                      <div className="flex items-center gap-2">
                        {leftSeats.map((seat) => (
                          <SeatButtonGraphic
                            key={seat.id}
                            seat={seat}
                            isSelected={selectedSeatIds.includes(seat.id)}
                            isExtraPrice={rowNum === 3}
                            extraLabel="+$14k"
                            onClick={() => handleSeatClick(seat)}
                          />
                        ))}
                      </div>

                      {/* Pasillo con número de fila */}
                      <div className="text-center w-8">
                        <span className="text-xs font-bold text-gray-400 font-mono">
                          {String(rowNum).padStart(2, '0')}
                        </span>
                      </div>

                      {/* Lado Derecho (D, F) */}
                      <div className="flex items-center gap-2">
                        {rightSeats.map((seat) => (
                          <SeatButtonGraphic
                            key={seat.id}
                            seat={seat}
                            isSelected={selectedSeatIds.includes(seat.id)}
                            isExtraPrice={rowNum === 3}
                            extraLabel="+$14k"
                            onClick={() => handleSeatClick(seat)}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Mampara Divisoria */}
              <div className="relative text-center my-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-200" />
                </div>
                <span className="relative bg-white px-3 text-[10px] font-bold uppercase tracking-wider text-gray-400">
                  MAMPARA DIVISORIA · SECTOR TURISTA / ECONOMY
                </span>
              </div>

              {/* Encabezado de Columnas Economy (A B C | PASILLO | D E F) */}
              <div className="flex items-center justify-between text-[11px] font-bold text-gray-400 px-4 mb-2">
                <div className="flex items-center justify-between w-[118px]">
                  <span>A</span>
                  <span>B</span>
                  <span>C</span>
                </div>
                <span className="text-[10px] font-bold tracking-wider">PASILLO</span>
                <div className="flex items-center justify-between w-[118px]">
                  <span>D</span>
                  <span>E</span>
                  <span>F</span>
                </div>
              </div>

              {/* FILAS DE ECONOMY (10, 11, 12, 13) */}
              <div className="space-y-2 mb-4">
                {[10, 11, 12, 13].map((rowNum) => {
                  const rowSeats = seatsByRow.get(rowNum) ?? [];
                  const leftSeats = rowSeats.slice(0, 3);
                  const rightSeats = rowSeats.slice(3, 6);
                  const isSelectedRow = selectedSeatIds.some((id) => {
                    const s = seats.find((st) => st.id === id);
                    return s?.rowNumber === rowNum;
                  });

                  return (
                    <div key={rowNum} className="flex items-center justify-between gap-1 px-1">
                      {/* Lado Izquierdo (A, B, C) */}
                      <div className="flex items-center gap-1.5">
                        {leftSeats.map((seat) => (
                          <SeatButtonGraphic
                            key={seat.id}
                            seat={seat}
                            isSelected={selectedSeatIds.includes(seat.id)}
                            onClick={() => handleSeatClick(seat)}
                          />
                        ))}
                      </div>

                      {/* Pasillo central */}
                      <div className="text-center w-10 flex flex-col items-center justify-center">
                        <span
                          className={`text-xs font-bold font-mono ${
                            isSelectedRow ? 'text-[#E11D48]' : 'text-gray-400'
                          }`}
                        >
                          {rowNum}
                        </span>
                        {isSelectedRow && <span className="w-1.5 h-1.5 rounded-full bg-[#E11D48] mt-0.5" />}
                      </div>

                      {/* Lado Derecho (D, E, F) */}
                      <div className="flex items-center gap-1.5">
                        {rightSeats.map((seat) => (
                          <SeatButtonGraphic
                            key={seat.id}
                            seat={seat}
                            isSelected={selectedSeatIds.includes(seat.id)}
                            onClick={() => handleSeatClick(seat)}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* SALIDA DE EMERGENCIA STRIP */}
              <div className="bg-[#eff6ff] text-[#E11D48] py-1.5 px-4 rounded-xl flex items-center justify-between text-[11px] font-extrabold my-3 border border-blue-100">
                <div className="flex items-center gap-1">
                  <span>✱</span>
                  <span>SALIDA DE EMERGENCIA IZQ</span>
                </div>
                <div className="flex items-center gap-1">
                  <span>SALIDA DER</span>
                  <span>✱</span>
                </div>
              </div>

              {/* FILAS DE SALIDA Y EXTRA LEGROOM (14, 15) */}
              <div className="space-y-2 mb-4">
                {[14, 15].map((rowNum) => {
                  const rowSeats = seatsByRow.get(rowNum) ?? [];
                  const leftSeats = rowSeats.slice(0, 3);
                  const rightSeats = rowSeats.slice(3, 6);

                  return (
                    <div key={rowNum} className="flex items-center justify-between gap-1 px-1">
                      <div className="flex items-center gap-1.5">
                        {leftSeats.map((seat) => (
                          <SeatButtonGraphic
                            key={seat.id}
                            seat={seat}
                            isSelected={selectedSeatIds.includes(seat.id)}
                            isExtraPrice={rowNum === 14 && (seat.columnLetter === 'A' || seat.columnLetter === 'B')}
                            extraLabel="+Leg"
                            onClick={() => handleSeatClick(seat)}
                          />
                        ))}
                      </div>

                      <div className="text-center w-10">
                        <span className="text-xs font-bold text-gray-500 font-mono">{rowNum}</span>
                        {rowNum === 14 && (
                          <span className="text-[8px] font-bold text-gray-400 block -mt-0.5">EXTRA</span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5">
                        {rightSeats.map((seat) => (
                          <SeatButtonGraphic
                            key={seat.id}
                            seat={seat}
                            isSelected={selectedSeatIds.includes(seat.id)}
                            isExtraPrice={rowNum === 14 && (seat.columnLetter === 'E' || seat.columnLetter === 'F')}
                            extraLabel="+Leg"
                            onClick={() => handleSeatClick(seat)}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* FILAS 16 A 25 ECONOMY INDICATOR */}
              <div className="text-center my-4">
                <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
                  · · · FILAS 16 A 25 ECONOMY · · ·
                </span>
              </div>

              {/* Baños Traseros y Galley Popa */}
              <div className="bg-[#f1f5f9] text-gray-700 py-2.5 px-4 rounded-xl flex items-center justify-between text-xs font-bold mb-3">
                <div className="flex items-center gap-1">
                  <span className="material-symbols-outlined text-sm">wc</span>
                  <span>BAÑO TRASERO B</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="material-symbols-outlined text-sm">coffee</span>
                  <span>GALLEY POPA</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="material-symbols-outlined text-sm">wc</span>
                  <span>BAÑO TRASERO C</span>
                </div>
              </div>

              {/* Empenaje / Cono Trasero */}
              <div className="text-center">
                <div className="inline-block bg-gray-100 text-gray-500 text-[10px] font-bold px-4 py-1 rounded-full uppercase tracking-wider">
                  EMPENAJE · CONO TRASERO
                </div>
              </div>
            </div>
          </div>

          {/* ======================================================== */}
          {/* PANEL DERECHO DE RESUMEN Y ACCIONES (5 cols)             */}
          {/* ======================================================== */}
          <div className="lg:col-span-5 space-y-4">
            {/* CARD 1: VUELO AG-1420 */}
            <div className="bg-[#19063d] text-white rounded-2xl p-5 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <span className="font-extrabold text-sm tracking-wide text-white uppercase">
                  VUELO {flight.code}
                </span>
                <span className="bg-[#2b1057] border border-purple-600/40 text-white text-[11px] font-bold px-3 py-0.5 rounded-full uppercase tracking-wider">
                  CONFIRMADO
                </span>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <div className="text-2xl font-black text-white">06:45</div>
                  <div className="text-xs text-purple-200/70 font-medium">
                    BHI · Bahía Blanca
                  </div>
                </div>

                <div className="text-center px-2">
                  <div className="text-[11px] font-bold text-[#E11D48]">1h 10m</div>
                  <div className="w-16 h-[2px] bg-purple-500/40 relative my-1">
                    <span className="absolute right-0 top-1/2 -translate-y-1/2 text-purple-300 text-xs">→</span>
                  </div>
                  <div className="text-[10px] font-medium text-purple-200/60">
                    {flight.isDirect ? 'Directo' : 'Con Escalas'}
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-2xl font-black text-white">07:55</div>
                  <div className="text-xs text-purple-200/70 font-medium">
                    {flight.destinationAirport.iataCode} · {flight.destinationAirport.name.includes('Aeroparque') ? 'Aeroparque' : flight.destinationAirport.city}
                  </div>
                </div>
              </div>

              <div className="border-t border-white/10 pt-3 mt-4 flex items-center justify-between text-[11px] font-semibold text-purple-200/60">
                <span>EQUIPO: {flight.aircraft.model.includes('737') ? 'B737-800' : flight.aircraft.model}</span>
                <span>TARIFA: FLEX ECONOMY</span>
              </div>
            </div>

            {/* CARD 2: ASIGNACIÓN POR PASAJERO */}
            <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm space-y-4">
              <h3 className="text-xs font-black uppercase text-[#170040] tracking-wider">
                ASIGNACIÓN POR PASAJERO
              </h3>

              {/* Lista de pasajeros y butacas */}
              <div className="space-y-3">
                {Array.from({ length: passengersCount }).map((_, i) => {
                  const assignedSeatId = selectedSeatIds[i];
                  const assignedSeat = seats.find((s) => s.id === assignedSeatId);
                  const mockInfo = DEFAULT_PASSENGERS_MOCK[i] ?? {
                    firstName: `Pasajero`,
                    lastName: `${i + 1}`,
                    typeLabel: `Adulto · Pasajero ${i + 1}`,
                    initials: `P${i + 1}`,
                  };

                  const seatLabel = assignedSeat
                    ? `${assignedSeat.rowNumber}${assignedSeat.columnLetter}`
                    : 'Sin asignar';

                  const seatPosition = assignedSeat
                    ? assignedSeat.columnLetter === 'A' || assignedSeat.columnLetter === 'F'
                      ? 'Ventana'
                      : assignedSeat.columnLetter === 'B' || assignedSeat.columnLetter === 'E'
                      ? 'Medio'
                      : 'Pasillo'
                    : 'Sin selección';

                  return (
                    <div key={i} className="flex items-center justify-between py-1">
                      <div className="flex items-center gap-3">
                        {/* Avatar */}
                        <div className="w-9 h-9 rounded-full bg-[#19063d] text-white font-black text-xs flex items-center justify-center shrink-0">
                          {mockInfo.initials}
                        </div>
                        <div>
                          <div className="text-xs font-bold text-[#170040]">
                            {mockInfo.firstName} {mockInfo.lastName}
                          </div>
                          <div className="text-[11px] text-gray-400 font-medium">{mockInfo.typeLabel}</div>
                          <div className="text-[11px] font-bold text-[#E11D48]">
                            {seatPosition} · Economy Flex
                          </div>
                        </div>
                      </div>

                      {/* Pill del Asiento */}
                      <div className="text-right">
                        <div className="bg-[#E11D48] text-white font-extrabold text-xs px-3 py-1 rounded-lg text-center shadow-sm">
                          {seatLabel}
                        </div>
                        <span className="text-[10px] text-gray-400 font-medium block mt-0.5">
                          Incluido $0
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Detalle adicional de tarifas */}
              <div className="border-t border-gray-100 pt-3 space-y-1 text-xs">
                {selectedSeatIds.map((id) => {
                  const s = seats.find((seat) => seat.id === id);
                  return (
                    <div key={id} className="flex items-center justify-between text-gray-600">
                      <span>Adicional Selección {s ? `${s.rowNumber}${s.columnLetter}` : id}:</span>
                      <span className="font-semibold text-gray-800">$0 ARS</span>
                    </div>
                  );
                })}

                <div className="flex items-center justify-between pt-2 text-xs font-bold">
                  <span className="text-gray-700">Total Selección de Asientos:</span>
                  <span className="text-[#E11D48] font-black text-sm">$0 ARS (Incluido)</span>
                </div>
              </div>
            </div>

            {/* CARD 3: DESTINO */}
            <div className="bg-white rounded-2xl p-3 border border-gray-100 shadow-sm flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={DESTINATION_IMG}
                alt="Destino Buenos Aires"
                className="w-14 h-14 rounded-xl object-cover shrink-0"
              />
              <div className="leading-tight">
                <span className="text-[10px] font-black uppercase tracking-wider text-[#E11D48] block">
                  DESTINO
                </span>
                <span className="text-sm font-extrabold text-[#170040] block">
                  Buenos Aires (AEP)
                </span>
                <span className="text-xs text-gray-500 font-medium mt-0.5 block">
                  Clima estimado a la llegada: 22°C Despejado
                </span>
              </div>
            </div>

            {/* CARD 4: TRANSICIÓN DE RESERVA SEGURA */}
            <div className="bg-[#f0f5ff] border border-blue-100 rounded-2xl p-4 flex items-start gap-3">
              <span className="material-symbols-outlined text-blue-700 text-xl shrink-0 mt-0.5">
                verified_user
              </span>
              <div className="leading-tight">
                <span className="text-xs font-black text-blue-950 block">Transición de Reserva Segura</span>
                <span className="text-[11px] text-blue-900/80 font-medium block mt-1 leading-relaxed">
                  Siguiente paso: Paso 3 – Datos de Pasajeros, Equipaje Adicional y Pago Seguro con validación ANAC.
                </span>
              </div>
            </div>

            {/* BOTÓN PRINCIPAL: CONTINUAR AL PAGO */}
            <button
              type="button"
              onClick={handleProceedToPayment}
              disabled={submitting || selectedSeatIds.length === 0}
              className="w-full bg-[#E11D48] hover:bg-[#ba0035] text-white font-extrabold text-sm py-3.5 px-6 rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-rose-900/20 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? (
                <>
                  <span className="material-symbols-outlined animate-spin text-sm">progress_activity</span>
                  Bloqueando plazas...
                </>
              ) : (
                <>
                  <span>Continuar al Pago (Paso 3)</span>
                  <span className="material-symbols-outlined text-base">arrow_forward</span>
                </>
              )}
            </button>

            {/* BOTÓN SECUNDARIO: VOLVER */}
            <Link
              href="/vuelos"
              className="w-full bg-white hover:bg-gray-50 text-gray-700 font-bold text-xs py-2.5 px-4 rounded-xl border border-gray-200 block text-center transition-colors shadow-sm"
            >
              ← Volver a Selección de Vuelos
            </Link>
          </div>
        </div>
      </main>

      {/* 6. FOOTER INFERIOR */}
      <footer className="bg-[#19063d] text-white py-6 px-6 sm:px-12 border-t border-white/5 mt-16">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs">
          <div className="flex flex-col sm:flex-row items-center gap-4 text-center sm:text-left">
            <div className="flex items-baseline gap-1">
              <span className="font-extrabold text-white">AeroGestión</span>
              <span className="font-black text-[#E11D48]">UNS</span>
            </div>
            <span className="text-white/20 hidden sm:inline">|</span>
            <span className="text-white/50 text-[11px]">
              Terminal BHI Comandante Espora · Bahía Blanca, Argentina
            </span>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5 bg-[#250d4d] border border-white/10 px-3 py-1 rounded-full text-xs font-semibold text-white/90">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span>Soporte 24/7 Operaciones</span>
            </div>
            <span className="text-white/40 text-[11px]">© 2025 UNS. Todos los derechos reservados.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

// Subcomponente gráfico de una butaca en el mapa
function SeatButtonGraphic({
  seat,
  isSelected,
  isExtraPrice = false,
  extraLabel = '',
  onClick,
}: {
  seat: FlightSeatView;
  isSelected: boolean;
  isExtraPrice?: boolean;
  extraLabel?: string;
  onClick: () => void;
}) {
  const isOccupied =
    seat.status === 'OCCUPIED' ||
    MOCKUP_OCCUPIED_SEATS.has(`${seat.rowNumber}${seat.columnLetter}`);
  const isLockedByOther = seat.status === 'LOCKED';
  const isFirstClass = seat.rowNumber <= 2;

  // 1. Si está seleccionada por el usuario (ROJO)
  if (isSelected) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-[#E11D48] text-white font-extrabold text-[11px] flex items-center justify-center shadow-md scale-105 transition-transform cursor-pointer border border-[#c90037]"
        title={`${seat.rowNumber}${seat.columnLetter} (Seleccionado)`}
      >
        <span>{seat.rowNumber}{seat.columnLetter}</span>
      </button>
    );
  }

  // 2. Ocupado (AZUL/GRIS PASTEL CON TEXTO MUTED)
  if (isOccupied) {
    return (
      <button
        type="button"
        disabled
        className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-[#e0f2fe]/75 text-[#64748b] border border-[#bae6fd]/60 font-bold text-[11px] flex items-center justify-center cursor-not-allowed select-none opacity-90"
        title={`${seat.rowNumber}${seat.columnLetter} (Ocupado)`}
      >
        <span>{seat.rowNumber}{seat.columnLetter}</span>
      </button>
    );
  }

  // 3. Bloqueado temporalmente por otro usuario (ÁMBAR CON CANDADO)
  if (isLockedByOther) {
    return (
      <button
        type="button"
        disabled
        className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-amber-500/20 text-amber-700 border border-amber-400 font-bold text-[10px] flex items-center justify-center cursor-not-allowed select-none"
        title={`${seat.rowNumber}${seat.columnLetter} (Bloqueado por otro usuario)`}
      >
        <span className="material-symbols-outlined text-[12px] mr-0.5">lock</span>
        <span>{seat.rowNumber}{seat.columnLetter}</span>
      </button>
    );
  }

  // 4. Asiento con precio extra (+ $14k o +Leg)
  if (isExtraPrice) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-white border border-gray-300 hover:border-[#E11D48] hover:bg-rose-50/30 text-gray-800 font-bold text-[10px] flex flex-col items-center justify-center transition-all cursor-pointer shadow-sm leading-tight"
        title={`${seat.rowNumber}${seat.columnLetter}`}
      >
        <span className="leading-none">{seat.rowNumber}{seat.columnLetter}</span>
        <span className={`text-[8px] font-black leading-none mt-0.5 ${extraLabel === '+Leg' ? 'text-[#E11D48]' : 'text-gray-700'}`}>
          {extraLabel}
        </span>
      </button>
    );
  }

  // 5. Asientos First Class (Filas 1 y 2: azul claro con icono persona)
  if (isFirstClass) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-[#e0f2fe] border border-[#bae6fd] hover:bg-[#bae6fd] text-[#0369a1] font-bold text-[10px] flex flex-col items-center justify-center transition-all cursor-pointer shadow-sm leading-tight"
        title={`${seat.rowNumber}${seat.columnLetter}`}
      >
        <span className="leading-none">{seat.rowNumber}{seat.columnLetter}</span>
        <span className="material-symbols-outlined text-[10px] leading-none text-[#0284c7] mt-0.5">person</span>
      </button>
    );
  }

  // 6. Asiento disponible normal en Economy (blanco con borde gris y texto oscuro)
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-white border border-gray-300 hover:border-[#E11D48] hover:bg-rose-50/30 text-gray-800 font-bold text-[11px] flex items-center justify-center transition-all cursor-pointer shadow-sm"
      title={`${seat.rowNumber}${seat.columnLetter}`}
    >
      <span>{seat.rowNumber}{seat.columnLetter}</span>
    </button>
  );
}
