import { Prisma } from '@prisma/client';
import { ApiError, created, handler, parseBody } from '@/lib/api';
import { audit } from '@/lib/audit';
import { hashPassword } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { registerSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';

/**
 * POST /api/auth/register
 * Alta de pasajero. Siempre crea un User con rol PASAJERO y su Passenger asociado.
 */
export const POST = handler(async (req: Request) => {
  const body = await parseBody(req, registerSchema);

  const existing = await prisma.user.findUnique({
    where: { email: body.email },
    select: { id: true },
  });
  if (existing) throw ApiError.conflict('Ese correo ya esta registrado');

  const docExists = await prisma.passenger.findUnique({
    where: {
      documentType_documentNumber: {
        documentType: body.documentType,
        documentNumber: body.documentNumber,
      },
    },
    select: { id: true },
  });
  if (docExists) throw ApiError.conflict('Ese documento ya esta registrado');

  const passwordHash = await hashPassword(body.password);

  const user = await prisma.$transaction(async (tx) => {
    const u = await tx.user.create({
      data: {
        email: body.email,
        passwordHash,
        role: 'PASAJERO',
        firstName: body.firstName,
        lastName: body.lastName,
        phone: body.phone || null,
      },
      select: { id: true, email: true, role: true, firstName: true, lastName: true },
    });

    await tx.passenger.create({
      data: {
        userId: u.id,
        firstName: body.firstName,
        lastName: body.lastName,
        documentType: body.documentType,
        documentNumber: body.documentNumber,
        birthDate: body.birthDate ?? null,
        email: body.email,
        phone: body.phone || null,
      },
    });

    return u;
  }).catch((err: unknown) => {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw ApiError.conflict('Ese correo o documento ya esta registrado');
    }
    throw err;
  });

  await audit({ userId: user.id, action: 'REGISTER', entity: 'User', entityId: user.id });

  return created({ user });
});
