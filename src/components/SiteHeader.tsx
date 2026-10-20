'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useClerk } from '@clerk/nextjs';

const TZ = 'America/Argentina/Buenos_Aires';

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

export type SiteHeaderUser = { name: string; role: string } | null;

type SiteHeaderProps = {
  user: SiteHeaderUser;
  /** Seccion activa: define cual de los dos links reales recibe aria-current. */
  activePath: 'vuelos' | 'reserva';
  /**
   * Si la pagina provee un handler, los avisos "en construccion" la maneja ella
   * (con su propio banner). Si no, el header los maneja internamente: asi la
   * consulta publica puede reutilizar la barra sin duplicar el banner.
   */
  onNotice?: (label: string) => void;
};

const desktopLinkCls = (active: boolean) =>
  active
    ? 'px-space-md py-space-sm transition-colors bg-secondary text-on-secondary font-label-lg rounded-lg shadow-[0_1px_8px_rgba(0,0,0,0.04)]'
    : 'px-space-md py-space-sm rounded-lg font-label-lg text-label-lg text-primary-fixed-dim hover:bg-primary hover:text-on-primary transition-colors';

const mobileLinkCls = (active: boolean) =>
  active
    ? 'shrink-0 px-3 py-1.5 rounded-lg bg-secondary text-on-secondary font-label-md text-label-md'
    : 'shrink-0 px-3 py-1.5 rounded-lg font-label-md text-label-md text-primary-fixed-dim bg-primary/60';

/**
 * Barra de navegacion principal del sitio. Compartida por el motor de vuelos y
 * la consulta publica de reservas; se autoaplica `theme-vuelos` para que los
 * tokens (secondary #BA0035, headline-sm 20px, etc.) sean los mismos aunque la
 * pagina viva bajo otro tema (ej. `theme-login` en /reserva).
 */
export default function SiteHeader({ user, activePath, onNotice }: SiteHeaderProps) {
  const router = useRouter();
  const { signOut } = useClerk();
  const [clock, setClock] = useState('--:--:--');
  const [internalNotice, setInternalNotice] = useState<string | null>(null);

  const notify = (label: string) => {
    if (onNotice) onNotice(label);
    else setInternalNotice(label);
  };

  // El aviso de "en construccion" se cierra solo (solo en modo interno; si la
  // pagina controla el aviso, su propio efecto lo cierra).
  useEffect(() => {
    if (onNotice || !internalNotice) return;
    const id = setTimeout(() => setInternalNotice(null), 5000);
    return () => clearTimeout(id);
  }, [internalNotice, onNotice]);

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

  async function logout() {
    await signOut({ redirectUrl: '/login' });
    router.refresh();
  }

  return (
    <>
      <header className="theme-vuelos fixed top-0 left-0 w-full z-50 bg-primary-container shadow-[0_1px_8px_rgba(0,0,0,0.04)]">
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
              aria-current={activePath === 'vuelos' ? 'page' : undefined}
              className={desktopLinkCls(activePath === 'vuelos')}
              data-path="buscar-vuelos"
              href="/vuelos"
            >
              Buscar Vuelos
            </a>
            <a
              aria-current={activePath === 'reserva' ? 'page' : undefined}
              className={desktopLinkCls(activePath === 'reserva')}
              data-path="consultar-reserva"
              href="/reserva"
            >
              Consultar Reserva
            </a>
            {PENDING_SECTIONS.map((s) => (
              <button
                key={s.path}
                className="px-space-md py-space-sm rounded-lg font-label-lg text-label-lg text-primary-fixed-dim hover:bg-primary hover:text-on-primary transition-colors"
                data-path={s.path}
                onClick={() => notify(s.label)}
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
                onClick={() => notify('Centro de Control BHI')}
                type="button"
              >
                <span className="material-symbols-outlined">notifications</span>
              </button>
              <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-full bg-secondary ring-2 ring-primary-container" />
            </div>

            {user ? (
              <button
                className="flex items-center gap-space-sm bg-primary/70 p-space-xs pl-space-sm rounded-full hover:bg-primary transition-colors"
                onClick={logout}
                title="Cerrar sesion"
                type="button"
              >
                <div className="hidden md:flex flex-col text-right">
                  <span className="font-label-md text-label-md text-surface-container-lowest leading-snug">
                    {user.name}
                  </span>
                  <span className="font-label-sm text-label-sm text-secondary-fixed leading-none">
                    {user.role}
                  </span>
                </div>
                <span className="w-8 h-8 rounded-full bg-secondary-container text-on-secondary flex items-center justify-center font-label-md text-label-md font-bold">
                  {user.name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()}
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
              aria-current={activePath === 'vuelos' ? 'page' : undefined}
              className={mobileLinkCls(activePath === 'vuelos')}
              href="/vuelos"
            >
              Buscar Vuelos
            </a>
            <a
              aria-current={activePath === 'reserva' ? 'page' : undefined}
              className={mobileLinkCls(activePath === 'reserva')}
              href="/reserva"
            >
              Consultar
            </a>
            {PENDING_SECTIONS.map((s) => (
              <button
                key={s.path}
                className="shrink-0 px-3 py-1.5 rounded-lg font-label-md text-label-md text-primary-fixed-dim bg-primary/60"
                onClick={() => notify(s.label)}
                type="button"
              >
                {s.short}
              </button>
            ))}
          </nav>
        </div>
      </header>

      {!onNotice && internalNotice && (
        <div
          className="theme-vuelos fixed top-[7.25rem] lg:top-20 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-md"
          role="status"
        >
          <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-primary text-on-primary shadow-xl">
            <span className="material-symbols-outlined text-lg text-secondary-fixed shrink-0">
              construction
            </span>
            <p className="font-label-md text-label-md leading-snug flex-1">
              <span className="font-bold">{internalNotice}</span> está en construcción: esta
              versión cubre búsqueda, autenticación y reservas.
            </p>
            <button
              aria-label="Cerrar aviso"
              className="text-on-primary/70 hover:text-on-primary shrink-0"
              onClick={() => setInternalNotice(null)}
              type="button"
            >
              <span className="material-symbols-outlined text-lg">close</span>
            </button>
          </div>
        </div>
      )}
    </>
  );
}
