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
import bcrypt from 'bcryptjs';
import { localDayRangeUtc } from '../src/lib/dates';

const prisma = new PrismaClient();

/** Fecha base de las operaciones: el HTML original muestra "Mar 18 Nov 2025". */
const BASE_YEAR = 2025;
const BASE_MONTH = 10; // noviembre (indice 0-based)

const ymd = (day: number) =>
  `${BASE_YEAR}-${String(BASE_MONTH + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

/**
 * Instante UTC de una hora de la OPERACION (ART, UTC-3).
 *
 * Los horarios del seed son horarios de tablero: `utc(18, 6, 45)` debe seguir
 * mostrandose como 06:45 en la interfaz, que formatea en ART. Se reutiliza la
 * misma conversion que los filtros de la API para que no se desalineen.
 */
const utc = (day: number, hour: number, minute: number) => {
  const midnight = Date.UTC(BASE_YEAR, BASE_MONTH, day);
  const offsetMs = localDayRangeUtc(ymd(day)).start.getTime() - midnight;
  return new Date(Date.UTC(BASE_YEAR, BASE_MONTH, day, hour, minute) + offsetMs);
};

const dayOnly = (day: number) => new Date(Date.UTC(BASE_YEAR, BASE_MONTH, day));

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
  // -------------------------------------------------------------------------
  const fares = [
    {
      code: 'ECON-FLEX',
      name: 'Economy Flex',
      cabinClass: CabinClass.ECONOMY,
      basePrice: 64200,
      carryOnKg: 8,
      checkedBagKg: 0,
      changeAllowed: true,
      seatSelection: false,
      refundable: false,
      benefits: [
        'luggage|Equipaje de mano 8kg',
        'event|Cambio sin penalidad',
      ],
    },
    {
      code: 'UNS-CORP',
      name: 'UNS Corporativo',
      cabinClass: CabinClass.BUSINESS,
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
      name: 'Economy Basica',
      cabinClass: CabinClass.ECONOMY,
      basePrice: 52900,
      carryOnKg: 7,
      checkedBagKg: 0,
      changeAllowed: false,
      seatSelection: false,
      refundable: false,
      benefits: ['luggage|Equipaje de mano 7kg'],
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
      seatCount: 114,
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
        const isBusiness = r === 1;
        seats.push({
          aircraftId: aircraft.id,
          rowNumber: r,
          columnLetter: col,
          cabinClass: isBusiness ? CabinClass.BUSINESS : CabinClass.ECONOMY,
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
  const flightSeeds = [
    {
      code: 'AG-1420',
      routeId: bhiAep.id,
      registration: 'LV-CKU',
      departureAt: utc(18, 6, 45),
      arrivalAt: utc(18, 7, 55),
      punctualityPct: 98,
      tags: ['Directo'],
      notes: 'Salida a primera hora con conexion inmediata en AEP.',
      wifiLabel: 'Wi-Fi & USB Power',
      wifiIcon: 'wifi',
      prices: { flex: 64200, corp: 138000 },
    },
    {
      code: 'AG-1428',
      routeId: bhiAep.id,
      registration: 'LV-FPS',
      departureAt: utc(18, 13, 20),
      arrivalAt: utc(18, 14, 30),
      punctualityPct: 96,
      tags: ['Directo'],
      notes: null,
      wifiLabel: null,
      wifiIcon: null,
      prices: { flex: 68400, corp: 142000 },
    },
    {
      code: 'AG-1436',
      routeId: bhiAep.id,
      registration: 'LV-GGQ',
      departureAt: utc(18, 19, 15),
      arrivalAt: utc(18, 20, 25),
      punctualityPct: 99,
      tags: ['Directo'],
      notes: null,
      wifiLabel: null,
      wifiIcon: null,
      prices: { flex: 64200, corp: 138000 },
    },
    // Vueltos de la semana, para que el buscador tenga oferta en cada dia
    {
      code: 'AG-1421',
      routeId: bhiAep.id,
      registration: 'LV-CKU',
      departureAt: utc(24, 10, 0),
      arrivalAt: utc(24, 11, 10),
      punctualityPct: 97,
      tags: ['Directo'],
      notes: null,
      wifiLabel: null,
      wifiIcon: null,
      prices: { flex: 68900, corp: 139000 },
    },
    {
      code: 'AG-1425',
      routeId: bhiAep.id,
      registration: 'LV-FPS',
      departureAt: utc(19, 9, 15),
      arrivalAt: utc(19, 10, 25),
      punctualityPct: 96,
      tags: ['Directo'],
      notes: null,
      wifiLabel: null,
      wifiIcon: null,
      prices: { flex: 65400, corp: 138500 },
    },
  ];

  for (const f of flightSeeds) {
    const aircraftId = aircraftByReg.get(f.registration)!;
    const flight = await prisma.flight.upsert({
      where: { code: f.code },
      update: {
        routeId: f.routeId,
        aircraftId,
        departureAt: f.departureAt,
        arrivalAt: f.arrivalAt,
        punctualityPct: f.punctualityPct,
        tags: f.tags,
        notes: f.notes,
        status: FlightStatus.SCHEDULED,
      },
      create: {
        code: f.code,
        routeId: f.routeId,
        aircraftId,
        departureAt: f.departureAt,
        arrivalAt: f.arrivalAt,
        isDirect: true,
        punctualityPct: f.punctualityPct,
        tags: f.tags,
        notes: f.notes,
        status: FlightStatus.SCHEDULED,
      },
    });

    await prisma.flightFare.upsert({
      where: { flightId_fareId: { flightId: flight.id, fareId: econFlex.id } },
      update: { price: f.prices.flex, availableSeats: 132 },
      create: { flightId: flight.id, fareId: econFlex.id, price: f.prices.flex, availableSeats: 132 },
    });
    await prisma.flightFare.upsert({
      where: { flightId_fareId: { flightId: flight.id, fareId: unsCorp.id } },
      update: { price: f.prices.corp, availableSeats: 12 },
      create: { flightId: flight.id, fareId: unsCorp.id, price: f.prices.corp, availableSeats: 12 },
    });

    // Amenidades por vuelo -> tags que usa la tarjeta del HTML
    if (f.wifiIcon) {
      await prisma.flight.update({
        where: { id: flight.id },
        data: { tags: [...f.tags, `${f.wifiIcon}|${f.wifiLabel}`] },
      });
    }
  }
  console.log(`  ${flightSeeds.length} vuelos con tarifas`);

  // -------------------------------------------------------------------------
  // 6. Calendario semanal de tarifas (Dom 16 -> Sab 22 nov)
  // -------------------------------------------------------------------------
  const weekly = [
    { day: 16, price: 72500, demandLevel: DemandLevel.NORMAL },
    { day: 17, price: 68900, demandLevel: DemandLevel.NORMAL },
    { day: 18, price: 64200, demandLevel: DemandLevel.NORMAL },
    { day: 19, price: 65400, demandLevel: DemandLevel.NORMAL },
    { day: 20, price: 69800, demandLevel: DemandLevel.NORMAL },
    { day: 21, price: 78200, demandLevel: DemandLevel.HIGH },
    { day: 22, price: 71100, demandLevel: DemandLevel.NORMAL },
  ];
  for (const w of weekly) {
    const date = dayOnly(w.day);
    await prisma.weeklyFare.upsert({
      where: { routeId_date: { routeId: bhiAep.id, date } },
      update: { price: w.price, demandLevel: w.demandLevel },
      create: { routeId: bhiAep.id, date, price: w.price, demandLevel: w.demandLevel },
    });
  }
  console.log(`  ${weekly.length} tarifas semanales (calendario)`);

  // -------------------------------------------------------------------------
  // 7. Usuarios de los 3 perfiles del login + pasajero asociado
  // -------------------------------------------------------------------------
  const hash = await bcrypt.hash('AeroGestion2025!', 12);

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
      update: { passwordHash: hash, role: u.role, isActive: true },
      create: {
        email: u.email,
        passwordHash: hash,
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
  console.log(`  ${users.length} usuarios (password: AeroGestion2025!)`);

  // -------------------------------------------------------------------------
  // 8. Reserva de ejemplo con pasajero, pago y pase de abordaje
  // -------------------------------------------------------------------------
  const flight1420 = await prisma.flight.findUniqueOrThrow({ where: { code: 'AG-1420' } });
  const seat1420 = await prisma.seat.findFirstOrThrow({
    where: { aircraftId: flight1420.aircraftId, rowNumber: 12, columnLetter: 'A' },
  });
  const seat1420b = await prisma.seat.findFirstOrThrow({
    where: { aircraftId: flight1420.aircraftId, rowNumber: 12, columnLetter: 'B' },
  });

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
              flightId: flight1420.id,
              fareId: econFlex.id,
              price,
              isReturn: false,
              departureAt: flight1420.departureAt,
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
                  flightCode: flight1420.code,
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
                  flightCode: flight1420.code,
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
          flightCode: flight1420.code,
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
