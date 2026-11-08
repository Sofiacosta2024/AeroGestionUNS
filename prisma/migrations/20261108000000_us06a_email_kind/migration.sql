-- US-06A: la outbox de correos (US-13) pasa a admitir avisos de reprogramacion.
-- Aditiva: las filas existentes quedan como RECEIPT y conservan su payment_id.

-- CreateEnum
CREATE TYPE "EmailKind" AS ENUM ('RECEIPT', 'ITINERARY_CHANGE');

-- AlterTable
ALTER TABLE "email_dispatches" ADD COLUMN     "kind" "EmailKind" NOT NULL DEFAULT 'RECEIPT',
ALTER COLUMN "payment_id" DROP NOT NULL;
