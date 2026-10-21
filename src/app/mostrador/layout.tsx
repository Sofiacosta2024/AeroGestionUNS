import type { ReactNode } from 'react';
import { requireAdminPage } from '../admin/require-admin';
import './mostrador.css';
import CounterHeader from '@/components/mostrador/counter-header';
export const metadata = { title: 'Venta en Mostrador · AeroGestión UNS' };
export default async function CounterLayout({ children }: { children: ReactNode }) {
  const user = await requireAdminPage({ allowMostrador: true });
  return <div className="theme-vuelos counter-shell"><CounterHeader legajo={user.legajo} branch={process.env.MOSTRADOR_BRANCH_NAME || 'Bahía Blanca'} />{children}</div>;
}
