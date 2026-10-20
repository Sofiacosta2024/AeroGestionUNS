ALTER TABLE "booking_flights"
ADD COLUMN "seat_selection_included" BOOLEAN NOT NULL DEFAULT false;

UPDATE "booking_flights" AS booking_flight
SET "seat_selection_included" = fare."seat_selection"
FROM "fares" AS fare
WHERE fare."id" = booking_flight."fare_id";
