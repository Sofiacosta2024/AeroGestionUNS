import type { FlightWithRelations, SerializedPrice } from './flights';

/**
 * Formas de datos que cruzan el limite Server -> Client.
 *
 * Se projectionan aca (y no pasando el resultado crudo de Prisma) para no
 * enviarle al navegador objetos `Decimal` ni entidades completas: el cliente
 * solo recibe exactamente los campos que la interfaz necesita.
 */

export type AirportOption = {
  iataCode: string;
  city: string;
  name: string;
};

export type RouteOption = {
  id: string;
  code: string;
  origin: string;
  destination: string;
  originCity: string;
  destinationCity: string;
  originName: string;
  destinationName: string;
  durationMinutes: number | null;
};

export type FlightCardData = {
  id: string;
  code: string;
  /** ISO 8601 en UTC. La interfaz lo muestra en ART. */
  departureAt: string;
  arrivalAt: string;
  status: string;
  isDirect: boolean;
  punctualityPct: number | null;
  tags: string[];
  route: {
    id: string;
    code: string;
    durationMinutes: number | null;
    originAirport: AirportOption;
    destinationAirport: AirportOption;
  };
  aircraft: {
    id: string;
    registration: string;
    model: string;
    manufacturer: string;
    layout: string | null;
    hasWifi: boolean;
    hasUsbPower: boolean;
  };
  prices: SerializedPrice[];
};

export type WeeklyFareDay = {
  id: string;
  /** yyyy-mm-dd */
  date: string;
  price: number;
  demandLevel: string;
  currency: string;
};

export type VuelosBootstrap = {
  airports: AirportOption[];
  routes: RouteOption[];
  initialQuery: {
    origin: string;
    destination: string;
    date: string;
    returnDate: string;
    passengers: number;
    routeId: string | null;
  };
  initialFlights: FlightCardData[];
  initialWeeklyFares: WeeklyFareDay[];
  user: { name: string; email: string; role: string } | null;
};

export function toAirportOption(a: {
  iataCode: string;
  city: string;
  name: string;
}): AirportOption {
  return { iataCode: a.iataCode, city: a.city, name: a.name };
}

export function toFlightCard(f: FlightWithRelations): FlightCardData {
  return {
    id: f.id,
    code: f.code,
    departureAt: new Date(f.departureAt).toISOString(),
    arrivalAt: new Date(f.arrivalAt).toISOString(),
    status: f.status,
    isDirect: f.isDirect,
    punctualityPct: f.punctualityPct === null ? null : Number(f.punctualityPct),
    tags: f.tags,
    route: {
      id: f.route.id,
      code: f.route.code,
      durationMinutes: f.route.durationMinutes,
      originAirport: toAirportOption(f.route.originAirport),
      destinationAirport: toAirportOption(f.route.destinationAirport),
    },
    aircraft: {
      id: f.aircraft.id,
      registration: f.aircraft.registration,
      model: f.aircraft.model,
      manufacturer: f.aircraft.manufacturer,
      layout: f.aircraft.layout,
      hasWifi: f.aircraft.hasWifi,
      hasUsbPower: f.aircraft.hasUsbPower,
    },
    prices: serializePrices(f),
  };
}

function serializePrices(f: FlightWithRelations): SerializedPrice[] {
  return f.fares
    .filter((ff) => ff.fare.isActive)
    .map((ff) => ({
      id: ff.fare.id,
      code: ff.fare.code,
      name: ff.fare.name,
      cabinClass: ff.fare.cabinClass,
      price: Number(ff.price),
      currency: ff.currency,
      availableSeats: ff.availableSeats,
      carryOnKg: ff.fare.carryOnKg,
      checkedBagKg: ff.fare.checkedBagKg,
      benefits: ff.fare.benefits,
      changeAllowed: ff.fare.changeAllowed,
      seatSelection: ff.fare.seatSelection,
      refundable: ff.fare.refundable,
    }));
}
