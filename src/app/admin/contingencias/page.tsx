import Link from 'next/link';
import { FlightStatus, BookingStatus } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { formatDayMonth, formatTime } from '@/lib/format';
import { requireAdminPage } from '../require-admin';

export const dynamic = 'force-dynamic';

export default async function ContingenciasPage() {
  await requireAdminPage();

  // Buscar todos los vuelos cancelados
  const cancelledFlights = await prisma.flight.findMany({
    where: {
      status: FlightStatus.CANCELLED,
    },
    include: {
      route: {
        include: { originAirport: true, destinationAirport: true },
      },
      aircraft: true,
      bookingFlights: {
        include: {
          booking: {
            include: {
              passengers: true,
            },
          },
        },
      },
    },
    orderBy: { departureAt: 'desc' },
    take: 50,
  });

  const flightsWithStats = cancelledFlights.map((f) => {
    let pendingPassengers = 0;
    let totalPassengers = 0;

    for (const bf of f.bookingFlights) {
      const b = bf.booking;
      const count = b.passengers.length || b.passengersCount || 1;
      totalPassengers += count;
      if (b.status === BookingStatus.REPROGRAMACION_PENDIENTE) {
        pendingPassengers += count;
      }
    }

    return {
      id: f.id,
      code: f.code,
      origin: f.route.originAirport.iataCode,
      destination: f.route.destinationAirport.iataCode,
      originCity: f.route.originAirport.city,
      destinationCity: f.route.destinationAirport.city,
      departureAt: f.departureAt,
      aircraftRegistration: f.aircraft.registration,
      aircraftModel: f.aircraft.model,
      notes: f.notes,
      totalPassengers,
      pendingPassengers,
    };
  });

  return (
    <div className="max-w-7xl mx-auto w-full px-4 sm:px-space-lg lg:px-margin pt-space-lg flex flex-col gap-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <span className="font-label-md text-label-md text-on-surface-variant">
            Administración / Contingencias
          </span>
          <h1 className="font-headline-lg text-headline-lg text-primary tracking-tight">
            Gestión de Contingencias
          </h1>
          <p className="font-body-md text-body-md text-on-surface-variant">
            Vuelos cancelados y reprogramación operativa de pasajeros afectados (US-12A / US-12B)
          </p>
        </div>

        <Link
          href="/admin/itinerario"
          className="self-start sm:self-auto inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-surface-container text-primary hover:bg-surface-container-high font-semibold text-sm transition-colors"
        >
          <span className="material-symbols-outlined text-[18px]">calendar_today</span>
          Ver planilla del día
        </Link>
      </div>

      <section className="bg-surface-container-lowest rounded-xl p-6 shadow-md border border-surface-container-high flex flex-col gap-4">
        <h2 className="text-lg font-bold text-primary">
          Vuelos cancelados ({flightsWithStats.length})
        </h2>

        {flightsWithStats.length === 0 ? (
          <div className="p-8 text-center bg-surface-container-low rounded-xl text-on-surface-variant text-sm">
            <span className="material-symbols-outlined text-4xl text-outline mb-2 block">
              verified
            </span>
            <p className="font-semibold text-primary">No hay vuelos cancelados en el sistema.</p>
            <p className="text-xs text-on-surface-variant mt-1">
              Todos los vuelos operan con normalidad. Para cancelar un vuelo ante imprevistos, vaya a la planilla del día.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b-2 border-surface-container-high bg-surface text-xs uppercase text-outline font-semibold">
                  <th className="py-3 px-3">Vuelo</th>
                  <th className="py-3 px-3">Ruta</th>
                  <th className="py-3 px-3">Fecha y Hora</th>
                  <th className="py-3 px-3">Aeronave</th>
                  <th className="py-3 px-3">Motivo / Notas</th>
                  <th className="py-3 px-3 text-center">Pasajeros Afectados</th>
                  <th className="py-3 px-3 text-right">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-container">
                {flightsWithStats.map((f) => (
                  <tr key={f.id} className="hover:bg-surface-container-low transition-colors">
                    <td className="py-3 px-3 font-mono font-bold text-secondary">
                      {f.code}
                    </td>
                    <td className="py-3 px-3 font-medium">
                      {f.origin} → {f.destination}
                    </td>
                    <td className="py-3 px-3 font-mono text-xs text-primary">
                      {formatDayMonth(f.departureAt)} · {formatTime(f.departureAt)}
                    </td>
                    <td className="py-3 px-3 text-xs text-on-surface-variant">
                      {f.aircraftRegistration} ({f.aircraftModel})
                    </td>
                    <td className="py-3 px-3 text-xs">
                      <span className="inline-block px-2.5 py-0.5 rounded-full bg-red-100 text-red-800 font-semibold border border-red-200">
                        {f.notes || 'Cancelado'}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-center">
                      <div className="flex flex-col items-center">
                        <span className="font-bold text-primary">
                          {f.pendingPassengers} pendientes
                        </span>
                        <span className="text-[11px] text-on-surface-variant">
                          de {f.totalPassengers} en total
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-3 text-right">
                      <Link
                        href={`/admin/contingencias/${f.id}`}
                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-secondary hover:bg-secondary/90 text-white text-xs font-bold shadow-sm transition-all"
                      >
                        <span className="material-symbols-outlined text-[16px]">swap_horiz</span>
                        Reasignar
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
