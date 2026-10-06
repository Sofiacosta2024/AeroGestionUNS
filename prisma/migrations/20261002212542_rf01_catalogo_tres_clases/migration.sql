-- RF-01 · Catálogo de 3 clases (migración de datos, sin cambios de esquema)
--
-- El cliente definió 3 clases (reemplaza las 2 de la versión anterior):
--   * Economy          (ECON-BASIC): solo mochila u objeto personal; elegir asiento tiene cargo.
--   * Economy Premium  (ECON-FLEX):  carry-on + valija en bodega; elegir asiento sin cargo.
--   * Primera Clase    (UNS-CORP):   sector propio del avión (asientos FIRST).
-- Economy y Economy Premium comparten la cabina ECONOMY; `fares.cabin_class` es la cabina física.
--
-- Pendiente de definir: los kg de carry-on y de bodega de Economy Premium. Mientras tanto
-- quedan los valores actuales y el texto que ve el pasajero no menciona kg.
-- El cargo por elegir asiento en Economy no se configura acá: lo resuelve el flujo de compra.
--
-- Todas las sentencias son idempotentes y no hacen nada sobre una base vacía.

-- Economy: se reactiva (se había desactivado cuando eran 2 clases).
UPDATE "fares"
SET "name" = 'Economy',
    "is_active" = true,
    "carry_on_kg" = 0,
    "checked_bag_kg" = 0,
    "seat_selection" = false,
    "benefits" = ARRAY['backpack|Solo mochila u objeto personal'],
    "updated_at" = CURRENT_TIMESTAMP
WHERE "code" = 'ECON-BASIC';

-- Economy Premium: incluye valija en bodega y elección de asiento sin cargo.
UPDATE "fares"
SET "name" = 'Economy Premium',
    "seat_selection" = true,
    "benefits" = ARRAY[
        'luggage|Carry-on + valija en bodega',
        'airline_seat_recline_extra|Eleccion de asiento sin cargo',
        'event|Cambio sin penalidad'
    ],
    "updated_at" = CURRENT_TIMESTAMP
WHERE "code" = 'ECON-FLEX';

-- Primera Clase: solo cambia el nombre.
UPDATE "fares"
SET "name" = 'Primera Clase',
    "updated_at" = CURRENT_TIMESTAMP
WHERE "code" = 'UNS-CORP';
