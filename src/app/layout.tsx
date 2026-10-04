import type { Metadata } from 'next';
import { ClerkProvider } from '@clerk/nextjs';
import './globals.css';

export const metadata: Metadata = {
  title: 'AeroGestión UNS',
  description: 'Sistema de Gestión Aérea · BHI // AIRPORT OPS',
  applicationName: 'AeroGestión UNS',
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <html lang="es">
        <head>
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
          {/* Mismas fuentes que usaba el HTML original: Plus Jakarta Sans, Space Grotesk
              y los iconos Material Symbols Outlined. */}
          <link
            rel="stylesheet"
            href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&family=Space+Grotesk:wght@600&display=swap"
          />
          <link
            rel="stylesheet"
            href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=swap"
          />
        </head>
        {/* Las clases de <body> difieren entre login y vuelos, por eso cada pagina
            aplica las suyas en su propio contenedor con el tema correspondiente. */}
        <body>{children}</body>
      </html>
    </ClerkProvider>
  );
}