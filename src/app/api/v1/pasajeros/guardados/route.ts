import { created, handler, ok, parseBody } from '@/lib/api';
import { audit } from '@/lib/audit';
import { requireUser } from '@/lib/auth';
import { MAX_SAVED_PASSENGERS } from '@/lib/saved-passengers/agenda';
import { addSavedPassenger, listSavedPassengers } from '@/lib/saved-passengers/service';
import { webPassengerSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/pasajeros/guardados
 *
 * Agenda de pasajeros guardados de la cuenta con sesion (US-16), del uso mas reciente al
 * mas viejo. Cada cuenta ve solo la suya.
 */
export const GET = handler(async () => {
  const user = await requireUser();
  const data = await listSavedPassengers(user.id);
  return ok({ data, count: data.length, max: MAX_SAVED_PASSENGERS });
});

/**
 * POST /api/v1/pasajeros/guardados
 *
 * Alta manual de un pasajero en la agenda (US-16). Mismas reglas que el checkout: DNI o
 * Pasaporte y fecha de nacimiento obligatoria. Si el documento ya esta guardado responde
 * 409 con «El DNI/Pasaporte ingresado ya corresponde a … en tu lista de pasajeros
 * guardados.». Con la agenda llena, reemplaza al de uso mas viejo.
 */
export const POST = handler(async (req: Request) => {
  const user = await requireUser();
  const input = await parseBody(req, webPassengerSchema);

  const result = await addSavedPassenger(user.id, input);

  await audit({
    userId: user.id,
    action: 'CREATE',
    entity: 'SavedPassenger',
    entityId: result.passenger.id,
    metadata: { documentType: result.passenger.documentType, replacedOldest: result.replaced },
  });

  return created(result);
});
