import type { Prisma, PrismaClient } from '@prisma/client';
import { ApiError } from './api';

/**
 * Edicion de los datos de identificacion de un pasajero de una reserva desde la
 * consola interna (US-14C / RF-14).
 *
 * Se separa del Route Handler para poder inyectar la conexion en las pruebas.
 * Solo se actualiza el registro concreto dentro de la reserva (BookingPassenger):
 * no se toca el registro maestro ni la vinculacion de asientos.
 */

export type PassengerIdentInput = Partial<{
  firstName: string;
  lastName: string;
  documentType: 'DNI' | 'PASAPORTE' | 'CEDULA' | 'OTRO';
  documentNumber: string;
  birthDate: Date | null;
}>;

export type PassengerIdentSnapshot = {
  id: string;
  firstName: string;
  lastName: string;
  documentType: string;
  documentNumber: string;
  birthDate: string | null;
};

export type PassengerIdentUpdateResult = {
  bookingId: string;
  bookingCode: string;
  passengerId: string;
  before: PassengerIdentSnapshot;
  after: PassengerIdentSnapshot;
};

function snapshot(p: {
  id: string;
  firstName: string;
  lastName: string;
  documentType: string;
  documentNumber: string;
  birthDate: Date | string | null;
}): PassengerIdentSnapshot {
  return {
    id: p.id,
    firstName: p.firstName,
    lastName: p.lastName,
    documentType: p.documentType,
    documentNumber: p.documentNumber,
    birthDate: p.birthDate ? new Date(p.birthDate).toISOString() : null,
  };
}

export async function executePassengerIdentUpdate(
  db: PrismaClient,
  params: { bookingCode: string; bookingPassengerId: string; data: PassengerIdentInput },
): Promise<PassengerIdentUpdateResult> {
  const code = params.bookingCode.trim().toUpperCase();

  const booking = await db.booking.findUnique({
    where: { bookingCode: code },
    select: { id: true, bookingCode: true },
  });
  if (!booking) throw ApiError.notFound('Reserva no encontrada');

  const current = await db.bookingPassenger.findFirst({
    where: { id: params.bookingPassengerId, bookingId: booking.id },
  });
  if (!current) throw ApiError.notFound('Pasajero no encontrado en la reserva');

  const changes: Prisma.BookingPassengerUpdateInput = {};
  if ('firstName' in params.data) changes.firstName = params.data.firstName;
  if ('lastName' in params.data) changes.lastName = params.data.lastName;
  if ('documentType' in params.data) changes.documentType = params.data.documentType;
  if ('documentNumber' in params.data) changes.documentNumber = params.data.documentNumber;
  if ('birthDate' in params.data) changes.birthDate = params.data.birthDate ?? null;

  if (Object.keys(changes).length === 0) {
    throw ApiError.badRequest('No hay campos para actualizar');
  }

  const before = snapshot(current);

  const updated = await db.bookingPassenger.update({
    where: { id: current.id },
    data: changes,
  });

  return {
    bookingId: booking.id,
    bookingCode: booking.bookingCode,
    passengerId: updated.id,
    before,
    after: snapshot(updated),
  };
}
