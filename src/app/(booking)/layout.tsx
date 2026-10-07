import Link from 'next/link';
import { UserButton } from '@clerk/nextjs';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import './booking.css';

export default async function BookingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  return (
    <div className="booking-app">
      <header className="booking-header">
        <Link href="/vuelos" className="booking-brand">
          AeroGestión<span>UNS</span>
          <small>SISTEMA OPERATIVO AERONÁUTICO</small>
        </Link>
        <span className="hub-pill">● BHI HUB · OPERATIVO</span>
        <nav aria-label="Navegación principal">
          <Link href="/vuelos">Buscar vuelos</Link>
          {user.role === 'ADMIN' && <Link href="/admin">Ir a admin</Link>}
        </nav>
        <div className="booking-user">
          <span>
            {user.firstName} {user.lastName}
            <small>
              {user.role === 'ADMIN' ? 'Administrador' : 'Pasajero'}
            </small>
          </span>
          <UserButton />
        </div>
      </header>
      {children}
      <footer className="booking-footer">
        <span>
          AeroGestión <b>UNS</b>
        </span>
        <span>Proyecto universitario · Pagos simulados</span>
      </footer>
    </div>
  );
}
