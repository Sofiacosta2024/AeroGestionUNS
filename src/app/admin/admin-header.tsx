'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

const LINKS = [
  { href: '/admin/vuelos/nuevo', label: 'Alta de vuelos' },
  { href: '/admin/itinerario', label: 'Planilla del día' },
  { href: '/vuelos', label: 'Buscar vuelos' },
] as const;

const LINK_BASE = 'shrink-0 px-space-md py-space-sm rounded-lg font-label-lg text-label-lg transition-colors';
const LINK_ACTIVE = `${LINK_BASE} bg-secondary text-on-secondary shadow-[0_1px_8px_rgba(0,0,0,0.04)]`;
const LINK_IDLE = `${LINK_BASE} text-primary-fixed-dim hover:bg-primary hover:text-on-primary`;

/** Header del panel de administracion: marca, navegacion y cierre de sesion. */
export default function AdminHeader({ userName }: { userName: string }) {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
    router.replace('/login');
    router.refresh();
  }

  return (
    <header className="fixed top-0 left-0 w-full z-50 bg-primary-container shadow-[0_1px_8px_rgba(0,0,0,0.04)]">
      <div className="min-h-20 w-full px-4 sm:px-space-lg lg:px-margin py-3 lg:py-0 flex flex-wrap items-center justify-between gap-space-sm">
        <Link href="/admin/itinerario" className="flex items-center gap-3 group">
          <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center shadow-md shadow-black/20 shrink-0 overflow-hidden group-hover:scale-105 transition-transform">
            <img
              src="/brand-icon-transparent.png"
              alt="AeroGestión UNS"
              className="w-full h-full object-cover"
            />
          </div>
          <div className="flex flex-col">
            <div className="flex items-baseline gap-1.5 leading-none">
              <span className="font-bold text-lg text-surface-container-lowest tracking-tight">
                AeroGestión
              </span>
              <span className="font-extrabold text-lg text-secondary tracking-wide">UNS</span>
            </div>
            <span className="font-label-sm text-[10px] text-primary-fixed-dim uppercase tracking-widest font-semibold mt-1">
              Panel de administración
            </span>
          </div>
        </Link>

        <nav
          aria-label="Navegacion de administracion"
          className="order-last lg:order-none w-full lg:w-auto flex items-center gap-space-xs overflow-x-auto"
        >
          {LINKS.map((l) => (
            <Link
              key={l.href}
              aria-current={pathname.startsWith(l.href) ? 'page' : undefined}
              className={pathname.startsWith(l.href) ? LINK_ACTIVE : LINK_IDLE}
              href={l.href}
            >
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2.5">
          <div className="flex flex-col text-right">
            <span className="font-label-md text-label-md text-surface-container-lowest font-semibold leading-snug">
              {userName}
            </span>
            <span className="font-label-sm text-[11px] text-secondary-fixed leading-none">
              Administrador
            </span>
          </div>
          <button
            className="flex items-center justify-center w-9 h-9 rounded-full bg-primary/70 hover:bg-secondary text-primary-fixed-dim hover:text-white transition-all shadow-sm"
            onClick={logout}
            title="Cerrar sesión"
            type="button"
          >
            <span className="material-symbols-outlined text-[19px]">logout</span>
          </button>
        </div>
      </div>
    </header>
  );
}
