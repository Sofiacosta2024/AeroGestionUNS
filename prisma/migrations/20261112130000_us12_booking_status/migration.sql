-- US-12A/12B: estados de reserva para la cancelacion de vuelos y la reasignacion de pasajeros.
-- Se agregaron a la base compartida sin archivo de migracion. Esta migracion los registra en el
-- historial; en la base compartida se marco como aplicada con `prisma migrate resolve --applied`.
-- IF NOT EXISTS: aplicarla sobre una base que ya los tiene no cambia nada.

-- AlterEnum
ALTER TYPE "BookingStatus" ADD VALUE IF NOT EXISTS 'REPROGRAMACION_PENDIENTE';
ALTER TYPE "BookingStatus" ADD VALUE IF NOT EXISTS 'REASIGNADO';
ALTER TYPE "BookingStatus" ADD VALUE IF NOT EXISTS 'REASIGNACION_PROPUESTA';
ALTER TYPE "BookingStatus" ADD VALUE IF NOT EXISTS 'SIN_ALTERNATIVA';
ALTER TYPE "BookingStatus" ADD VALUE IF NOT EXISTS 'REPROGRAMADA';
