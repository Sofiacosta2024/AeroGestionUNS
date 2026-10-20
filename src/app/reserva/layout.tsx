import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Consultá tu reserva · AeroGestión UNS' };

/**
 * Layout de la consulta publica de reservas (US-14A).
 *
 * Es una pantalla publica (ver `isPublic` en `src/middleware.ts`), asi que no
 * exige sesion. Reutiliza `theme-login`: sus tokens de color (`secondary`
 * #E11D48) coinciden con el wireframe WF-14A, y a diferencia de `theme-vuelos`
 * no sobreescribe las tipografias con los valores de la pantalla de vuelos.
 */
export default function ReservaLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="theme-login bg-background font-body-md text-on-surface antialiased min-h-screen">
      {children}
    </div>
  );
}
