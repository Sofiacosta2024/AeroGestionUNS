import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Iniciar Sesión · AeroGestión UNS' };

/**
 * Layout del portal de autenticacion.
 *
 * `theme-login` fija los tokens de color y tipografia que login.html definia en su
 * propio tailwind.config (por ejemplo `secondary` = #E11D48 en vez del #BA0035 de
 * la pantalla de vuelos). Las clases de <body> del HTML original se replican aca
 * porque <body> es unico para toda la app.
 */
export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return (
    // `items-start` en movil: con `items-center` una tarjeta mas alta que la
    // pantalla queda recortada por arriba y no se puede desplazar hasta el logo.
    <div className="theme-login bg-[#F8FAFC] font-body-md text-on-surface antialiased min-h-screen flex items-start sm:items-center justify-center px-4 py-6 sm:p-gutter sm:py-gutter">
      {children}
    </div>
  );
}
