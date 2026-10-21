import { notFound } from 'next/navigation';
import { requireAdminPage } from '../../require-admin';
import { getPasajerosAfectados } from '@/lib/contingencias';
import ReallocationView from './reallocation-view';

export const dynamic = 'force-dynamic';

type Props = {
  params: Promise<{ id: string }>;
};

export default async function ContingenciaDetailPage({ params }: Props) {
  await requireAdminPage();
  const { id } = await params;

  try {
    const data = await getPasajerosAfectados(id);

    return (
      <ReallocationView
        flight={{
          ...data.flight,
          departureAt: data.flight.departureAt.toISOString(),
          arrivalAt: data.flight.arrivalAt.toISOString(),
        }}
        passengers={data.passengers}
        initialAlternativeFlights={data.alternativeFlights.map((f) => ({
          ...f,
          departureAt: f.departureAt.toISOString(),
          arrivalAt: f.arrivalAt.toISOString(),
        }))}
      />
    );
  } catch (err) {
    notFound();
  }
}
