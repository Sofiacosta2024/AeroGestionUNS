import type { DocumentType, Prisma } from '@prisma/client';
import { ApiError } from '@/lib/api';
import type { PassengerFormData } from '@/lib/passenger-form';
import { prisma } from '@/lib/prisma';
import {
  duplicateSavedPassengerMessage,
  MAX_SAVED_PASSENGERS,
  planAgendaUpdate,
  type AgendaPlan,
  type SavedPassengerData,
} from './agenda';

/**
 * Agenda de pasajeros guardados (US-16): lectura para el checkout, guardado automatico al
 * pagar y alta manual por API. Toda escritura bloquea la cuenta para que dos compras
 * simultaneas no pasen el tope de 20.
 */

type Db = Prisma.TransactionClient;

export type SavedPassengerView = {
  id: string;
  firstName: string;
  lastName: string;
  documentType: DocumentType;
  documentNumber: string;
  /** yyyy-mm-dd, o null si se guardo sin fecha. */
  birthDate: string | null;
  lastUsedAt: string;
};

/** Los que el checkout web puede volver a cargar. */
const SAVABLE_DOCUMENTS: readonly DocumentType[] = ['DNI', 'PASAPORTE'];

const TX_OPTIONS = { maxWait: 10_000, timeout: 15_000 };

const viewSelect = {
  id: true,
  firstName: true,
  lastName: true,
  documentType: true,
  documentNumber: true,
  birthDate: true,
  lastUsedAt: true,
} satisfies Prisma.SavedPassengerSelect;

function toView(p: Prisma.SavedPassengerGetPayload<{ select: typeof viewSelect }>): SavedPassengerView {
  return {
    ...p,
    // Columna date: se guarda a medianoche UTC, por eso se corta el ISO y no se pasa a ART.
    birthDate: p.birthDate ? p.birthDate.toISOString().slice(0, 10) : null,
    lastUsedAt: p.lastUsedAt.toISOString(),
  };
}

/** Agenda de la cuenta, del uso mas reciente al mas viejo. */
export async function listSavedPassengers(userId: string): Promise<SavedPassengerView[]> {
  const rows = await prisma.savedPassenger.findMany({
    where: { userId },
    select: viewSelect,
    // Los de una misma compra comparten lastUsedAt: el apellido y nombre dejan un orden estable.
    orderBy: [{ lastUsedAt: 'desc' }, { lastName: 'asc' }, { firstName: 'asc' }],
    take: MAX_SAVED_PASSENGERS,
  });
  return rows.map(toView);
}

/** Serializa las escrituras de la agenda de una cuenta hasta el fin de la transaccion. */
async function lockAgenda(db: Db, userId: string): Promise<void> {
  await db.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;
}

function loadEntries(db: Db, userId: string) {
  return db.savedPassenger.findMany({
    where: { userId },
    select: { id: true, documentType: true, documentNumber: true, lastUsedAt: true },
  });
}

async function applyPlan(db: Db, userId: string, plan: AgendaPlan, now: Date): Promise<void> {
  if (plan.removals.length > 0) {
    await db.savedPassenger.deleteMany({ where: { userId, id: { in: plan.removals } } });
  }
  for (const { id, data } of plan.updates) {
    await db.savedPassenger.update({
      where: { id },
      // Sin fecha (canal que no la pide): se conserva la que ya estaba.
      data: { firstName: data.firstName, lastName: data.lastName, birthDate: data.birthDate ?? undefined, lastUsedAt: now },
    });
  }
  if (plan.creates.length > 0) {
    await db.savedPassenger.createMany({ data: plan.creates.map((d) => ({ ...d, userId, lastUsedAt: now })) });
  }
}

const fromForm = (p: PassengerFormData): SavedPassengerData => ({
  firstName: p.firstName,
  lastName: p.lastName,
  documentType: p.documentType,
  documentNumber: p.documentNumber,
  birthDate: p.birthDate ? new Date(`${p.birthDate}T00:00:00Z`) : null,
});

/** Agrega o actualiza los pasajeros de una compra en la agenda de la cuenta. */
export async function rememberPassengers(userId: string, passengers: readonly SavedPassengerData[], now = new Date()) {
  // Los pasajeros sin datos reales (lockSeatsAtomic los crea como TEMP-...) no se guardan.
  const savable = passengers.filter(
    (p) => SAVABLE_DOCUMENTS.includes(p.documentType) && p.documentNumber && !p.documentNumber.startsWith('TEMP-'),
  );
  if (savable.length === 0) return;

  await prisma.$transaction(async (tx) => {
    await lockAgenda(tx, userId);
    await applyPlan(tx, userId, planAgendaUpdate(await loadEntries(tx, userId), savable), now);
  }, TX_OPTIONS);
}

type PaidBooking = {
  bookingCode: string;
  userId: string | null;
  passengers: readonly {
    firstName: string;
    lastName: string;
    documentType: DocumentType;
    documentNumber: string;
    birthDate: Date | null;
  }[];
};

/**
 * Guardado automatico al aprobarse el pago (US-16), despues de confirmar la compra: si
 * falla, la compra sigue confirmada y solo queda el error en el log.
 */
export async function rememberBookingPassengers(booking: PaidBooking): Promise<void> {
  if (!booking.userId) return;
  try {
    await rememberPassengers(
      booking.userId,
      booking.passengers.map(({ firstName, lastName, documentType, documentNumber, birthDate }) => ({
        firstName,
        lastName,
        documentType,
        documentNumber,
        birthDate,
      })),
    );
  } catch (err) {
    console.error(`[us-16] no se pudieron guardar los pasajeros de la reserva ${booking.bookingCode}:`, err);
  }
}

/**
 * Alta manual de un pasajero (POST de la US-16). Si el documento ya esta en la agenda
 * responde 409 con el mensaje literal; si la agenda esta llena, reemplaza al mas viejo.
 */
export async function addSavedPassenger(userId: string, input: PassengerFormData, now = new Date()) {
  const data = fromForm(input);
  return prisma.$transaction(async (tx) => {
    await lockAgenda(tx, userId);
    const key = { userId, documentType: data.documentType, documentNumber: data.documentNumber };
    const duplicate = await tx.savedPassenger.findUnique({
      where: { userId_documentType_documentNumber: key },
      select: { firstName: true, lastName: true },
    });
    if (duplicate) {
      throw ApiError.conflict(duplicateSavedPassengerMessage(`${duplicate.firstName} ${duplicate.lastName}`));
    }

    const plan = planAgendaUpdate(await loadEntries(tx, userId), [data]);
    await applyPlan(tx, userId, plan, now);
    const created = await tx.savedPassenger.findUniqueOrThrow({
      where: { userId_documentType_documentNumber: key },
      select: viewSelect,
    });
    return { passenger: toView(created), replaced: plan.removals.length > 0 };
  }, TX_OPTIONS);
}
