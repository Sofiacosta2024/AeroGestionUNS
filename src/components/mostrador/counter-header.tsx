'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { UserButton } from '@clerk/nextjs';

export default function CounterHeader({ legajo, branch }: { legajo: string | null; branch: string }) {
  const pathname = usePathname();
  const [clock, setClock] = useState('--:--');
  useEffect(() => {
    const update = () => setClock(new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date()));
    update(); const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, []);
  return <header className="counter-header">
    <Link href="/mostrador" className="counter-brand">AeroGestión <span>UNS</span></Link>
    <span className="counter-hub"><span aria-hidden="true">●</span> BHI HUB · OPERATIVO</span>
    <nav aria-label="Mostrador">
      <Link href="/mostrador" aria-current={pathname === '/mostrador' ? 'page' : undefined}>Venta</Link>
      <Link href="/admin/reservas">Reservas</Link>
      <span aria-disabled="true" title="Caja todavía no está disponible">Caja</span>
    </nav>
    <div className="counter-session"><time>{clock} ART</time><span>Legajo {legajo ?? 'sin asignar'} · Suc. {branch}</span>
      <UserButton appearance={{ elements: { avatarBox: 'counter-avatar', userButtonTrigger: 'counter-avatar-trigger' } }} />
    </div>
  </header>;
}
