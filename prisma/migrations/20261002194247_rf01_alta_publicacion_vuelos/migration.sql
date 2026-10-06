-- RF-01 · Alta y publicación de vuelos
--
-- * flight_schedules / flight_schedule_fares: cronogramas (borradores) cargados por el admin.
--   Los vuelos se generan recién al publicar, así el buscador nunca ve borradores.
-- * routes: el par origen-destino es único y la duración es obligatoria (la llegada se calcula con ella).
-- * flights: schedule_id para trazar qué cronograma generó cada vuelo, y una aeronave no puede
--   tener dos salidas en el mismo instante.
-- * flight_fares.seat_capacity: asientos ofrecidos al publicar (available_seats es el remanente).
-- * flight_code_seq: numeración correlativa de los códigos AG-####.

-- CreateEnum
CREATE TYPE "ScheduleStatus" AS ENUM ('DRAFT', 'PUBLISHED');

-- DropIndex
DROP INDEX "routes_origin_airport_id_destination_airport_id_idx";

-- AlterTable
ALTER TABLE "routes" ALTER COLUMN "duration_minutes" SET NOT NULL;

-- AlterTable
ALTER TABLE "flights" ADD COLUMN     "schedule_id" TEXT;

-- AlterTable
ALTER TABLE "flight_fares" ADD COLUMN     "seat_capacity" INTEGER;

-- CreateTable
CREATE TABLE "flight_schedules" (
    "id" TEXT NOT NULL,
    "route_id" TEXT NOT NULL,
    "aircraft_id" TEXT NOT NULL,
    "valid_from" DATE NOT NULL,
    "valid_to" DATE NOT NULL,
    "weekdays" INTEGER[],
    "departure_time" VARCHAR(5) NOT NULL,
    "status" "ScheduleStatus" NOT NULL DEFAULT 'DRAFT',
    "created_by_id" TEXT,
    "published_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "flight_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "flight_schedule_fares" (
    "id" TEXT NOT NULL,
    "schedule_id" TEXT NOT NULL,
    "fare_id" TEXT NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "seats" INTEGER NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'ARS',

    CONSTRAINT "flight_schedule_fares_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "flight_schedules_status_idx" ON "flight_schedules"("status");

-- CreateIndex
CREATE INDEX "flight_schedules_route_id_idx" ON "flight_schedules"("route_id");

-- CreateIndex
CREATE INDEX "flight_schedules_aircraft_id_idx" ON "flight_schedules"("aircraft_id");

-- CreateIndex
CREATE INDEX "flight_schedule_fares_fare_id_idx" ON "flight_schedule_fares"("fare_id");

-- CreateIndex
CREATE UNIQUE INDEX "flight_schedule_fares_schedule_id_fare_id_key" ON "flight_schedule_fares"("schedule_id", "fare_id");

-- CreateIndex
CREATE UNIQUE INDEX "routes_origin_airport_id_destination_airport_id_key" ON "routes"("origin_airport_id", "destination_airport_id");

-- CreateIndex
CREATE INDEX "flights_schedule_id_idx" ON "flights"("schedule_id");

-- CreateIndex
CREATE UNIQUE INDEX "flights_aircraft_id_departure_at_key" ON "flights"("aircraft_id", "departure_at");

-- AddForeignKey
ALTER TABLE "flights" ADD CONSTRAINT "flights_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "flight_schedules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flight_schedules" ADD CONSTRAINT "flight_schedules_route_id_fkey" FOREIGN KEY ("route_id") REFERENCES "routes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flight_schedules" ADD CONSTRAINT "flight_schedules_aircraft_id_fkey" FOREIGN KEY ("aircraft_id") REFERENCES "aircraft"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flight_schedules" ADD CONSTRAINT "flight_schedules_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flight_schedule_fares" ADD CONSTRAINT "flight_schedule_fares_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "flight_schedules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flight_schedule_fares" ADD CONSTRAINT "flight_schedule_fares_fare_id_fkey" FOREIGN KEY ("fare_id") REFERENCES "fares"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill (escrito a mano): en las tarifas ya cargadas, la capacidad ofrecida es lo que hoy está
-- disponible. La corrección de los datos de prueba inconsistentes es un paso aparte.
UPDATE "flight_fares" SET "seat_capacity" = "available_seats" WHERE "seat_capacity" IS NULL;

-- Secuencia de códigos AG-#### (escrito a mano; Prisma no modela secuencias sueltas).
-- Arranca después del mayor código AG-#### existente; con la base vacía, en AG-1001.
CREATE SEQUENCE "flight_code_seq" MINVALUE 1 MAXVALUE 9999 NO CYCLE;
SELECT setval(
    'flight_code_seq',
    COALESCE(
        (SELECT MAX(CAST(SUBSTRING("code" FROM 4) AS INTEGER)) FROM "flights" WHERE "code" ~ '^AG-[0-9]{4}$'),
        1000
    ),
    true
);
