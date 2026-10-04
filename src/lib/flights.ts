import type { FlightStatus, Prisma } from '@prisma/client';

export const flightInclude = {
  route: { include: { originAirport: true, destinationAirport: true } },
  aircraft: {
    select: {
      id: true,
      registration: true,
      model: true,
      manufacturer: true,
      layout: true,
      hasWifi: true,
      hasUsbPower: true,
    },
  },
  fares: { include: { fare: true }, orderBy: { price: 'asc' as const } },
} satisfies Prisma.FlightInclude;

export type FlightWithRelations = Prisma.FlightGetPayload<{ include: typeof flightInclude }>;

export type SerializedPrice = {
  id: string;
  code: string;
  name: string;
  cabinClass: string;
  price: number;
  currency: string;
  availableSeats: number;
  carryOnKg: number;
  checkedBagKg: number;
  benefits: string[];
  changeAllowed: boolean;
  seatSelection: boolean;
  refundable: boolean;
};

/**
 * Normaliza los Decimal de Prisma a number y arma `prices`, que es lo que las
 * tarjetas de vuelo de la interfaz consumen directamente.
 */
export const BOOKABLE_STATUSES: FlightStatus[] = ['SCHEDULED', 'BOARDING', 'DELAYED'];

export function serializeFlight(flight: FlightWithRelations, minSeats = 0) {
  const prices: SerializedPrice[] = flight.fares
    .filter((f) => f.fare.isActive && f.availableSeats >= minSeats)
    .map((f) => ({
      id: f.fare.id,
      code: f.fare.code,
      name: f.fare.name,
      cabinClass: f.fare.cabinClass,
      price: Number(f.price),
      currency: f.currency,
      availableSeats: f.availableSeats,
      carryOnKg: f.fare.carryOnKg,
      checkedBagKg: f.fare.checkedBagKg,
      benefits: f.fare.benefits,
      changeAllowed: f.fare.changeAllowed,
      seatSelection: f.fare.seatSelection,
      refundable: f.fare.refundable,
    }));

  return {
    ...flight,
    punctualityPct:
      flight.punctualityPct === null ? null : Number(flight.punctualityPct),
    fares: undefined,
    prices,
  };
}
