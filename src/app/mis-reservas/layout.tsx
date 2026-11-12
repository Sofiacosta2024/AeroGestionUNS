import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Mis Reservas · AeroGestión UNS' };

/**
 * Layout del panel "Mis Reservas" (US-15 v2.0).
 *
 * Es una pantalla privada (no figura en `isPublic` de `src/middleware.ts`), asi
 * que exige sesion. Reutiliza `theme-login`: sus tokens de color (`secondary`
 * #E11D48) coinciden con los wireframes WF-15 / WF-15-E.
 */
export default function MisReservasLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="theme-login bg-background font-body-md text-on-surface antialiased min-h-screen">
      {children}
    </div>
  );
}
