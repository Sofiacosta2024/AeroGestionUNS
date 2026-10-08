import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { getFlightSeatsStatus } from '@/lib/seat-locks';
import AsientosClient from './asientos-client';

export const dynamic = 'force-dynamic';

export default async function AsientosPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ fareId?: string; passengers?: string }>;
}) {
  const { id } = await params;
  const { fareId, passengers } = await searchParams;

  const user = await getCurrentUser();

  const flight = await prisma.flight.findUnique({
    where: { id },
    include: {
      route: {
        include: {
          originAirport: true,
          destinationAirport: true,
        },
      },
      aircraft: true,
      fares: {
        include: { fare: true },
      },
    },
  });

  if (!flight) notFound();

  const initialSeatsData = await getFlightSeatsStatus(id, fareId);

  const selectedFare = fareId
    ? flight.fares.find((f) => f.fareId === fareId) ?? flight.fares[0]
    : flight.fares[0];

  const parsedPassengers = Math.min(
    9,
    Math.max(1, parseInt(passengers || '1', 10) || 1),
  );

  return (
    <div className="theme-vuelos min-h-screen bg-surface">
      <AsientosClient
        flight={{
          id: flight.id,
          code: flight.code,
          departureAt: flight.departureAt.toISOString(),
          arrivalAt: flight.arrivalAt.toISOString(),
          isDirect: flight.isDirect,
          originAirport: flight.route.originAirport,
          destinationAirport: flight.route.destinationAirport,
          aircraft: {
            id: flight.aircraft.id,
            model: flight.aircraft.model,
            registration: flight.aircraft.registration,
            layout: flight.aircraft.layout,
            seatCount: flight.aircraft.seatCount,
          },
        }}
        initialFare={
          selectedFare
            ? {
                id: selectedFare.fare.id,
                name: selectedFare.fare.name,
                cabinClass: selectedFare.fare.cabinClass,
                price: Number(selectedFare.price),
                currency: selectedFare.currency,
              }
            : null
        }
        allFares={flight.fares.map((f) => ({
          id: f.fare.id,
          name: f.fare.name,
          cabinClass: f.fare.cabinClass,
          price: Number(f.price),
          currency: f.currency,
        }))}
        initialSeats={initialSeatsData.seats}
        initialPassengersCount={parsedPassengers}
        currentUser={
          user
            ? {
                email: user.email,
                role: user.role,
              }
            : null
        }
      />
    </div>
  );
}
