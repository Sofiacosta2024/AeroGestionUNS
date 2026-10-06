-- RF-01 · Corrección de datos de prueba (migración de datos, sin cambios de esquema)
--
-- Deja los datos existentes alineados con las reglas de RF-01:
--   * 2 clases: Economy y Primera. "Primera" se guarda como FIRST, así que lo que hoy es
--     BUSINESS (asientos de la fila 1 y la tarifa UNS-CORP) pasa a FIRST.
--   * Una tarifa activa por clase: ECON-BASIC se desactiva (no se borra).
--   * La capacidad de cada avión es la cantidad real de asientos de su mapa.
--   * Ningún vuelo ofrece más asientos de una clase que los que tiene el avión en esa clase.
--
-- Todas las sentencias son idempotentes y no hacen nada sobre una base vacía (el seed ya
-- carga los datos correctos).

-- Asiento de prueba 99Z agregado a mano al LV-CKU (fuera del mapa del seed). Solo se borra
-- si ninguna reserva ni pase de embarque lo usa.
DELETE FROM "seats" s
USING "aircraft" a
WHERE s."aircraft_id" = a."id"
  AND a."registration" = 'LV-CKU'
  AND s."row_number" = 99
  AND s."column_letter" = 'Z'
  AND NOT EXISTS (SELECT 1 FROM "booking_passengers" bp WHERE bp."seat_id" = s."id")
  AND NOT EXISTS (SELECT 1 FROM "boarding_passes" bps WHERE bps."seat_id" = s."id");

-- Business pasa a ser Primera (FIRST).
UPDATE "seats" SET "cabin_class" = 'FIRST' WHERE "cabin_class" = 'BUSINESS';

UPDATE "fares"
SET "cabin_class" = 'FIRST', "updated_at" = CURRENT_TIMESTAMP
WHERE "cabin_class" = 'BUSINESS';

-- Una sola tarifa activa por clase: Economy queda con ECON-FLEX.
UPDATE "fares"
SET "is_active" = false, "updated_at" = CURRENT_TIMESTAMP
WHERE "code" = 'ECON-BASIC' AND "is_active" = true;

-- Capacidad declarada = asientos reales del mapa.
UPDATE "aircraft" a
SET "seat_count" = s."total", "updated_at" = CURRENT_TIMESTAMP
FROM (SELECT "aircraft_id", COUNT(*)::int AS "total" FROM "seats" GROUP BY "aircraft_id") s
WHERE s."aircraft_id" = a."id"
  AND a."seat_count" <> s."total";

-- Asientos ofrecidos y disponibles por clase, con tope en los asientos de esa clase del avión.
UPDATE "flight_fares" ff
SET "seat_capacity"   = LEAST(ff."seat_capacity", cs."seats"),
    "available_seats" = LEAST(ff."available_seats", cs."seats")
FROM "flights" f,
     "fares" fa,
     (SELECT "aircraft_id", "cabin_class", COUNT(*)::int AS "seats"
        FROM "seats"
       GROUP BY "aircraft_id", "cabin_class") cs
WHERE ff."flight_id" = f."id"
  AND ff."fare_id" = fa."id"
  AND cs."aircraft_id" = f."aircraft_id"
  AND cs."cabin_class" = fa."cabin_class"
  AND (ff."seat_capacity" > cs."seats" OR ff."available_seats" > cs."seats");
