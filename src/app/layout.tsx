import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'AeroGestión UNS',
  description: 'Sistema de Gestión Aérea · BHI // AIRPORT OPS',
  applicationName: 'AeroGestión UNS',
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* Tipografias oficiales: Plus Jakarta Sans, Space Grotesk y Playfair Display */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700;800&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Space+Grotesk:wght@600&display=swap"
        />
        {/* Iconografia oficial Material Symbols Outlined */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200"
        />
      </head>
      {/* Las clases de <body> difieren entre login y vuelos, por eso cada pagina
          aplica las suyas en su propio contenedor con el tema correspondiente. */}
      <body>{children}</body>
    </html>
  );
}
