import { requireAdminPage } from '../admin/require-admin';
import CounterSaleClient from './venta-client';
export const dynamic = 'force-dynamic';
export default async function CounterPage() {
  await requireAdminPage({ allowMostrador: true });
  return <CounterSaleClient />;
}
