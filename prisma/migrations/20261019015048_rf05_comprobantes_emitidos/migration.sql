-- CreateEnum
CREATE TYPE "ComprobanteTipo" AS ENUM ('PASAJE', 'FACTURA');

-- CreateTable
CREATE TABLE "comprobantes" (
    "id" TEXT NOT NULL,
    "booking_id" TEXT NOT NULL,
    "payment_id" TEXT NOT NULL,
    "tipo" "ComprobanteTipo" NOT NULL,
    "transaction_ref" VARCHAR(64),
    "emitted_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comprobantes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "comprobantes_payment_id_idx" ON "comprobantes"("payment_id");

-- CreateIndex
CREATE UNIQUE INDEX "comprobantes_booking_id_tipo_key" ON "comprobantes"("booking_id", "tipo");

-- AddForeignKey
ALTER TABLE "comprobantes" ADD CONSTRAINT "comprobantes_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comprobantes" ADD CONSTRAINT "comprobantes_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
