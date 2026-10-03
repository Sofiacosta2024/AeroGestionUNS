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
        <div className="flex flex-col">
          <div className="flex items-center gap-space-xs">
            <span className="font-headline-sm text-headline-sm text-surface-container-lowest leading-none">
              AeroGestión
            </span>
            <span className="font-headline-sm text-headline-sm text-secondary leading-none">UNS</span>
          </div>
          <span className="font-label-sm text-label-sm text-primary-fixed-dim uppercase tracking-wider">
            Panel de administración
          </span>
        </div>

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

        <button
          className="flex items-center gap-space-sm bg-primary/70 px-space-sm py-space-xs rounded-full hover:bg-primary transition-colors"
          onClick={logout}
          title="Cerrar sesión"
          type="button"
        >
          <span className="flex flex-col text-right">
            <span className="font-label-md text-label-md text-surface-container-lowest leading-snug">{userName}</span>
            <span className="font-label-sm text-label-sm text-secondary-fixed leading-none">Administrador</span>
          </span>
          <span className="material-symbols-outlined text-primary-fixed-dim">logout</span>
        </button>
      </div>
    </header>
  );
}
