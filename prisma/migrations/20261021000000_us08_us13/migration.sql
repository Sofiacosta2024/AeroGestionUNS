-- CreateEnum
CREATE TYPE "EmailDispatchStatus" AS ENUM ('PENDIENTE', 'ENVIADO', 'FALLIDO');

-- AlterTable
ALTER TABLE "fares" ADD COLUMN     "seat_selection_fee" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "booking_flights" ADD COLUMN     "seat_selection_amount" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "counter_sales" (
    "id" TEXT NOT NULL,
    "request_id" VARCHAR(36) NOT NULL,
    "payload_hash" CHAR(64) NOT NULL,
    "operator_id" TEXT NOT NULL,
    "branch_name" VARCHAR(120) NOT NULL,
    "booking_id" TEXT NOT NULL,
    "payment_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "counter_sales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_dispatches" (
    "id" TEXT NOT NULL,
    "dedupe_key" VARCHAR(160) NOT NULL,
    "booking_id" TEXT NOT NULL,
    "payment_id" TEXT NOT NULL,
    "recipient" VARCHAR(160) NOT NULL,
    "snapshot" JSONB NOT NULL,
    "status" "EmailDispatchStatus" NOT NULL DEFAULT 'PENDIENTE',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "queued_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lease_until" TIMESTAMPTZ(3),
    "lease_token" TEXT,
    "accepted_at" TIMESTAMPTZ(3),
    "delivered_at" TIMESTAMPTZ(3),
    "bounced_at" TIMESTAMPTZ(3),
    "provider_message_id" TEXT,
    "last_error" VARCHAR(255),

    CONSTRAINT "email_dispatches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_dispatch_attempts" (
    "id" TEXT NOT NULL,
    "dispatch_id" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL,
    "started_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMPTZ(3),
    "error" VARCHAR(255),

    CONSTRAINT "email_dispatch_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "counter_sales_request_id_key" ON "counter_sales"("request_id");

-- CreateIndex
CREATE UNIQUE INDEX "counter_sales_booking_id_key" ON "counter_sales"("booking_id");

-- CreateIndex
CREATE UNIQUE INDEX "counter_sales_payment_id_key" ON "counter_sales"("payment_id");

-- CreateIndex
CREATE UNIQUE INDEX "email_dispatches_dedupe_key_key" ON "email_dispatches"("dedupe_key");

-- CreateIndex
CREATE UNIQUE INDEX "email_dispatches_provider_message_id_key" ON "email_dispatches"("provider_message_id");

-- CreateIndex
CREATE INDEX "email_dispatches_status_next_attempt_at_idx" ON "email_dispatches"("status", "next_attempt_at");

-- CreateIndex
CREATE INDEX "email_dispatches_payment_id_queued_at_idx" ON "email_dispatches"("payment_id", "queued_at");

-- CreateIndex
CREATE UNIQUE INDEX "email_dispatch_attempts_dispatch_id_attempt_key" ON "email_dispatch_attempts"("dispatch_id", "attempt");

-- AddForeignKey
ALTER TABLE "counter_sales" ADD CONSTRAINT "counter_sales_operator_id_fkey" FOREIGN KEY ("operator_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "counter_sales" ADD CONSTRAINT "counter_sales_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "counter_sales" ADD CONSTRAINT "counter_sales_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_dispatches" ADD CONSTRAINT "email_dispatches_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_dispatches" ADD CONSTRAINT "email_dispatches_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_dispatch_attempts" ADD CONSTRAINT "email_dispatch_attempts_dispatch_id_fkey" FOREIGN KEY ("dispatch_id") REFERENCES "email_dispatches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
