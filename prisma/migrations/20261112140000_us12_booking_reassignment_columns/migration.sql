-- US-12B: columnas de reserva para la reasignacion de pasajeros (vuelo propuesto y reembolso).
-- Se agregaron a la base compartida sin archivo de migracion, con dos diferencias respecto del
-- schema: `reembolso_pendiente` admitia NULL y faltaba la FK de `vuelo_propuesto_id`.
-- Es idempotente: crea lo que falte en una base nueva y completa la base compartida.

-- AlterTable
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "vuelo_propuesto_id" VARCHAR(30);
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "reembolso_pendiente" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "bookings" ALTER COLUMN "reembolso_pendiente" SET NOT NULL;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bookings_vuelo_propuesto_id_fkey') THEN
    ALTER TABLE "bookings" ADD CONSTRAINT "bookings_vuelo_propuesto_id_fkey"
      FOREIGN KEY ("vuelo_propuesto_id") REFERENCES "flights"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
