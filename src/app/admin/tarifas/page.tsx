import { prisma } from '@/lib/prisma';
import { seatSelectionUnitFee } from '@/lib/seat-pricing';
import { requireAdminPage } from '../require-admin';
import SeatFeesForm from './seat-fees-form';

export const dynamic = 'force-dynamic';

export default async function TarifasPage() {
  await requireAdminPage();
  const fares = await prisma.fare.findMany({ orderBy: [{ cabinClass: 'asc' }, { code: 'asc' }] });
  return <div className="max-w-4xl mx-auto px-4 py-8">
    <h1 className="text-2xl font-bold">Adicional por elección de asiento</h1>
    <p className="mt-2 mb-6 text-on-surface-variant">Configurá el adicional fijo por pasajero de las tarifas Economy. Se aplica a la elección manual tanto en la web como en Mostrador, en todos los vuelos que usan esa tarifa. Economy Premium, Primera y la asignación automática no tienen recargo. Un importe de 0 deja la elección incluida. Las reservas existentes conservan su importe.</p>
    <SeatFeesForm fares={fares.map(fare => ({ id: fare.id, code: fare.code, name: fare.name, cabinClass: fare.cabinClass, isActive: fare.isActive, seatSelectionFee: seatSelectionUnitFee(fare) }))} />
  </div>;
}
