-- US-14A: Consulta publica de reservas
-- Optimiza la busqueda de pasajeros de una reserva filtrando por apellido.
-- Consulta prevista: resolver Booking por booking_code (indice unique existente)
-- y luego unir booking_passengers filtrando por booking_id y last_name.

-- CreateIndex
CREATE INDEX "booking_passengers_booking_id_last_name_idx" ON "booking_passengers"("booking_id", "last_name");

-- Down (Prisma no ejecuta migraciones de reversion; aplicar manualmente si fuera necesario)
-- DROP INDEX "booking_passengers_booking_id_last_name_idx";
