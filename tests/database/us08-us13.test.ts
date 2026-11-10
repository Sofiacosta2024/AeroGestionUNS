import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Prisma, type CabinClass, type PrismaClient } from '@prisma/client';
import { prisma as db } from '../../src/lib/prisma';
import { createCounterSale, quoteCounterSale } from '../../src/lib/mostrador/service';
import type { AuthUser } from '../../src/lib/auth';
import type { CounterSaleInput } from '../../src/lib/mostrador/types';
import { lockSeatsAtomic, releaseExpiredSeatLocks } from '../../src/lib/seat-locks';
import { processReceiptDispatch } from '../../src/lib/email/processor';
import { receiptSnapshotSchema } from '../../src/lib/email/types';
import { settlePayment } from '../../src/lib/payment-service';
import { paymentSchema } from '../../src/lib/validation';

const schema = process.env.US08_TEST_SCHEMA;
if (!schema || !/^codex_us08_test_[a-f0-9]{32}$/.test(schema) || new URL(process.env.DATABASE_URL!).searchParams.get('schema') !== schema)
  throw new Error('Ejecutar sólo mediante npm run test:db:receipts (namespace aislado)');
let operator: AuthUser;
before(async () => {
  operator = await db.user.create({ data: { email: 'operator@example.com', firstName: 'Manu', lastName: 'Tina', role: 'MOSTRADOR' } });
  await db.airport.createMany({ data: [{ iataCode: 'BHI', name: 'BHI', city: 'Bahía Blanca' }, { iataCode: 'AEP', name: 'AEP', city: 'Buenos Aires' }] });
});
after(async () => { await db.$disconnect(); });
let seq = 0;
async function flight(capacity = 2, cabin: CabinClass = 'ECONOMY', premium = false) {
  seq++;
  const route = await db.route.upsert({ where: { originAirportId_destinationAirportId: { originAirportId: 'BHI', destinationAirportId: 'AEP' } },
    create: { code: 'BHI-AEP', originAirportId: 'BHI', destinationAirportId: 'AEP', durationMinutes: 60 }, update: {} });
  const aircraft = await db.aircraft.create({ data: { registration: `TEST-${seq}`, model: 'Test', manufacturer: 'Test', seatCount: capacity,
    seats: { create: Array.from({ length: capacity }, (_, i) => ({ rowNumber: i + 1, columnLetter: 'A', cabinClass: cabin })) } }, include: { seats: { orderBy: { rowNumber: 'asc' } } } });
  const fare = await db.fare.create({ data: { code: premium ? 'ECON-FLEX' : `TEST-${seq}`, name: premium ? 'Economy Premium' : cabin,
    cabinClass: cabin, basePrice: 100, seatSelectionFee: premium || cabin !== 'ECONOMY' ? 0 : 20, seatSelection: premium || cabin !== 'ECONOMY' } });
  const f = await db.flight.create({ data: { code: `AG-${String(seq).padStart(4, '0')}`, routeId: route.id, aircraftId: aircraft.id,
    departureAt: new Date(Date.now() + seq * 86400000), arrivalAt: new Date(Date.now() + seq * 86400000 + 3600000),
    fares: { create: { fareId: fare.id, price: 100, availableSeats: capacity, seatCapacity: capacity } } } });
  const input: CounterSaleInput = { requestId: randomUUID(), flightId: f.id, fareId: fare.id, quotedTotal: '100.00', seatMode: 'AUTO',
    contactEmail: 'buyer@example.com', contactPhone: '2914567890', paymentMethod: 'CASH',
    passengers: [{ firstName: 'Lucía', lastName: 'Gómez', documentNumber: '39112804' }] };
  return { f, fare, aircraft, input };
}
test('venta atómica, idempotencia, PDFs/outbox únicos e importe original inmutable', async () => {
  const { input } = await flight();
  const result = await createCounterSale(input, operator);
  const second = await createCounterSale(input, operator);
  assert.equal(result.bookingCode, second.bookingCode); assert.equal(second.reused, true);
  const booking = await db.booking.findUniqueOrThrow({ where: { bookingCode: result.bookingCode }, include: { payments: true, comprobantes: true, emailDispatches: true } });
  assert.equal(booking.userId, null); assert.equal(booking.status, 'PAID'); assert.equal(booking.payments.length, 1); assert.equal(booking.comprobantes.length, 2); assert.equal(booking.emailDispatches.length, 1);
  await assert.rejects(createCounterSale({ ...input, contactPhone: '2914567891' }, operator), /clave de venta/);
  const snapshot = receiptSnapshotSchema.parse(booking.emailDispatches[0]!.snapshot);
  await db.booking.update({ where: { id: booking.id }, data: { totalAmount: 999, contactEmail: 'changed@example.com' } });
  assert.equal(snapshot.recipient, 'buyer@example.com'); assert.equal(snapshot.documents.invoice.total, 100);
});
test('última plaza en web y mostrador simultáneos tiene exactamente un ganador', async () => {
  const { input, aircraft } = await flight(1);
  const outcomes = await Promise.allSettled([
    createCounterSale(input, operator),
    lockSeatsAtomic({ flightId: input.flightId, fareId: input.fareId, seatIds: [aircraft.seats[0]!.id], contactEmail: 'web@example.com' }),
  ]);
  assert.equal(outcomes.filter(r => r.status === 'fulfilled').length, 1);
  const offer = await db.flightFare.findUniqueOrThrow({ where: { flightId_fareId: { flightId: input.flightId, fareId: input.fareId } } });
  assert.equal(offer.availableSeats, 0);
  assert.equal(await db.bookingFlight.count({ where: { flightId: input.flightId } }), 1);
});
test('dos operadores reintentan la misma solicitud concurrentemente sin duplicar venta', async () => {
  const { input } = await flight(2);
  const results = await Promise.all([createCounterSale(input, operator), createCounterSale(input, operator)]);
  assert.equal(results[0].bookingCode, results[1].bookingCode);
  assert.equal(await db.counterSale.count({ where: { requestId: input.requestId } }), 1);
});
test('recargo manual Economy, Premium en cabina física Economy y Primera sin recargo', async () => {
  for (const [cabin, premium, expected] of [['ECONOMY', false, '120.00'], ['ECONOMY', true, '100.00'], ['FIRST', false, '100.00']] as const) {
    const { input, aircraft, fare } = await flight(1, cabin, premium);
    if (premium || cabin !== 'ECONOMY') await db.fare.update({ where: { id: fare.id }, data: { seatSelectionFee: '20.50' } });
    input.seatMode = 'MANUAL'; input.passengers[0]!.seatId = aircraft.seats[0]!.id; input.quotedTotal = expected;
    const quote = await quoteCounterSale({ ...input, passengersCount: 1 }, operator);
    assert.equal(quote.totalAmount, expected);
    const sale = await createCounterSale(input, operator);
    assert.equal(sale.totalAmount, expected);
    const dispatch = await db.emailDispatch.findUniqueOrThrow({ where: { id: sale.email.dispatchId } });
    const snapshot = receiptSnapshotSchema.parse(dispatch.snapshot);
    assert.equal(snapshot.documents.passes[0]!.cabinClass, premium ? 'Economy Premium' : cabin === 'FIRST' ? 'Primera Clase' : 'Economy');
  }
});
test('precio adulterado y rol pasajero no dejan registros; adicional cero permite selección gratuita', async () => {
  const { input, fare } = await flight();
  await assert.rejects(createCounterSale({ ...input, quotedTotal: '1.00' }, operator), /tarifa cambió/);
  await assert.rejects(createCounterSale(input, { ...operator, role: 'PASAJERO' }));
  assert.equal(await db.counterSale.count({ where: { requestId: input.requestId } }), 0);
  await db.fare.update({ where: { id: fare.id }, data: { seatSelectionFee: 0 } });
  assert.equal((await quoteCounterSale({ ...input, passengersCount: 1, seatMode: 'MANUAL' }, operator)).totalAmount, '100.00');
  assert.equal((await quoteCounterSale({ ...input, passengersCount: 1 }, operator)).totalAmount, '100.00');
});
test('dos limpiadores no restauran dos veces los cupos vencidos', async () => {
  const { input, aircraft } = await flight(1);
  const locked = await lockSeatsAtomic({ ...input, seatIds: [aircraft.seats[0]!.id] });
  await db.booking.update({ where: { id: locked.bookingId }, data: { expiresAt: new Date(Date.now() - 1000) } });
  await Promise.all([releaseExpiredSeatLocks(), releaseExpiredSeatLocks()]);
  const offer = await db.flightFare.findUniqueOrThrow({ where: { flightId_fareId: { flightId: input.flightId, fareId: input.fareId } } });
  assert.equal(offer.availableSeats, 1);
});
test('worker concurrente entrega una sola vez con dos PDFs del snapshot', async () => {
  const { input } = await flight(); const sale = await createCounterSale(input, operator); let sent = 0;
  const send = async () => { sent++; await new Promise(resolve => setTimeout(resolve, 50)); return { providerMessageId: `test-${randomUUID()}` }; };
  await Promise.all([processReceiptDispatch(sale.email.dispatchId, { send }), processReceiptDispatch(sale.email.dispatchId, { send })]);
  assert.equal(sent, 1);
  assert.equal((await db.emailDispatch.findUniqueOrThrow({ where: { id: sale.email.dispatchId } })).status, 'ENVIADO');
});
test('web y mostrador guardan el mismo adicional; cambiar catálogo no altera reservas ni PDFs previos', async () => {
  const { input, fare, aircraft } = await flight(4);
  await db.fare.update({ where: { id: fare.id }, data: { seatSelectionFee: '20.50' } });
  const passengers = [input.passengers[0]!, { ...input.passengers[0]!, documentNumber: '30111222' }];
  const web = await lockSeatsAtomic({ flightId: input.flightId, fareId: fare.id, seatIds: aircraft.seats.slice(0, 2).map(s => s.id),
    userId: operator.id, contactEmail: input.contactEmail, passengers, quotedTotal: 241 });
  const sale = await createCounterSale({ ...input, seatMode: 'MANUAL', quotedTotal: '241.00',
    passengers: passengers.map((p, i) => ({ ...p, seatId: aircraft.seats[i + 2]!.id })) }, operator);
  const counter = await db.booking.findUniqueOrThrow({ where: { bookingCode: sale.bookingCode }, include: { flights: true } });
  const webBooking = await db.booking.findUniqueOrThrow({ where: { id: web.bookingId }, include: { flights: true } });
  for (const booking of [counter, webBooking]) {
    assert.equal(booking.totalAmount.toFixed(2), '241.00');
    assert.equal(booking.flights[0]!.seatSelectionAmount.toFixed(2), '41.00');
    assert.equal(booking.flights[0]!.price.toFixed(2), '100.00');
    assert.equal(booking.flights[0]!.seatSelectionIncluded, true);
  }
  await db.fare.update({ where: { id: fare.id }, data: { seatSelectionFee: 90 } });
  const quote = await quoteCounterSale({ ...input, passengersCount: 2, seatMode: 'MANUAL' }, operator, db, false);
  assert.equal(quote.totalAmount, '380.00');
  assert.equal((await db.booking.findUniqueOrThrow({ where: { id: web.bookingId } })).totalAmount.toFixed(2), '241.00');
  const dispatch = await db.emailDispatch.findUniqueOrThrow({ where: { id: sale.email.dispatchId } });
  assert.equal(receiptSnapshotSchema.parse(dispatch.snapshot).documents.invoice.total, 241);
});

test('pago web encola dentro del mismo commit y reintento no duplica email', async () => {
  const { input, aircraft } = await flight(1);
  const locked = await lockSeatsAtomic({ ...input, seatIds: [aircraft.seats[0]!.id], userId: operator.id,
    passengers: input.passengers });
  const body = paymentSchema.parse({ method: 'CREDIT_CARD', cardNumber: '1234567890123456', cardholder: 'Manu Tina', expiry: '12/99', cvv: '123', installments: 1, contactEmail: 'web@example.com' });
  const first = await db.$transaction(tx => settlePayment(tx, locked.bookingCode, operator, body), { timeout: 20000 });
  const second = await db.$transaction(tx => settlePayment(tx, locked.bookingCode, operator, body), { timeout: 20000 });
  assert.equal(first.email?.dispatchId, second.email?.dispatchId); assert.equal(second.reused, true);
  assert.equal(await db.emailDispatch.count({ where: { bookingId: locked.bookingId } }), 1);
});
test('dos asientos distintos compiten por un solo cupo: sólo una venta', async () => {
  const { input, aircraft } = await flight(2);
  await db.flightFare.update({ where: { flightId_fareId: { flightId: input.flightId, fareId: input.fareId } }, data: { availableSeats: 1 } });
  const outcomes = await Promise.allSettled(aircraft.seats.map(seat => createCounterSale({ ...input, requestId: randomUUID(), quotedTotal: '120.00', seatMode: 'MANUAL',
    passengers: [{ ...input.passengers[0]!, seatId: seat.id }] }, operator)));
  assert.equal(outcomes.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(await db.bookingFlight.count({ where: { flightId: input.flightId } }), 1);
});
test('lock web previo produce el mensaje literal de mostrador y no cobra', async () => {
  const { input, aircraft } = await flight(1);
  await lockSeatsAtomic({ ...input, seatIds: [aircraft.seats[0]!.id] });
  await assert.rejects(createCounterSale({ ...input, seatMode: 'MANUAL', quotedTotal: '120.00', passengers: [{ ...input.passengers[0]!, seatId: aircraft.seats[0]!.id }] }, operator),
    /El asiento seleccionado acaba de ser reservado desde la web. Por favor elija otra ubicación./);
  assert.equal(await db.counterSale.count({ where: { requestId: input.requestId } }), 0);
});
test('fallo de outbox revierte reserva, cupos, pago y comprobantes juntos', async () => {
  const { input } = await flight(1);
  const failingDb = { $transaction: (fn: (tx: Prisma.TransactionClient) => Promise<unknown>, options: object) => db.$transaction(tx => fn(new Proxy(tx, {
    get(target, prop) { return prop === 'emailDispatch' ? { upsert: async () => { throw new Error('Outbox no disponible'); } } : Reflect.get(target, prop); },
  })), options) } as unknown as PrismaClient;
  await assert.rejects(createCounterSale(input, operator, failingDb), /Outbox no disponible/);
  assert.equal(await db.bookingFlight.count({ where: { flightId: input.flightId } }), 0);
  assert.equal((await db.flightFare.findUniqueOrThrow({ where: { flightId_fareId: { flightId: input.flightId, fareId: input.fareId } } })).availableSeats, 1);
});
