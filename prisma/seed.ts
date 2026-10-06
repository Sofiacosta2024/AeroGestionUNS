/* eslint-disable no-console */
/**
 * Seed de AeroGestion UNS
 *
 * Carga los datos que estaban hardcodeados en login.html y vuelos.html para que
 * la interfaz muestre informacion real desde la base de datos.
 *
 * Es idempotente: se puede volver a ejecutar sin duplicar registros.
 *
 *   npm run db:seed
 */
import {
  PrismaClient,
  AircraftStatus,
  BookingStatus,
  CabinClass,
  DemandLevel,
  DocumentType,
  FlightStatus,
  PaymentMethod,
  PaymentStatus,
  SeatType,
  TripType,
  UserRole,
} from '@prisma/client';
import { localDayRangeUtc } from '../src/lib/dates';

const prisma = new PrismaClient();

/** Dias hacia adelante (desde hoy) con vuelos generados. */
const DAYS_AHEAD = 14;

/** yyyy-mm-dd (ART) de hoy + n dias. */
const ymdFromToday = (n: number) =>
  new Date(Date.now() - 3 * 3_600_000 + n * 86_400_000).toISOString().slice(0, 10);

/** Instante UTC de una hora de tablero (ART) del dia local `dateStr`. */
const utc = (dateStr: string, hour: number, minute: number) =>
  new Date(localDayRangeUtc(dateStr).start.getTime() + (hour * 60 + minute) * 60_000);

/** Columna @db.Date: medianoche UTC del dia. */
const dayOnly = (dateStr: string) => new Date(`${dateStr}T00:00:00Z`);

const weekdayOf = (dateStr: string) => new Date(`${dateStr}T12:00:00Z`).getUTCDay();

/** Factor de precio por dia de la semana (dom a sab): viernes y domingo mas caros. */
const DAY_FACTOR = [1.12, 1.0, 1.0, 1.02, 1.08, 1.22, 1.1];
const priced = (base: number, dateStr: string) =>
  Math.round((base * DAY_FACTOR[weekdayOf(dateStr)]!) / 100) * 100;


async function main() {
  console.log('> Seed AeroGestion UNS');

  // -------------------------------------------------------------------------
  // 1. Aeropuertos
  // -------------------------------------------------------------------------
  const airports = [
    {
      iataCode: 'BHI',
      name: 'Aeropuerto Comandante Espora',
      city: 'Bahia Blanca',
      province: 'Buenos Aires',
      timezone: 'America/Argentina/Buenos_Aires',
      latitude: -38.816,
      longitude: -62.323,
    },
    {
      iataCode: 'AEP',
      name: 'Aeroparque Jorge Newbery',
      city: 'Ciudad Autonoma de Buenos Aires',
      province: 'Buenos Aires',
      timezone: 'America/Argentina/Buenos_Aires',
      latitude: -34.559,
      longitude: -58.416,
    },
    {
      iataCode: 'EZE',
      name: 'Aeropuerto Internacional Ministro Pistarini',
      city: 'Ezeiza',
      province: 'Buenos Aires',
      timezone: 'America/Argentina/Buenos_Aires',
      latitude: -34.822,
      longitude: -58.536,
    },
    {
      iataCode: 'MDZ',
      name: 'Aeropuerto Internacional El Plumerillo',
      city: 'Mendoza',
      province: 'Mendoza',
      timezone: 'America/Argentina/Mendoza',
      latitude: -32.828,
      longitude: -68.793,
    },
    {
      iataCode: 'COR',
      name: 'Aeropuerto Internacional Ambrosio Taravella',
      city: 'Cordoba',
      province: 'Cordoba',
      timezone: 'America/Argentina/Cordoba',
      latitude: -31.323,
      longitude: -64.209,
    },
  ];

  for (const a of airports) {
    await prisma.airport.upsert({
      where: { iataCode: a.iataCode },
      update: a,
      create: a,
    });
  }
  console.log(`  ${airports.length} aeropuertos`);

  // -------------------------------------------------------------------------
  // 2. Tarifas (catalogo)
  //
  // RF-01: cada tarifa activa es una clase. `cabinClass` es la cabina fisica donde se
  // sienta el pasajero: Economy y Economy Premium comparten la cabina ECONOMY y
  // Primera Clase tiene la suya (FIRST).
  // -------------------------------------------------------------------------
  const fares = [
    {
      code: 'ECON-FLEX',
      name: 'Economy Premium',
      cabinClass: CabinClass.ECONOMY,
      basePrice: 64200,
      // Pendiente: kg de carry-on y de bodega de Economy Premium (aun sin definir).
      carryOnKg: 8,
      checkedBagKg: 0,
      changeAllowed: true,
      seatSelection: true,
      refundable: false,
      benefits: [
        'luggage|Carry-on + valija en bodega',
        'airline_seat_recline_extra|Eleccion de asiento sin cargo',
        'event|Cambio sin penalidad',
      ],
    },
    {
      code: 'UNS-CORP',
      name: 'Primera Clase',
      cabinClass: CabinClass.FIRST,
      basePrice: 138000,
      carryOnKg: 10,
      checkedBagKg: 23,
      changeAllowed: true,
      seatSelection: true,
      refundable: true,
      benefits: ['file_download_done|Bodega 23kg + Carry-on', 'airline_seat_recline_extra|Seleccion de Asiento VIP'],
    },
    {
      code: 'ECON-BASIC',
      name: 'Economy',
      cabinClass: CabinClass.ECONOMY,
      basePrice: 52900,
      // Solo mochila u objeto personal; elegir asiento tiene cargo (lo cobra el flujo de compra).
      carryOnKg: 0,
      checkedBagKg: 0,
      changeAllowed: false,
      seatSelection: false,
      refundable: false,
      benefits: ['backpack|Solo mochila u objeto personal'],
      isActive: true,
    },
  ];

  for (const f of fares) {
    await prisma.fare.upsert({ where: { code: f.code }, update: f, create: f });
  }
  const econFlex = await prisma.fare.findUniqueOrThrow({ where: { code: 'ECON-FLEX' } });
  const unsCorp = await prisma.fare.findUniqueOrThrow({ where: { code: 'UNS-CORP' } });
  console.log(`  ${fares.length} tarifas`);

  // -------------------------------------------------------------------------
  // 3. Flota (aeronaves + mapa de asientos)
  // -------------------------------------------------------------------------
  const fleet = [
    {
      registration: 'LV-CKU',
      model: 'Boeing 737-800',
      manufacturer: 'Boeing',
      seatCount: 150,
      layout: '3-3 sin asiento al medio',
      hasWifi: true,
      hasUsbPower: true,
      punctualityPct: 98,
      wifiLabel: 'Wi-Fi & USB Power',
      wifiIcon: 'wifi',
    },
    {
      registration: 'LV-FPS',
      model: 'Embraer E190',
      manufacturer: 'Embraer',
      // 28 filas x 4 asientos: coincide con el mapa que se genera abajo.
      seatCount: 112,
      layout: '2-2 sin asiento al medio',
      hasWifi: false,
      hasUsbPower: true,
      punctualityPct: 96,
      wifiLabel: null,
      wifiIcon: null,
    },
    {
      registration: 'LV-GGQ',
      model: 'Boeing 737-800',
      manufacturer: 'Boeing',
      seatCount: 150,
      layout: '3-3',
      hasWifi: true,
      hasUsbPower: false,
      punctualityPct: 99,
      wifiLabel: null,
      wifiIcon: null,
    },
  ];

  const aircraftByReg = new Map<string, string>();
  for (const ac of fleet) {
    const aircraft = await prisma.aircraft.upsert({
      where: { registration: ac.registration },
      update: {
        model: ac.model,
        manufacturer: ac.manufacturer,
        seatCount: ac.seatCount,
        layout: ac.layout,
        hasWifi: ac.hasWifi,
        hasUsbPower: ac.hasUsbPower,
        status: AircraftStatus.ACTIVE,
        baseAirportId: 'BHI',
      },
      create: {
        registration: ac.registration,
        model: ac.model,
        manufacturer: ac.manufacturer,
        seatCount: ac.seatCount,
        layout: ac.layout,
        hasWifi: ac.hasWifi,
        hasUsbPower: ac.hasUsbPower,
        status: AircraftStatus.ACTIVE,
        baseAirportId: 'BHI',
      },
    });
    aircraftByReg.set(ac.registration, aircraft.id);

    // Mapa de asientos: filas con el layout de la aeronave.
    const rows = Math.floor(ac.seatCount / (ac.layout.startsWith('2-2') ? 4 : 6));
    const columns = ac.layout.startsWith('2-2') ? ['A', 'C', 'D', 'F'] : ['A', 'B', 'C', 'D', 'E', 'F'];
    const seats: {
      aircraftId: string;
      rowNumber: number;
      columnLetter: string;
      cabinClass: CabinClass;
      type: SeatType;
      isExitRow: boolean;
    }[] = [];
    for (let r = 1; r <= rows; r++) {
      for (const col of columns) {
        const isFirstClass = r === 1;
        seats.push({
          aircraftId: aircraft.id,
          rowNumber: r,
          columnLetter: col,
          cabinClass: isFirstClass ? CabinClass.FIRST : CabinClass.ECONOMY,
          type: col === columns[0] || col === columns[columns.length - 1] ? SeatType.WINDOW : SeatType.AISLE,
          isExitRow: r === rows,
        });
      }
    }
    await prisma.seat.createMany({ data: seats, skipDuplicates: true });
  }
  console.log(`  ${fleet.length} aeronaves + mapas de asientos`);

  // -------------------------------------------------------------------------
  // 4. Rutas
  // -------------------------------------------------------------------------
  const routes = [
    { code: 'BHI-AEP', originAirportId: 'BHI', destinationAirportId: 'AEP', distanceKm: 611, durationMinutes: 70, isActive: true },
    { code: 'BHI-EZE', originAirportId: 'BHI', destinationAirportId: 'EZE', distanceKm: 633, durationMinutes: 75, isActive: true },
    { code: 'AEP-BHI', originAirportId: 'AEP', destinationAirportId: 'BHI', distanceKm: 611, durationMinutes: 70, isActive: true },
    { code: 'BHI-MDZ', originAirportId: 'BHI', destinationAirportId: 'MDZ', distanceKm: 876, durationMinutes: 105, isActive: true },
    { code: 'BHI-COR', originAirportId: 'BHI', destinationAirportId: 'COR', distanceKm: 843, durationMinutes: 100, isActive: true },
  ];

  for (const r of routes) {
    await prisma.route.upsert({ where: { code: r.code }, update: r, create: r });
  }
  const bhiAep = await prisma.route.findUniqueOrThrow({ where: { code: 'BHI-AEP' } });
  console.log(`  ${routes.length} rutas`);

  // -------------------------------------------------------------------------
  // 5. Vuelos comerciales (los 3 servicios que muestra el HTML + extras)
  // -------------------------------------------------------------------------
  const routeByCode = new Map((await prisma.route.findMany()).map((r) => [r.code, r] as const));

// Capacidad fisica por cabina, compartida con las reglas de RF-01.
const seatTotals = await prisma.seat.groupBy({
  by: ['aircraftId', 'cabinClass'],
  _count: { _all: true },
});
const seatsIn = (aircraftId: string, cabinClass: CabinClass) =>
  seatTotals.find((seat) => seat.aircraftId === aircraftId && seat.cabinClass === cabinClass)?._count._all ?? 0;

// `every`: se genera un vuelo cada N dias, asi hay dias sin oferta para probar "sin resultados".
// (No se modela la rotacion real de las aeronaves: solo que no se pisen en el mismo horario.)
const SLOTS = [
  { route: 'BHI-AEP', reg: 'LV-CKU', h: 6,  m: 45, flex: 64200, corp: 138000, punct: 98, every: 1 },
  { route: 'BHI-AEP', reg: 'LV-FPS', h: 13, m: 20, flex: 68400, corp: 142000, punct: 96, every: 1 },
  { route: 'BHI-AEP', reg: 'LV-GGQ', h: 19, m: 15, flex: 64200, corp: 138000, punct: 99, every: 1 },
  { route: 'AEP-BHI', reg: 'LV-CKU', h: 9,  m: 30, flex: 64200, corp: 138000, punct: 97, every: 1 },
  { route: 'AEP-BHI', reg: 'LV-FPS', h: 17, m: 10, flex: 68400, corp: 142000, punct: 96, every: 1 },
  { route: 'BHI-EZE', reg: 'LV-GGQ', h: 10, m: 0,  flex: 66800, corp: 140000, punct: 95, every: 2 },
  { route: 'BHI-MDZ', reg: 'LV-FPS', h: 8,  m: 30, flex: 88500, corp: 171000, punct: 94, every: 3 },
  { route: 'BHI-COR', reg: 'LV-CKU', h: 15, m: 45, flex: 84200, corp: 165000, punct: 95, every: 3 },
];

let flightCount = 0;
for (let d = 0; d < DAYS_AHEAD; d++) {
  const dateStr = ymdFromToday(d);
  const weekday = weekdayOf(dateStr);

  for (const [i, s] of SLOTS.entries()) {
    if (d % s.every !== 0) continue;

    const route = routeByCode.get(s.route)!;
    const aircraftId = aircraftByReg.get(s.reg)!;
    const code = `AG-${dateStr.slice(5).replace('-', '')}${String.fromCharCode(65 + i)}`;
    const departureAt = utc(dateStr, s.h, s.m);
    const arrivalAt = new Date(departureAt.getTime() + (route.durationMinutes ?? 70) * 60_000);

    const data = {
      routeId: route.id,
      aircraftId,
      departureAt,
      arrivalAt,
      punctualityPct: s.punct,
      tags: ['Directo'],
      status: FlightStatus.SCHEDULED,
    };
    const flight = await prisma.flight.upsert({
      where: { code },
      update: data,
      create: { code, isDirect: true, ...data },
    });

    // Los viernes la salida de las 19:15 queda con pocos lugares (prueba del filtro de pasajeros)
    const flexCapacity = Math.min(132, seatsIn(aircraftId, CabinClass.ECONOMY));
    const corpSeats = Math.min(12, seatsIn(aircraftId, CabinClass.FIRST));
    const flexSeats = weekday === 5 && s.h === 19 ? Math.min(3, flexCapacity) : flexCapacity;
    const flexPrice = priced(s.flex, dateStr);
    const corpPrice = priced(s.corp, dateStr);

    await prisma.flightFare.upsert({
      where: { flightId_fareId: { flightId: flight.id, fareId: econFlex.id } },
      update: { price: flexPrice, availableSeats: flexSeats, seatCapacity: flexCapacity },
      create: { flightId: flight.id, fareId: econFlex.id, price: flexPrice, availableSeats: flexSeats, seatCapacity: flexCapacity },
    });
    await prisma.flightFare.upsert({
      where: { flightId_fareId: { flightId: flight.id, fareId: unsCorp.id } },
      update: { price: corpPrice, availableSeats: corpSeats, seatCapacity: corpSeats },
      create: { flightId: flight.id, fareId: unsCorp.id, price: corpPrice, availableSeats: corpSeats, seatCapacity: corpSeats },
    });
    flightCount++;
  }
}
console.log(`  ${flightCount} vuelos con tarifas (proximos ${DAYS_AHEAD} dias)`);
  // -------------------------------------------------------------------------
  // 6. Calendario semanal de tarifas (Dom 16 -> Sab 22 nov)
  // -------------------------------------------------------------------------
  const WEEKLY_BASE: Record<string, number> = {
  'BHI-AEP': 64200, 'AEP-BHI': 64200, 'BHI-EZE': 66800, 'BHI-MDZ': 88500, 'BHI-COR': 84200,
};
const weeklyRows = [];
for (const [code, base] of Object.entries(WEEKLY_BASE)) {
  const route = routeByCode.get(code)!;
  for (let d = -7; d < DAYS_AHEAD + 7; d++) {
    const dateStr = ymdFromToday(d);
    weeklyRows.push({
      routeId: route.id,
      date: dayOnly(dateStr),
      price: priced(base, dateStr),
      demandLevel: DAY_FACTOR[weekdayOf(dateStr)]! >= 1.15 ? DemandLevel.HIGH : DemandLevel.NORMAL,
    });
  }
}
await prisma.weeklyFare.createMany({ data: weeklyRows, skipDuplicates: true });
console.log(`  ${weeklyRows.length} tarifas semanales (calendario)`);

  // -------------------------------------------------------------------------
  // 7. Usuarios de los 3 perfiles del login + pasajero asociado
  // -------------------------------------------------------------------------
  const users = [
    {
      email: 'pasajero@uns.edu.ar',
      role: UserRole.PASAJERO,
      firstName: 'Lucia',
      lastName: 'Fernandez',
      legajo: 'UNS-2025-4417',
      passenger: {
        firstName: 'Lucia',
        lastName: 'Fernandez',
        documentType: DocumentType.DNI,
        documentNumber: '40123456',
        birthDate: new Date(Date.UTC(1998, 4, 12)),
        nationality: 'Argentina',
      },
    },
    {
      email: 'mostrador@uns.edu.ar',
      role: UserRole.MOSTRADOR,
      firstName: 'Diego',
      lastName: 'Marquez',
      legajo: 'UNS-LEJ-0088',
      passenger: null,
    },
    {
      email: 'admin@uns.edu.ar',
      role: UserRole.ADMIN,
      firstName: 'Ana',
      lastName: 'Rios',
      legajo: 'UNS-LEJ-0001',
      passenger: null,
    },
  ];

  const userByEmail = new Map<string, string>();
  for (const u of users) {
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: { role: u.role, isActive: true },
      create: {
        email: u.email,
        role: u.role,
        legajo: u.legajo,
        firstName: u.firstName,
        lastName: u.lastName,
        phone: '+54 291 400-0000',
      },
    });
    userByEmail.set(u.email, user.id);
    if (u.passenger) {
      await prisma.passenger.upsert({
        where: {
          documentType_documentNumber: {
            documentType: u.passenger.documentType,
            documentNumber: u.passenger.documentNumber,
          },
        },
        update: { userId: user.id, ...u.passenger },
        create: { userId: user.id, ...u.passenger },
      });
    }
  }

  console.log(` ${users.length} usuarios (sin contraseña: el acceso es por Clerk)`);

  // -------------------------------------------------------------------------
  // 8. Reserva de ejemplo con pasajero, pago y pase de abordaje
  // -------------------------------------------------------------------------
  const demoFlight = await prisma.flight.findFirstOrThrow({
    where: { routeId: bhiAep.id, departureAt: { gte: new Date() } },
    orderBy: { departureAt: 'asc' },
  });  

  const [seat1420, seat1420b] = await prisma.seat.findMany({
    where: { aircraftId: demoFlight.aircraftId, rowNumber: 12 },
    orderBy: { columnLetter: 'asc' },
    take: 2,
  });
  if (!seat1420 || !seat1420b) {
    throw new Error('El avion del vuelo demo no tiene la fila 12');
  }

  const existing = await prisma.booking.findUnique({ where: { bookingCode: 'AG-DEMO01' } });
  if (!existing) {
    const price = 64200;
    await prisma.booking.create({
      data: {
        bookingCode: 'AG-DEMO01',
        userId: userByEmail.get('pasajero@uns.edu.ar'),
        tripType: TripType.ROUND_TRIP,
        status: BookingStatus.CONFIRMED,
        passengersCount: 2,
        cabinClass: CabinClass.ECONOMY,
        totalAmount: price * 2,
        contactEmail: 'pasajero@uns.edu.ar',
        flights: {
          create: [
            {
              flightId: demoFlight.id,
              fareId: econFlex.id,
              price,
              isReturn: false,
              departureAt: demoFlight.departureAt,
            },
          ],
        },
        passengers: {
          create: [
            {
              firstName: 'Lucia',
              lastName: 'Fernandez',
              documentType: DocumentType.DNI,
              documentNumber: '40123456',
              seatId: seat1420.id,
              checkInCode: 'CK7F3K9Q',
              checkInStatus: 'OPEN',
              boardingPass: {
                create: {
                  code: 'BP-7F3K9Q-LF',
                  seatId: seat1420.id,
                  flightCode: demoFlight.code,
                },
              },
              baggage: {
                create: [{ tagCode: '0012345678', type: 'HOLD', weightKg: 12 }],
              },
            },
            {
              firstName: 'Martin',
              lastName: 'Fernandez',
              documentType: DocumentType.DNI,
              documentNumber: '39111222',
              seatId: seat1420b.id,
              checkInCode: 'CK7F3K9R',
              checkInStatus: 'OPEN',
              boardingPass: {
                create: {
                  code: 'BP-7F3K9Q-MF',
                  seatId: seat1420b.id,
                  flightCode: demoFlight.code,
                },
              },
              baggage: {
                create: [{ tagCode: '0012345679', type: 'HOLD', weightKg: 9 }],
              },
            },
          ],
        },
        payments: {
          create: [
            {
              method: PaymentMethod.CREDIT_CARD,
              amount: price * 2,
              status: PaymentStatus.APPROVED,
              transactionRef: 'SEED-TXN-0001',
              paidAt: new Date(),
            },
          ],
        },
      },
    });
    console.log('  1 reserva de ejemplo (AG-DEMO01)');
  }

  // La reserva se creo sin butaca para el segundo pasajero en versiones previas
  // del seed: se completa para que la demo sea coherente (2 pasajeros, 2 butacas).
  const demo = await prisma.booking.findUnique({
    where: { bookingCode: 'AG-DEMO01' },
    include: { passengers: true },
  });
  if (demo) {
    const seats = [seat1420, seat1420b];
    for (const [i, bp] of demo.passengers.entries()) {
      if (bp.seatId || !seats[i]) continue;
      await prisma.bookingPassenger.update({
        where: { id: bp.id },
        data: { seatId: seats[i].id, checkInCode: 'CK7F3K9R', checkInStatus: 'OPEN' },
      });
      await prisma.boardingPass.upsert({
        where: { bookingPassengerId: bp.id },
        update: { seatId: seats[i].id },
        create: {
          code: 'BP-7F3K9Q-MF',
          bookingPassengerId: bp.id,
          seatId: seats[i].id,
          flightCode: demoFlight.code,
        },
      });
      console.log('  reserva de ejemplo: butaca y pase completados');
    }
  }

  console.log('> Seed completado');
}

main()
  .catch((e) => {
    console.error('> Seed fallido:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
