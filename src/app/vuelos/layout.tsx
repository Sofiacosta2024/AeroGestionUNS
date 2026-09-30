import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Vuelos · AeroGestión UNS' };

/**
 * Layout del motor de vuelos.
 *
 * `theme-vuelos` fija los tokens que vuelos.html definia en su propio
 * tailwind.config (`secondary` = #BA0035, `headline-lg` = 32px, etc.), distintos
 * de los del portal de autenticacion.
 */
export default function VuelosLayout({ children }: { children: React.ReactNode }) {
  return <div className="theme-vuelos bg-surface font-body-md text-on-surface antialiased">{children}</div>;
}
