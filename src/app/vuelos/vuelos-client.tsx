'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useClerk } from '@clerk/nextjs';
import { formatDayMonth, formatDuration, formatFullDate, formatTime, formatWeekday } from '@/lib/format';
import { localWeekDays } from '@/lib/dates';
import type {
  FlightCardData,
  FlightPagination,
  VuelosBootstrap,
  WeeklyFareDay,
} from '@/lib/view-models';
import type { SerializedPrice } from '@/lib/flights';

const TZ = 'America/Argentina/Buenos_Aires';
const FLIGHT_PAGE_SIZE = 20;

const LOGO =
  'https://lh3.googleusercontent.com/aida/AEtjO1WzlGJoL35vKD15_zsEm0QpUS0h7KCefzqRe5cyp23ElT3GGjCACZeQ4t_3qJY9hWqBFnWlvEca6TE1SW679EK3rOQ2jP8-FtFtHY8VyEq7gBqBU6Sy1tPH84zC3Tlraa3L1Uyy05Apuxx3IHdwJ5sybaGbgelqRe7imj4PrP4R-xUngvTQthhwAwcaOz6gEYFkkl5KEk_0NjoF0tDBcgYhNb9NXngvhp8JBvDigmxySHyWSWcFWH1Bj50';
const AVATAR =
  'https://lh3.googleusercontent.com/aida/AEtjO1WEhfaUl0efpt8MGhPU4BBSstKaHhbeJkOote0mUJ6_jYF6PAiF6FJ3oV7QSAdXoJj44L0BuwK0AMb8x9jtVQ3_fy7ZsUgPcH9cyj-MAcA7WCfUbepbSac9uc1dl-esKJHlvyljleDzT7OiNIG0e0zFh0Xe8ICzkK0eg0ZK6ZNHsIYEAclfRhCoKbMbUSqDQdarW6j9TqCWU1zKs56C4wu8KN0_Goo_-hECEtlTYqVYoNRpNtJjTTxrdHc';
const FLEET_IMG =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuCLDPhxkwdDvpLHuGzES1myvcdH258uoB2RRlHnZFL3B7dQqE0xT7sbyFIng7ClMZ-yqFZIU0yIy7gAhjYnUbKF8wrWFEwWGczPInNzM_Y6fzxH2vTHA1q7e7eBDb-DaZA7IVnuNQ_XMnOZOOz5bznlTseZved6oT30VJkdCMly2qQwMPEPaPsM4N0OvFbwmzuMtXwW20Qn--T1QbkDKjsSqqRqeVXJr-7FcjUmEs0caK4iJgQeCX_F';
const CABIN_IMG =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuC4ybXDxZWCT78pC3wAMS73Ak287xKNdmQbw8MVEfdsDQ7CBUupAKb0Y_xReJTdTLOuN86EZr8bM4l0F70g7hlxPz2Ys7HrIonCOyowsohbuqtISnkFDVJXjuOK9tvH4Dz_Nwn8IGAVx2kJzXofHANEbODisVrHVv59722gYufGZY0cZEqhvrGnq6WBgAygX-eXIFbxqXQkefS396NJQdsj4uyA75UDj-vZ6cUfUeb-4EVK6d48pVw5';

function Logo() {
  return (
    <div className="w-9 h-9 rounded-xl bg-primary ring-1 ring-white/10 flex items-center justify-center shrink-0">
      <svg className="w-6 h-6 text-[#E11D48]" fill="none" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
        <path d="M9 20.5L25.5 12L21 21.5L29 27L24 28L18 24.5L14 28.5L13.5 24L9 20.5Z" fill="currentColor" />
        <circle cx="28.5" cy="13.5" fill="#f43f5e" r="2.8" />
      </svg>
    </div>
  );
}

/** Mismo formato de importes que el HTML original ("$64.200" + etiqueta ARS). */
const MONEY = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });
const money = (n: number) => `$${MONEY.format(n)}`;

const DEMAND_LABEL: Record<string, string> = {
  LOW: 'Baja Demanda',
  NORMAL: 'Normal',
  HIGH: 'Alta Demanda',
};

const TIME_SLOTS = [
  { id: 'ALL', label: 'Cualquier horario', from: '', to: '' },
  { id: 'MORNING', label: 'Mañana (hasta 12:00)', from: '00:00', to: '11:59' },
  { id: 'AFTERNOON', label: 'Tarde (12:00 a 18:59)', from: '12:00', to: '18:59' },
  { id: 'NIGHT', label: 'Noche (desde 19:00)', from: '19:00', to: '23:59' },
] as const;
type SlotId = (typeof TIME_SLOTS)[number]['id'];
type SearchSnapshot = {
  origin: string; destination: string; date: string; passengers: number; slot: SlotId;
};

const STEPS: { n: number; label: string; icon?: string; state: 'active' | 'upcoming' | 'ghost' }[] = [
  { n: 1, label: '1. Vuelos', icon: 'flight_takeoff', state: 'active' },
  { n: 2, label: '2. Asientos', state: 'upcoming' },
  { n: 3, label: '3. Pago', state: 'upcoming' },
  { n: 4, label: '4. Confirmación', state: 'ghost' },
];

/**
 * Secciones del menu que todavia no tienen pantalla propia. Antes eran `<a href="#">`,
 * que al hacer clic solo llevaban al tope de la pagina sin explicar nada; ahora
 * avisan que estan en construccion.
 */
const PENDING_SECTIONS: { path: string; label: string; short: string }[] = [
  { path: 'mis-reservas', label: 'Mis Reservas', short: 'Reservas' },
  { path: 'check-in-online', label: 'Check-in Online', short: 'Check-in' },
  { path: 'alta-de-vuelos-admin', label: 'Alta de Vuelos [Admin]', short: 'Admin' },
];

type Selection = { flightId: string; fareId: string };

type ApiEnvelope<T> = { ok: true; data: T } | { ok: false; error: { message: string } };

async function readJson<T>(res: Response): Promise<T> {
  const body = (await res.json().catch(() => null)) as ApiEnvelope<T> | null;
  if (!res.ok || !body) throw new Error('No se pudo obtener la informacion del servidor');
  if (body.ok === false) throw new Error(body.error.message);
  return body.data;
}

const toYmd = (d: Date) => d.toISOString().slice(0, 10);

const cheapestIndex = (prices: SerializedPrice[]) =>
  prices.reduce((best, p, i) => (p.price < prices[best]!.price ? i : best), 0);

export default function VuelosClient({ bootstrap }: { bootstrap: VuelosBootstrap }) {
  const router = useRouter();
  const { signOut } = useClerk();
  const [tripType, setTripType] = useState<'ROUND_TRIP' | 'ONE_WAY'>('ROUND_TRIP');
  const [origin, setOrigin] = useState(bootstrap.initialQuery.origin);
  const [destination, setDestination] = useState(bootstrap.initialQuery.destination);
  const [date, setDate] = useState(bootstrap.initialQuery.date);
  const [returnDate, setReturnDate] = useState(bootstrap.initialQuery.returnDate);
  const [passengers, setPassengers] = useState(bootstrap.initialQuery.passengers);
  const [slot, setSlot] = useState<SlotId>('ALL');
  const [lastQuery, setLastQuery] = useState<SearchSnapshot | null>(null);
  const searchSeq = useRef(0);
  const departureInputRef = useRef<HTMLInputElement | null>(null);
  const returnInputRef = useRef<HTMLInputElement | null>(null);

  const [flights, setFlights] = useState<FlightCardData[]>(bootstrap.initialFlights);
  const [pagination, setPagination] = useState<FlightPagination>(bootstrap.initialPagination);
  const [weeklyFares, setWeeklyFares] = useState<WeeklyFareDay[]>(bootstrap.initialWeeklyFares);
  const [selection, setSelection] = useState<Selection | null>(() => {
    const f = bootstrap.initialFlights[0];
    const p = f?.prices[0];
    return f && p ? { flightId: f.id, fareId: p.id } : null;
  });

  const minDepartureDate = new Date().toISOString().slice(0, 10);

  const updateDepartureDate = (nextDate: string) => {
    if (nextDate < minDepartureDate) return;

    setDate(nextDate);

    if (tripType === 'ROUND_TRIP' && nextDate > returnDate) {
      setReturnDate(nextDate);
    }

    runSearch(1, true, { date: nextDate });
  };
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [clock, setClock] = useState('--:--:--');
  // Solo ofrece destinos que tienen ruta desde el origen elegido
  const destinations = useMemo(() => {
    const valid = new Set(
      bootstrap.routes.filter((r) => r.origin === origin).map((r) => r.destination),
    );
    return bootstrap.airports.filter((a) => valid.has(a.iataCode));
  }, [bootstrap, origin]);

  // El aviso de "en construccion" se cierra solo.
  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(id);
  }, [notice]);

  // Hora oficial ART en vivo (reemplaza el texto estatico del HTML original).
  useEffect(() => {
    const tick = () =>
      setClock(
        new Intl.DateTimeFormat('es-AR', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
          timeZone: TZ,
        }).format(new Date()),
      );
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const week = useMemo(() => localWeekDays(date), [date]);
  const fareByDate = useMemo(
    () => new Map(weeklyFares.map((w) => [w.date, w])),
    [weeklyFares],
  );

  const originAirport = bootstrap.airports.find((a) => a.iataCode === origin);
  const destinationAirport = bootstrap.airports.find((a) => a.iataCode === destination);

  const selectedFlight = flights.find((f) => f.id === selection?.flightId) ?? null;
  const selectedPrice =
    selectedFlight?.prices.find((p) => p.id === selection?.fareId) ??
    selectedFlight?.prices[0] ??
    null;
  const total = selectedPrice ? selectedPrice.price * passengers : 0;

  async function runSearch(
  page = 1,
  refreshWeeklyFares = true,
  override: Partial<SearchSnapshot> = {},
) {
  // Página 1 = lo que muestra el formulario; otras páginas = la última búsqueda hecha
  const q: SearchSnapshot =
    page === 1 || !lastQuery
      ? { origin, destination, date, passengers, slot, ...override }
      : lastQuery;

  if (q.origin === q.destination) {
    setError('El origen y el destino no pueden ser iguales');
    return;
  }

  const seq = ++searchSeq.current;
  setLoading(true);
  setError(null);
  try {
    const slotDef = TIME_SLOTS.find((s) => s.id === q.slot)!;
    const flightQuery = new URLSearchParams({
  origin: q.origin,
  destination: q.destination,
  date: q.date,
  passengers: String(q.passengers),
  page: String(page),
  pageSize: String(FLIGHT_PAGE_SIZE),
  sort: 'departure',
  order: 'asc',
});
flightQuery.set('available', 'true');   // <- acá
if (slotDef.from) flightQuery.set('timeFrom', slotDef.from);
if (slotDef.to) flightQuery.set('timeTo', slotDef.to);

    const wk = localWeekDays(q.date);
    const fareQuery = new URLSearchParams({
      origin: q.origin,
      destination: q.destination,
      from: wk[0]!,
      to: wk[6]!,
    });

    const [flightRes, fareRes] = await Promise.all([
      fetch(`/api/flights?${flightQuery}`),
      refreshWeeklyFares ? fetch(`/api/weekly-fares?${fareQuery}`) : Promise.resolve(null),
    ]);

    const flightData = await readJson<{ data: ApiFlight[]; pagination: FlightPagination }>(flightRes);
    const fareData = fareRes ? await readJson<{ data: ApiWeeklyFare[] }>(fareRes) : null;
    if (seq !== searchSeq.current) return; // llegó una búsqueda más nueva

    const nextFlights: FlightCardData[] = flightData.data;
    setFlights(nextFlights);
    setPagination(flightData.pagination);
    setLastQuery(q);
    if (fareData) {
      setWeeklyFares(
        fareData.data.map((w) => ({
          id: w.id, date: w.date, price: w.price, demandLevel: w.demandLevel, currency: w.currency,
        })),
      );
    }
    const first = nextFlights[0];
    const firstFare = first?.prices[0];
    setSelection(first && firstFare ? { flightId: first.id, fareId: firstFare.id } : null);
  } catch (err) {
    if (seq === searchSeq.current) {
      setError(err instanceof Error ? err.message : 'Error inesperado al buscar vuelos');
    }
  } finally {
    if (seq === searchSeq.current) setLoading(false);
  }
}

  async function logout() {
     await signOut({ redirectUrl: '/login' });

    router.refresh();
  }

  const cheapestDay = useMemo(() => {
    let best: { date: string; price: number } | null = null;
    for (const w of weeklyFares) {
      if (!best || w.price < best.price) best = { date: w.date, price: w.price };
    }
    return best;
  }, [weeklyFares]);

  return (
    <>
      <header className="fixed top-0 left-0 w-full z-50 bg-primary-container shadow-[0_1px_8px_rgba(0,0,0,0.04)]">
        <div className="min-h-20 w-full px-4 sm:px-space-lg lg:px-margin py-3 lg:py-0 flex flex-wrap items-center justify-between gap-space-sm lg:gap-space-md">
          <div className="flex items-center gap-space-md min-w-0 shrink-0">
            <Logo />
            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-space-xs">
                <span className="font-headline-sm text-headline-sm text-surface-container-lowest leading-none whitespace-nowrap">
                  AeroGestión
                </span>
                <span className="font-headline-sm text-headline-sm text-secondary leading-none whitespace-nowrap">
                  UNS
                </span>
              </div>
              <span className="font-label-sm text-label-sm text-primary-fixed-dim uppercase tracking-wider leading-tight hidden sm:block">
                Sistema Operativo Aeronáutico
              </span>
            </div>
            <div className="hidden xl:flex items-center gap-space-xs bg-primary px-space-sm py-space-xs rounded-full ml-space-xs">
              <span className="w-2 h-2 rounded-full bg-secondary-container animate-pulse" />
              <span className="font-code-telemetry text-code-telemetry text-tertiary-fixed">
                BHI HUB · OPERATIVO
              </span>
            </div>
          </div>

          <nav
            aria-label="Navegacion principal"
            className="hidden lg:flex items-center gap-space-xs"
            data-active-classes="bg-secondary text-on-secondary font-label-lg rounded-lg shadow-[0_1px_8px_rgba(0,0,0,0.04)]"
          >
            <a
              aria-current="page"
              className="px-space-md py-space-sm transition-colors bg-secondary text-on-secondary font-label-lg rounded-lg shadow-[0_1px_8px_rgba(0,0,0,0.04)]"
              data-path="buscar-vuelos"
              href="/vuelos"
            >
              Buscar Vuelos
            </a>
            {PENDING_SECTIONS.map((s) => (
              <button
                key={s.path}
                className="px-space-md py-space-sm rounded-lg font-label-lg text-label-lg text-primary-fixed-dim hover:bg-primary hover:text-on-primary transition-colors"
                data-path={s.path}
                onClick={() => setNotice(s.label)}
                type="button"
              >
                {s.label}
              </button>
            ))}
          </nav>

          <div className="flex items-center gap-space-sm sm:gap-space-md shrink-0">
            <div className="hidden sm:flex flex-col items-end">
              <span className="font-code-telemetry text-code-telemetry text-primary-fixed leading-tight">
                {clock} UTC-3
              </span>
              <span className="font-label-sm text-label-sm text-outline-variant uppercase">
                Hora Oficial ART
              </span>
            </div>
            <div className="relative flex items-center justify-center">
              <button
                aria-label="Notificaciones operativas"
                className="w-10 h-10 rounded-full flex items-center justify-center text-primary-fixed-dim hover:bg-primary hover:text-on-primary transition-colors"
                onClick={() => setNotice('Centro de Control BHI')}
                type="button"
              >
                <span className="material-symbols-outlined">notifications</span>
              </button>
              <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-full bg-secondary ring-2 ring-primary-container" />
            </div>

            {bootstrap.user ? (
              <button
                className="flex items-center gap-space-sm bg-primary/70 p-space-xs pl-space-sm rounded-full hover:bg-primary transition-colors"
                onClick={logout}
                title="Cerrar sesion"
                type="button"
              >
                <div className="hidden md:flex flex-col text-right">
                  <span className="font-label-md text-label-md text-surface-container-lowest leading-snug">
                    {bootstrap.user.name}
                  </span>
                  <span className="font-label-sm text-label-sm text-secondary-fixed leading-none">
                    {bootstrap.user.role}
                  </span>
                </div>
                  <span className="w-8 h-8 rounded-full bg-secondary-container text-on-secondary flex items-center justify-center font-label-md text-label-md font-bold">
                    {bootstrap.user.name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()}
                  </span>             
               </button>
            ) : (
              <div className="flex items-center gap-space-sm bg-primary/70 p-space-xs pl-space-sm rounded-full">
                <div className="hidden md:flex flex-col text-right">
                  <span className="font-label-md text-label-md text-surface-container-lowest leading-snug">
                    Invitado
                  </span>
                  <span className="font-label-sm text-label-sm text-secondary-fixed leading-none">
                    Sesion no iniciada
                  </span>
                </div>
                <a
                  className="font-label-md text-label-md text-secondary-fixed hover:text-on-primary transition-colors whitespace-nowrap"
                  href="/login"
                >
                  Ingresar
                </a>
              </div>
            )}
          </div>

          {/* La nav de escritorio es `hidden lg:flex`: sin esta fila, en movil y
              tablet no habia ninguna via de navegacion. */}
          <nav
            aria-label="Navegacion principal"
            className="flex lg:hidden order-last w-full items-center gap-space-xs overflow-x-auto"
          >
            <a
              aria-current="page"
              className="shrink-0 px-3 py-1.5 rounded-lg bg-secondary text-on-secondary font-label-md text-label-md"
              href="/vuelos"
            >
              Buscar Vuelos
            </a>
            {PENDING_SECTIONS.map((s) => (
              <button
                key={s.path}
                className="shrink-0 px-3 py-1.5 rounded-lg font-label-md text-label-md text-primary-fixed-dim bg-primary/60"
                onClick={() => setNotice(s.label)}
                type="button"
              >
                {s.short}
              </button>
            ))}
          </nav>
        </div>
      </header>

      {notice && (
        <div
          className="fixed top-[7.25rem] lg:top-20 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-md"
          role="status"
        >
          <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-primary text-on-primary shadow-xl">
            <span className="material-symbols-outlined text-lg text-secondary-fixed shrink-0">
              construction
            </span>
            <p className="font-label-md text-label-md leading-snug flex-1">
              <span className="font-bold">{notice}</span> está en construcción: esta
              versión cubre búsqueda, autenticación y reservas.
            </p>
            <button
              aria-label="Cerrar aviso"
              className="text-on-primary/70 hover:text-on-primary shrink-0"
              onClick={() => setNotice(null)}
              type="button"
            >
              <span className="material-symbols-outlined text-lg">close</span>
            </button>
          </div>
        </div>
      )}

      <main className="w-full pt-32 lg:pt-20 bg-surface min-h-[calc(100vh-140px)]">
        <div className="flex flex-col w-full">
          {/* Passenger Step Indicator / Stepper Bar */}
          <section className="w-full bg-surface-container-lowest shadow-sm">
            <div className="max-w-7xl mx-auto px-margin-sm md:px-margin py-space-md">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-space-md">
                <div className="flex items-center gap-space-sm min-w-0">
                  <div className="flex items-center gap-space-xs px-space-sm py-space-xs rounded-full bg-surface-container text-primary font-code-telemetry text-code-telemetry">
                    <span className="w-2 h-2 rounded-full bg-secondary-container" />
                    <span>{origin}</span>
                    <span className="material-symbols-outlined text-sm">arrow_forward</span>
                    <span>{destination}</span>
                  </div>
                  <span className="text-outline text-label-md">/</span>
                  <span className="font-label-md text-label-md text-on-surface-variant truncate">
                    Ida: {formatDayMonth(date)}
                    {tripType === 'ROUND_TRIP' ? ` • Retorno: ${formatDayMonth(returnDate)}` : ' • Solo Ida'}
                  </span>
                </div>

                <nav aria-label="Progreso de Reserva" className="flex items-center gap-space-xs overflow-x-auto pb-1 md:pb-0">
                  {STEPS.map((step, i) => (
                    <div key={step.n} className="flex items-center gap-space-xs">
                      {i > 0 && <div className="w-4 h-0.5 bg-outline-variant shrink-0" />}
                      <div
                        className={
                          step.state === 'active'
                            ? 'flex items-center gap-space-xs bg-primary-container text-on-primary px-space-md py-space-xs rounded-full shrink-0 shadow-sm'
                            : step.state === 'ghost'
                              ? 'flex items-center gap-space-xs px-space-sm py-space-xs rounded-full text-outline shrink-0 opacity-40'
                              : 'flex items-center gap-space-xs px-space-sm py-space-xs rounded-full text-outline shrink-0 opacity-80'
                        }
                      >
                        <span
                          className={
                            step.state === 'active'
                              ? 'flex items-center justify-center w-5 h-5 rounded-full bg-secondary-container text-on-secondary font-label-sm text-label-sm font-bold'
                              : 'flex items-center justify-center w-5 h-5 rounded-full bg-surface-container font-label-sm text-label-sm text-on-surface-variant'
                          }
                        >
                          {step.n}
                        </span>
                        <span className="font-label-md text-label-md">{step.label}</span>
                        {step.icon && (
                          <span className="material-symbols-outlined text-base text-secondary-fixed">
                            {step.icon}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </nav>
              </div>
            </div>
          </section>

          {/* Main Canvas Container */}
          <div className="max-w-7xl mx-auto px-margin-sm md:px-margin py-space-lg w-full flex flex-col gap-space-lg">
            {/* Search Engine Widget Box */}
            <section className="w-full bg-surface-container-lowest rounded-xl shadow-md p-space-md md:p-space-lg flex flex-col gap-space-md">
              <div className="flex flex-wrap items-center justify-between gap-space-md">
                <div className="inline-flex p-1 rounded-lg bg-surface-container-low">
                  <button
                    className={
                      tripType === 'ROUND_TRIP'
                        ? 'px-space-md py-space-xs rounded-md bg-primary-container text-on-primary font-label-md text-label-md shadow-sm transition-all flex items-center gap-1.5'
                        : 'px-space-md py-space-xs rounded-md text-on-surface-variant hover:text-on-surface font-label-md text-label-md transition-colors flex items-center gap-1.5'
                    }
                    onClick={() => setTripType('ROUND_TRIP')}
                    type="button"
                  >
                    <span className="material-symbols-outlined text-sm text-secondary-fixed">
                      sync_alt
                    </span>
                    <span>Ida y Vuelta</span>
                  </button>
                  <button
                    className={
                      tripType === 'ONE_WAY'
                        ? 'px-space-md py-space-xs rounded-md bg-primary-container text-on-primary font-label-md text-label-md shadow-sm transition-all flex items-center gap-1.5'
                        : 'px-space-md py-space-xs rounded-md text-on-surface-variant hover:text-on-surface font-label-md text-label-md transition-colors flex items-center gap-1.5'
                    }
                    onClick={() => setTripType('ONE_WAY')}
                    type="button"
                  >
                    <span className="material-symbols-outlined text-sm">trending_flat</span>
                    <span>Solo Ida</span>
                  </button>
                </div>
                <div className="flex items-center gap-space-md">
                  <div className="hidden lg:flex items-center gap-space-xs font-code-telemetry text-code-telemetry text-on-tertiary-fixed-variant bg-tertiary-fixed px-space-sm py-space-xs rounded-md">
                    <span className="material-symbols-outlined text-sm">verified_user</span>
                    <span>Tarifas Oficiales UNS Región Sur</span>
                  </div>
                  <span className="font-code-telemetry text-code-telemetry text-outline-variant">
                    TARIFA PUBLICA DIRECTA
                  </span>
                </div>
              </div>

              {/* Segment Query Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-space-sm lg:gap-space-md items-end">
                <Field label="Origen" icon="flight_takeoff">
                  <span className="font-headline-sm text-headline-sm text-primary leading-tight font-bold">
                    {origin}
                  </span>
                  <span className="font-body-sm text-body-sm text-on-surface-variant truncate">
                    {originAirport?.name ?? 'Aeropuerto de origen'}
                  </span>
                  <select
                    aria-label="Origen"
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    onChange={(e) => {
                        const next = e.target.value;
                        setOrigin(next);
                        const valid = bootstrap.routes.filter((r) => r.origin === next).map((r) => r.destination);
                        if (!valid.includes(destination)) setDestination(valid[0] ?? destination);
                      }}
                  >
                    {bootstrap.airports.map((a) => (
                      <option key={a.iataCode} value={a.iataCode}>
                        {a.iataCode} — {a.name}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="Destino" icon="flight_land">
                  <span className="font-headline-sm text-headline-sm text-primary leading-tight font-bold">
                    {destination}
                  </span>
                  <span className="font-body-sm text-body-sm text-on-surface-variant truncate">
                    {destinationAirport?.name ?? 'Aeropuerto de destino'}
                  </span>
                  <select
                    aria-label="Destino"
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    onChange={(e) => setDestination(e.target.value)}
                    value={destination}
                  >
                    {destinations.map((a) =>  (
                      <option key={a.iataCode} value={a.iataCode}>
                        {a.iataCode} — {a.name}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="Salida" icon="calendar_today">
                  <button
                    className="flex w-full items-center justify-between gap-2 text-left"
                    onClick={() => {
                      departureInputRef.current?.showPicker?.();
                      departureInputRef.current?.click();
                    }}
                    type="button"
                  >
                    <span className="flex flex-col min-w-0">
                      <span className="font-label-md text-label-md text-on-surface font-semibold">
                        {formatFullDate(date)}
                      </span>
                      <span className="font-body-sm text-body-sm text-outline">
                        {slot === 'MORNING'
                          ? 'Hasta 12:00'
                          : slot === 'AFTERNOON'
                            ? '12:00 a 18:59'
                            : slot === 'NIGHT'
                              ? 'Desde 19:00'
                              : 'Hora de salida'}
                      </span>
                    </span>
                    <span className="material-symbols-outlined text-base text-primary">calendar_month</span>
                  </button>
                  <input
                    ref={departureInputRef}
                    aria-label="Fecha de salida"
                    className="sr-only"
                    min={minDepartureDate}
                    onChange={(e) => {
                      if (!e.target.value) return;
                      updateDepartureDate(e.target.value);
                    }}
                    type="date"
                    value={date}
                  />
                </Field>

                <Field
                  label="Regreso"
                  icon="event_repeat"
                  dimmed={tripType === 'ONE_WAY'}
                >
                  <button
                    className="flex w-full items-center justify-between gap-2 text-left disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={tripType === 'ONE_WAY'}
                    onClick={() => {
                      if (tripType === 'ONE_WAY') return;
                      returnInputRef.current?.showPicker?.();
                      returnInputRef.current?.click();
                    }}
                    type="button"
                  >
                    <span className="flex flex-col min-w-0">
                      <span className="font-label-md text-label-md text-on-surface font-semibold">
                        {formatFullDate(returnDate)}
                      </span>
                      <span className="font-body-sm text-body-sm text-outline">
                        {formatWeekday(returnDate)}
                      </span>
                    </span>
                    <span className="material-symbols-outlined text-base text-primary">calendar_month</span>
                  </button>
                  <input
                    ref={returnInputRef}
                    aria-label="Fecha de regreso"
                    className="sr-only"
                    disabled={tripType === 'ONE_WAY'}
                    min={date}
                    onChange={(e) => {
                      if (!e.target.value) return;
                      const next = e.target.value;
                      if (next < date) {
                        setReturnDate(date);
                        return;
                      }
                      setReturnDate(next);
                    }}
                    type="date"
                    value={returnDate}
                  />
                </Field>

                <Field label="Pasajeros" icon="group">
                  <span className="font-label-md text-label-md text-on-surface font-semibold truncate">
                    {passengers} {passengers === 1 ? 'Adulto' : 'Adultos'}
                  </span>
                  <span className="font-body-sm text-body-sm text-outline">Cabina Estándar</span>
                  <select
                    aria-label="Pasajeros"
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    onChange={(e) => setPassengers(Number(e.target.value))}
                    value={passengers}
                  >
                    {Array.from({ length: 9 }, (_, i) => i + 1).map((n) => (
                      <option key={n} value={n}>
                        {n} {n === 1 ? 'pasajero' : 'pasajeros'}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="Horario" icon="schedule">
                  <span className="font-label-md text-label-md text-on-surface font-semibold truncate">
                    {TIME_SLOTS.find((s) => s.id === slot)!.label}
                  </span>
                  <span className="font-body-sm text-body-sm text-outline">Hora de salida</span>
                  <select
                    aria-label="Horario de salida"
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    onChange={(e) => setSlot(e.target.value as SlotId)}
                    value={slot}
                  >
                    {TIME_SLOTS.map((s) => (
                      <option key={s.id} value={s.id}>{s.label}</option>
                    ))}
                  </select>
                </Field>
              </div>

              <div className="flex flex-col sm:flex-row items-center justify-between pt-space-xs gap-space-md">
                <div className="flex items-center gap-space-md text-outline font-label-md text-label-md">
                  <span className="flex items-center gap-1">
                    <span className="material-symbols-outlined text-base text-secondary-container">
                      tune
                    </span>
                    Vuelos Comerciales Regulares • Línea {origin}-{destination}
                  </span>
                </div>
                <button
                  className="w-full sm:w-auto px-space-lg py-3 rounded-lg bg-secondary-container text-on-secondary font-label-lg text-label-lg hover:bg-secondary transition-all shadow-md flex items-center justify-center gap-space-sm group disabled:opacity-70 disabled:cursor-not-allowed"
                  disabled={loading}
                  onClick={() => runSearch()}
                  type="button"
                >
                  <span className="material-symbols-outlined group-hover:rotate-12 transition-transform">
                    search
                  </span>
                  <span>{loading ? 'Buscando Vuelos...' : 'Actualizar Búsqueda'}</span>
                </button>
              </div>
            </section>

            {/* Weekly Fare Ribbon (Domingo a Sábado) */}
            <section className="w-full flex flex-col gap-space-xs">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-space-xs">
                  <span className="font-headline-sm text-headline-sm text-primary font-bold">
                    Calendario Semanal de Tarifas
                  </span>
                  <span className="font-code-telemetry text-code-telemetry text-outline-variant">
                    ARS / POR TRAMO
                  </span>
                </div>
                <span className="font-label-sm text-label-sm text-secondary-container uppercase tracking-wider font-bold">
                  Precios más bajos garantizados
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-space-xs md:gap-space-sm">
                {week.map((day) => {
                  const fare = fareByDate.get(day);
                  const isSelected = day === date;
                  const isBest = cheapestDay?.date === day;

                  if (isSelected) {
                    return (
                      <div
                        key={day}
                        className="flex flex-col items-center justify-center p-space-sm rounded-lg bg-primary text-on-primary text-center relative shadow-md"
                      >
                        {isBest && (
                          <span className="absolute -top-2 px-2 py-0.5 rounded-full bg-secondary-container text-on-secondary font-label-sm text-label-sm scale-90">
                            MEJOR OPCIÓN
                          </span>
                        )}
                        <span className="font-label-sm text-label-sm text-primary-fixed-dim uppercase font-bold">
                          {formatDayMonth(day)}
                        </span>
                        <span className="font-code-telemetry text-code-telemetry text-surface-container-lowest font-extrabold text-base mt-1">
                          {fare ? money(fare.price) : '—'}
                        </span>
                        <span className="text-xs text-secondary-fixed">Día Seleccionado</span>
                      </div>
                    );
                  }

                  return (
                    <button
                      key={day}
                      className="flex flex-col items-center justify-center p-space-sm rounded-lg bg-surface-container-lowest hover:bg-surface-container transition-colors text-center group shadow-sm"
                      onClick={() => {
                        updateDepartureDate(day);
                      }}
                      type="button"
                    >
                      <span className="font-label-sm text-label-sm text-outline uppercase">
                        {formatDayMonth(day)}
                      </span>
                      <span className="font-code-telemetry text-code-telemetry text-on-surface font-bold mt-1">
                        {fare ? money(fare.price) : '—'}
                      </span>
                      <span
                        className={
                          fare && fare.demandLevel !== 'NORMAL'
                            ? 'text-xs text-secondary font-semibold'
                            : 'text-xs text-outline group-hover:text-primary transition-colors'
                        }
                      >
                        {fare ? DEMAND_LABEL[fare.demandLevel] ?? 'Normal' : 'Sin datos'}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>

            {/* Operational Route Results Grid */}
            <section className="w-full flex flex-col gap-space-md">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-headline-md text-headline-md text-primary font-bold">
                    Vuelos Disponibles {originAirport?.city ?? origin} →{' '}
                    {destinationAirport?.city ?? destination}
                  </h2>
                  <p
                    className={
                      error
                        ? 'font-body-md text-body-md text-error'
                        : 'font-body-md text-body-md text-on-surface-variant'
                    }
                    role={error ? 'alert' : undefined}
                  >
                    {error
                      ? error
                        : `${pagination.total} servicios comerciales ${
                          pagination.total === 1 ? 'directo' : 'directos'
                        } para el día ${formatFullDate(date)}`}
                  </p>
                </div>
                <div className="hidden sm:flex items-center gap-space-xs text-outline font-label-md text-label-md">
                  <span className="material-symbols-outlined text-sm">schedule</span>
                  <span>Horarios en ART (UTC-3)</span>
                </div>
              </div>

              {flights.length === 0 ? (
                <div className="w-full bg-surface-container-lowest rounded-xl shadow-md p-space-lg flex flex-col items-center justify-center gap-space-sm text-center">
                  <span className="material-symbols-outlined text-4xl text-outline">
                    flight_off
                  </span>
                  <span className="font-headline-sm text-headline-sm text-primary font-bold">
                    Sin vuelos para la consulta
                  </span>
                  <span className="font-body-sm text-body-sm text-on-surface-variant max-w-md">
                    No hay servicios entre {origin} y {destination} para el{' '}
                    {formatFullDate(date)}. Probá otra fecha del calendario o invertí el tramo.
                  </span>
                </div>
              ) : (
                flights.map((flight, index) => (
                  <FlightCard
                    key={flight.id}
                    featured={index === 0}
                    flight={flight}
                    onSelect={(fareId) => setSelection({ flightId: flight.id, fareId })}
                    selection={selection}
                  />
                ))
              )}

              {pagination.pages > 1 && (
                <nav
                  aria-label="Paginación de vuelos"
                  className="flex flex-wrap items-center justify-center gap-space-md"
                >
                  <button
                    className="px-space-md py-space-sm rounded-lg bg-surface-container-lowest text-primary font-label-md text-label-md shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={loading || pagination.page <= 1}
                    onClick={() => runSearch(pagination.page - 1, false)}
                    type="button"
                  >
                    Anterior
                  </button>
                  <span aria-live="polite" className="font-label-md text-label-md text-on-surface-variant">
                    Página {pagination.page} de {pagination.pages} · {pagination.total} vuelos
                  </span>
                  <button
                    className="px-space-md py-space-sm rounded-lg bg-surface-container-lowest text-primary font-label-md text-label-md shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={loading || pagination.page >= pagination.pages}
                    onClick={() => runSearch(pagination.page + 1, false)}
                    type="button"
                  >
                    Siguiente
                  </button>
                </nav>
              )}
            </section>

            {/* Operational Context & Visual Aircraft Featurette */}
            <section className="grid grid-cols-1 md:grid-cols-3 gap-space-md">
              <div className="relative rounded-xl overflow-hidden shadow-sm h-52 bg-primary">
                <img
                  alt="Un avión comercial Boeing 737 con librea deep purple y magenta eléctrico, en la plataforma del aeropuerto Espora de Bahía Blanca."
                  className="w-full h-full object-cover opacity-60"
                  src={FLEET_IMG}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-primary via-primary/40 to-transparent p-space-md flex flex-col justify-end text-on-primary">
                  <span className="font-label-sm text-label-sm text-secondary-fixed uppercase tracking-wider">
                    Flota Activa
                  </span>
                  <span className="font-headline-sm text-headline-sm font-bold">
                    Base Bahía Blanca (BHI)
                  </span>
                  <span className="font-body-sm text-body-sm text-surface-container-highest">
                    Mantenimiento técnico aeronáutico UNS y despacho prioritario.
                  </span>
                </div>
              </div>

              <div className="bg-surface-container-lowest p-space-md rounded-xl shadow-sm flex flex-col justify-between">
                <div className="flex flex-col gap-space-xs">
                  <div className="flex items-center gap-space-xs text-secondary-container">
                    <span className="material-symbols-outlined">shield_with_heart</span>
                    <span className="font-label-md text-label-md font-bold uppercase">
                      Garantía Operativa AeroGestión
                    </span>
                  </div>
                  <p className="font-body-sm text-body-sm text-on-surface-variant">
                    Puntualidad auditada en tiempo real. En caso de demoras operativas mayores a
                    45 minutos, se acredita compensación inmediata al monedero del pasajero.
                  </p>
                </div>
                <div className="pt-space-sm flex items-center gap-space-sm">
                  <span className="w-2.5 h-2.5 rounded-full bg-secondary-container" />
                  <span className="font-code-telemetry text-code-telemetry text-primary font-bold">
                    {averagePunctuality(flights)} CUMPLIMIENTO ITINERARIO
                  </span>
                </div>
              </div>

              <div className="relative rounded-xl overflow-hidden shadow-sm h-52 bg-primary">
                <img
                  alt="Interior de cabina de un avión comercial con iluminación LED deep purple, asientos de cuero y pantallas de información de pasajeros."
                  className="w-full h-full object-cover opacity-60"
                  src={CABIN_IMG}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-primary via-primary/40 to-transparent p-space-md flex flex-col justify-end text-on-primary">
                  <span className="font-label-sm text-label-sm text-secondary-fixed uppercase tracking-wider">
                    Confort a Bordo
                  </span>
                  <span className="font-headline-sm text-headline-sm font-bold">
                    Cabinas Espaciosas
                  </span>
                  <span className="font-body-sm text-body-sm text-surface-container-highest">
                    Configuración optimizada con mayor espacio entre filas en toda la flota.
                  </span>
                </div>
              </div>
            </section>

            {/* Bottom Persistent Guide & Punctuality Guarantee Bar */}
            <aside
              aria-label="Garantía de Puntualidad y Siguiente Paso"
              className="w-full bg-primary-container text-on-primary rounded-xl p-space-md md:p-space-lg shadow-xl flex flex-col lg:flex-row items-center justify-between gap-space-md"
            >
              <div className="flex items-center gap-space-md min-w-0 w-full lg:w-auto">
                <div className="w-12 h-12 rounded-xl bg-secondary-container text-on-secondary flex items-center justify-center shrink-0 shadow-md">
                  <span className="material-symbols-outlined text-2xl">verified</span>
                </div>
                <div className="flex flex-col min-w-0">
                  <div className="flex items-center gap-space-xs">
                    <span className="font-label-lg text-label-lg font-bold tracking-tight text-surface-container-lowest">
                      Garantía de Puntualidad UNS AeroGestión
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-secondary font-code-telemetry text-xs text-on-secondary uppercase">
                      Oficial
                    </span>
                  </div>
                  <span className="font-body-sm text-body-sm text-primary-fixed-dim">
                    Vuelo monitoreado en tiempo real por el Centro de Control BHI. Próximo paso:
                    asignación nominal de butacas.
                  </span>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-space-md w-full lg:w-auto shrink-0">
                <div className="flex flex-col text-left sm:text-right px-space-sm">
                  <span
                    className="font-label-sm text-label-sm text-primary-fixed uppercase tracking-wider"
                    id="selected-summary-text"
                  >
                    {selectedFlight && selectedPrice
                      ? `${selectedFlight.code} (${selectedPrice.code}) • ${passengers} Pasajeros`
                      : 'Sin seleccion'}
                  </span>
                  <div className="flex items-baseline justify-start sm:justify-end gap-1">
                    <span className="font-label-sm text-label-sm text-outline-variant">Total:</span>
                    <span
                      className="font-headline-md text-headline-md text-surface-container-lowest font-extrabold tracking-tight"
                      id="selected-summary-total"
                    >
                      {money(total)} ARS
                    </span>
                  </div>
                </div>
                <button
                  className="px-space-xl py-3.5 rounded-lg bg-secondary-container text-on-secondary hover:bg-secondary font-label-lg text-label-lg font-bold shadow-lg transition-all flex items-center justify-center gap-space-sm group"
                  onClick={() => setNotice('Selección de Asientos')}
                  type="button"
                >
                  <div className="flex flex-col items-start leading-tight text-left">
                    <span className="text-xs opacity-90 font-normal">
                      Paso 2: Selección de Asientos
                    </span>
                    <span className="tracking-wide">Mapa de Cabina →</span>
                  </div>
                  <span className="material-symbols-outlined group-hover:translate-x-1 transition-transform">
                    airline_seat_recline_normal
                  </span>
                </button>
              </div>
            </aside>
          </div>
        </div>
      </main>

      <footer className="w-full bg-primary text-surface-container-lowest">
        <div className="w-full px-space-lg lg:px-margin py-space-lg flex flex-col md:flex-row items-center justify-between gap-space-md">
          <div className="flex flex-col sm:flex-row items-center gap-space-md text-center sm:text-left">
            <div className="flex items-center gap-space-xs">
              <span className="font-headline-sm text-headline-sm text-surface-container-lowest">
                AeroGestión
              </span>
              <span className="font-headline-sm text-headline-sm text-secondary">UNS</span>
            </div>
            <div className="h-4 w-[1px] bg-outline-variant hidden sm:block" />
            <span className="font-body-sm text-body-sm text-outline-variant">
              Terminal BHI Comandante Espora · Bahía Blanca, Argentina
            </span>
          </div>
          <div className="flex items-center gap-space-md">
            <div className="flex items-center gap-space-xs bg-tertiary-container px-space-sm py-space-xs rounded-full">
              <span className="w-2 h-2 rounded-full bg-secondary-container" />
              <span className="font-code-telemetry text-code-telemetry text-tertiary-fixed">
                Soporte 24/7 Operaciones
              </span>
            </div>
            <span className="font-body-sm text-body-sm text-outline-variant">
              © 2025 UNS. Todos los derechos reservados.
            </span>
          </div>
        </div>
      </footer>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Piezas                                                              */
/* ------------------------------------------------------------------ */

type ApiFlight = {
  id: string;
  code: string;
  departureAt: string;
  arrivalAt: string;
  status: string;
  isDirect: boolean;
  punctualityPct: number | null;
  tags: string[];
  route: FlightCardData['route'];
  aircraft: FlightCardData['aircraft'];
  prices: SerializedPrice[];
};

type ApiWeeklyFare = {
  id: string;
  date: string;
  price: number;
  demandLevel: string;
  currency: string;
};

function averagePunctuality(flights: FlightCardData[]): string {
  const withData = flights
    .map((f) => f.punctualityPct)
    .filter((p): p is number => typeof p === 'number');
  if (withData.length === 0) return 'SIN DATOS';
  const avg = withData.reduce((a, b) => a + b, 0) / withData.length;
  return `${avg.toFixed(1)}%`;
}

/** Campo del buscador: mantiene el diseno en dos lineas del HTML original. */
function Field({
  label,
  icon,
  children,
  dimmed,
}: {
  label: string;
  icon: string;
  children: React.ReactNode;
  dimmed?: boolean;
}) {
  return (
    <div className="lg:col-span-2 flex flex-col gap-space-xs">
      <label className="font-label-sm text-label-sm uppercase tracking-wider text-outline">
        {label}
      </label>
      <div
        className={
          dimmed
            ? 'relative flex items-center gap-space-sm px-space-md h-12 bg-surface-container-low rounded-lg opacity-60 transition-all'
            : 'relative flex items-center gap-space-sm px-space-md h-12 bg-surface-container-low rounded-lg focus-within:bg-surface-container-lowest focus-within:shadow-sm transition-all'
        }
      >
        <span
          className={
            icon === 'flight_land'
              ? 'material-symbols-outlined text-secondary-container'
              : icon === 'calendar_today' || icon === 'event_repeat' || icon === 'group'
                ? 'material-symbols-outlined text-primary'
                : 'material-symbols-outlined text-secondary-container'
          }
        >
          {icon}
        </span>
        <div className="flex flex-col min-w-0">{children}</div>
      </div>
    </div>
  );
}

function FlightCard({
  flight,
  featured,
  selection,
  onSelect,
}: {
  flight: FlightCardData;
  featured: boolean;
  selection: Selection | null;
  onSelect: (fareId: string) => void;
}) {
  // La grilla original reserva 3+3 columnas para dos tarifas; si el vuelo tiene
  // mas, se muestran las dos mas baratas para no romper el diseno 12 columnas.
  const prices = [...flight.prices]
    .sort((a, b) => a.price - b.price)
    .slice(0, 2);
  const cheapest = prices.length > 0 ? prices[0]!.id : null;

  // El HTML original rotulaba estas tarjetas con la disposicion de cabina
  // ("DISPOSICIÓN 2-2 SIN ASIENTO AL MEDIO") o con una etiqueta del vuelo. El tag
  // "Directo" ya aparece en el bloque de horarios, asi que no aporta nada.
  const tag =
    flight.tags.find((t) => t.toLowerCase() !== 'directo') ??
    (flight.aircraft.layout ? flight.aircraft.layout.toUpperCase() : 'VUELO REGULAR DIRECTO');

  return (
    <article className="w-full bg-surface-container-lowest rounded-xl shadow-md p-space-md md:p-space-lg flex flex-col gap-space-md transition-shadow hover:shadow-lg">
      <div className="flex flex-wrap items-center justify-between gap-space-sm">
        <div className="flex items-center gap-space-sm">
          <span className="px-space-sm py-0.5 rounded-full bg-surface-container text-primary font-code-telemetry text-code-telemetry font-bold">
            {flight.code}
          </span>
          <span className="font-body-sm text-body-sm text-on-surface-variant font-medium">
            {flight.aircraft.model} • Matrícula {flight.aircraft.registration}
          </span>
          {flight.punctualityPct !== null && (
            <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-surface-container-high text-primary font-label-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-secondary-container" />
              {flight.punctualityPct}% Puntualidad Histórica
            </span>
          )}
        </div>
        {featured && (flight.aircraft.hasWifi || flight.aircraft.hasUsbPower) ? (
          <div className="flex items-center gap-space-xs text-on-tertiary-fixed-variant bg-tertiary-fixed px-space-sm py-0.5 rounded-md font-label-sm text-label-sm">
            <span className="material-symbols-outlined text-sm">wifi</span>
            <span>Wi-Fi &amp; USB Power</span>
          </div>
        ) : (
          <span className="font-code-telemetry text-code-telemetry text-outline-variant">
            {tag}
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-md items-center">
        <div className="lg:col-span-5 flex items-center justify-between gap-space-sm bg-surface-container-low p-space-md rounded-lg">
          <div className="flex flex-col">
            <span className="font-headline-lg text-headline-lg text-primary font-extrabold tracking-tight">
              {formatTime(flight.departureAt, TZ)}
            </span>
            <span className="font-headline-sm text-headline-sm font-bold text-on-surface">
              {flight.route.originAirport.iataCode}
            </span>
            <span className="font-body-sm text-body-sm text-outline truncate">
              {shortName(flight.route.originAirport.name)}
            </span>
          </div>

          <div className="flex-1 flex flex-col items-center px-space-sm">
            <span className="font-label-sm text-label-sm text-on-surface-variant font-semibold">
              {formatDuration(flight.route.durationMinutes)}
            </span>
            <div className="relative w-full flex items-center justify-center my-1.5">
              <div className="h-0.5 w-full bg-outline-variant" />
              <div className="absolute flex items-center justify-center w-6 h-6 rounded-full bg-primary text-on-primary">
                <span className="material-symbols-outlined text-xs">flight</span>
              </div>
            </div>
            <span className="font-code-telemetry text-code-telemetry text-secondary-container uppercase">
              {flight.isDirect ? 'Directo' : 'Con escalas'}
            </span>
          </div>

          <div className="flex flex-col items-end">
            <span className="font-headline-lg text-headline-lg text-primary font-extrabold tracking-tight">
              {formatTime(flight.arrivalAt, TZ)}
            </span>
            <span className="font-headline-sm text-headline-sm font-bold text-on-surface">
              {flight.route.destinationAirport.iataCode}
            </span>
            <span className="font-body-sm text-body-sm text-outline truncate">
              {shortName(flight.route.destinationAirport.name)}
            </span>
          </div>
        </div>

        {prices.map((price) => {
          const active = selection?.flightId === flight.id && selection.fareId === price.id;
          const isCheapest = price.id === cheapest;
          return (
            <div
              key={price.id}
              className={
                active
                  ? 'fare-card-selectable lg:col-span-3 p-space-md rounded-lg bg-surface-container-highest cursor-pointer transition-all flex flex-col justify-between h-full gap-space-xs shadow-md'
                  : 'fare-card-selectable lg:col-span-3 p-space-md rounded-lg bg-surface-container-low cursor-pointer transition-all flex flex-col justify-between h-full gap-space-xs hover:bg-surface-container'
              }
              onClick={() => onSelect(price.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelect(price.id);
                }
              }}
              aria-pressed={active}
            >
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="font-label-md text-label-md font-bold text-primary">
                    {price.name}
                  </span>
                  {isCheapest ? (
                    <span
                      className={
                        active
                          ? 'material-symbols-outlined text-secondary-container text-base'
                          : 'material-symbols-outlined text-outline text-base'
                      }
                    >
                      {active ? 'check_circle' : 'radio_button_unchecked'}
                    </span>
                  ) : (
                    <span className="font-label-sm text-label-sm px-1.5 py-0.5 rounded bg-primary-container text-on-primary">
                      Premium
                    </span>
                  )}
                </div>
                <ul className="text-xs text-on-surface-variant space-y-1">
                  {benefitsOf(price).map((b, i) => (
                    <li key={b.text} className="flex items-center gap-1.5">
                      {b.icon && (
                        <span
                          className={
                            isCheapest
                              ? 'material-symbols-outlined text-xs text-secondary-container'
                              : 'material-symbols-outlined text-xs text-primary'
                          }
                        >
                          {b.icon}
                        </span>
                      )}
                      {b.text}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="mt-2 pt-2 border-t border-outline-variant/30 flex flex-col">
                <span className="font-label-sm text-label-sm text-outline">Por Pasajero</span>
                <span className="font-headline-sm text-headline-sm font-extrabold text-primary">
                  {money(price.price)}{' '}
                  <span className="font-code-telemetry text-xs font-normal text-outline">
                    {price.currency}
                  </span>
                </span>
              </div>
            </div>
          );
        })}

        {featured ? (
          <div className="lg:col-span-1 hidden lg:flex flex-col items-center justify-center">
            <span className="material-symbols-outlined text-3xl text-secondary-container animate-pulse">
              keyboard_arrow_right
            </span>
          </div>
        ) : (
          <div className="lg:col-span-1 flex items-center justify-center">
            <button
              className="w-10 h-10 rounded-full bg-surface-container-high hover:bg-secondary-container hover:text-on-secondary transition-all flex items-center justify-center text-primary"
              onClick={() => prices[0] && onSelect(prices[0].id)}
              title={`Elegir ${flight.code}`}
              type="button"
            >
              <span className="material-symbols-outlined text-lg">check</span>
            </button>
          </div>
        )}
      </div>

      {featured && (
        <div className="flex flex-col sm:flex-row items-center justify-between pt-space-xs gap-space-md bg-surface-container-low p-space-sm rounded-lg">
          <div className="flex items-center gap-space-sm">
            <span className="material-symbols-outlined text-secondary-container">info</span>
            <span className="font-body-sm text-body-sm text-on-surface">
              Selección recomendada: salida a primera hora con conexión inmediata en{' '}
              {flight.route.destinationAirport.iataCode}.
            </span>
          </div>
          <button
            className="w-full sm:w-auto px-space-lg py-space-sm rounded-lg bg-secondary-container text-on-secondary font-label-lg text-label-lg font-bold hover:bg-secondary transition-all shadow-md flex items-center justify-center gap-space-sm"
            type="button"
          >
            <span>Seleccionar Vuelo &amp; Continuar a Asientos</span>
            <span className="material-symbols-outlined">arrow_forward</span>
          </button>
        </div>
      )}
    </article>
  );
}

/** `benefits` se guarda como "icono|Texto" (ver prisma/seed.ts). */
function benefitsOf(price: SerializedPrice): { icon: string | null; text: string }[] {
  const list = price.benefits.map((b) => {
    const [first, ...rest] = b.split('|');
    return rest.length > 0
      ? { icon: first!, text: rest.join('|') }
      : { icon: null, text: first! };
  });
  if (list.length === 0) {
    return [{ icon: 'airline_seat_recline_normal', text: `${price.availableSeats} lugares disponibles` }];
  }
  return list;
}

/** "Aeropuerto Internacional Commodoro Espora" -> "Espora" */
function shortName(name: string): string {
  const cleaned = name.replace(/^Aeropuerto\s+/i, '');
  const words = cleaned.split(/\s+/);
  return words.length <= 2 ? cleaned : words[words.length - 1]!;
}
