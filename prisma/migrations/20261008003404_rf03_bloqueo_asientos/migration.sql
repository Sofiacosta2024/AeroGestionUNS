-- AlterTable
ALTER TABLE "bookings" ADD COLUMN     "expires_at" TIMESTAMPTZ(3);

-- CreateTable
CREATE TABLE "seat_locks" (
    "id" TEXT NOT NULL,
    "flight_id" TEXT NOT NULL,
    "seat_id" TEXT NOT NULL,
    "booking_id" TEXT NOT NULL,
    "locked_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "seat_locks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "seat_locks_booking_id_idx" ON "seat_locks"("booking_id");

-- CreateIndex
CREATE INDEX "seat_locks_expires_at_idx" ON "seat_locks"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "seat_locks_flight_id_seat_id_key" ON "seat_locks"("flight_id", "seat_id");

-- CreateIndex
CREATE INDEX "bookings_expires_at_idx" ON "bookings"("expires_at");

-- AddForeignKey
ALTER TABLE "seat_locks" ADD CONSTRAINT "seat_locks_flight_id_fkey" FOREIGN KEY ("flight_id") REFERENCES "flights"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seat_locks" ADD CONSTRAINT "seat_locks_seat_id_fkey" FOREIGN KEY ("seat_id") REFERENCES "seats"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seat_locks" ADD CONSTRAINT "seat_locks_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
