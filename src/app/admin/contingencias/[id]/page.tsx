import { notFound } from 'next/navigation';
import { requireAdminPage } from '../../require-admin';
import { getReservasAfectadas } from '@/lib/contingencias';
import ReallocationView from './reallocation-view';

export const dynamic = 'force-dynamic';

type Props = {
  params: Promise<{ id: string }>;
};

export default async function ContingenciaDetailPage({ params }: Props) {
  await requireAdminPage();
  const { id } = await params;

  try {
    const data = await getReservasAfectadas(id);

    return (
      <ReallocationView
        flight={{
          ...data.flight,
          departureAt: data.flight.departureAt.toISOString(),
          arrivalAt: data.flight.arrivalAt.toISOString(),
        }}
        initialMetrics={data.metrics}
        initialReservas={data.reservas.map((r) => ({
          ...r,
          createdAt: r.createdAt.toISOString(),
          vueloPropuesto: r.vueloPropuesto
            ? {
                ...r.vueloPropuesto,
                departureAt: r.vueloPropuesto.departureAt.toISOString(),
                arrivalAt: r.vueloPropuesto.arrivalAt.toISOString(),
              }
            : null,
        }))}
      />
    );
  } catch (err) {
    notFound();
  }
}
