# Modelo de datos

18 tablas sobre PostgreSQL. Fuente de verdad: [`prisma/schema.prisma`](../prisma/schema.prisma).
Migración inicial: [`prisma/migrations/20250101000000_init/migration.sql`](../prisma/migrations/20250101000000_init/migration.sql).

## Diagrama

```
User ──┬── Session
       ├── Passenger (perfil de pasajero)
       └── Booking ──┬── BookingFlight ──► Flight ──► Route ──► Airport (origen/destino)
                      │         │            └──► Aircraft ──► Seat
                      │         └──► Fare ◄── FlightFare
                      ├── BookingPassenger ──► Seat
                      │        ├── Baggage
                      │        └── BoardingPass ──► Seat
                      └── Payment

WeeklyFare ──► Route
AuditLog ──► User
```

## Operadores del dominio

| Tabla | Clave | Qué guarda |
| --- | --- | --- |
| `airports` | `iata_code` (IATA, 3) | Nombre, ciudad, provincia, zona horaria IANA, coordenadas. |
| `aircraft` | `id` (cuid) | Matrícula, modelo, fabricante, capacidad, `layout` (disposición de cabina), Wi-Fi/USB, estado, base. |
| `seats` | `id` | Fila, columna, cabina, tipo (`WINDOW`/`AISLE`/`MIDDLE`/`EXIT`), fila de salida. Único por `(aircraft_id, row_number, column_letter)`. |
| `routes` | `id` | Código, origen y destino, distancia, duración en minutos, activo. |
| `flights` | `id` | Código comercial (`AG-1420`), ruta, aeronave, `departure_at`/`arrival_at` (Timestamptz), estado, directo, puntualidad histórica, `tags` de texto libre. |
| `fares` | `id` | Código, nombre, cabina, precio base, equipaje de cabina y bodega, beneficios, cambios/asiento/reembolso. |
| `flight_fares` | `id` | Precio **de ese vuelo** para esa tarifa + `available_seats`. Único por `(flight_id, fare_id)`. |
| `weekly_fares` | `id` | Precio de referencia por ruta y día, nivel de demanda. Columna `date` (sin hora). Único por `(route_id, date)`. |

## Personas y reservas

| Tabla | Clave | Qué guarda |
| --- | --- | --- |
| `users` | `id` | Email, hash bcrypt, rol, legajo, nombre, teléfono, activo. |
| `sessions` | `id` | `user_id`, **`token_hash` (SHA-256 del token)**, expiración, IP, user agent. |
| `passengers` | `id` | Perfil de pasajero: documento, fecha de nacimiento, contacto, `user_id` opcional. |
| `bookings` | `id` | `booking_code` público único, `user_id` opcional, tipo de viaje, estado, cantidad de pasajeros, cabina, total, contacto. |
| `booking_flights` | `id` | Tramo de la reserva: vuelo, tarifa, precio congelado, `is_return`, salida. |
| `booking_passengers` | `id` | Pasajero dentro de una reserva: nombre, tipo/número de documento, nacimiento, asiento, código y estado de check-in. |
| `payments` | `id` | Monto, método, estado, referencia externa. |
| `baggage` | `id` | Tipo (`CABIN`/`HOLD`/`CARGO`/`SPECIAL`), etiqueta, estado, peso. |
| `boarding_passes` | `id` | Código `BP-XXXXXX`, pasajero, asiento, vuelo, estado. |
| `audit_logs` | `id` | `user_id`, acción, entidad, entidad relacionada, metadata JSON, IP, momento. |

## Enums

| Enum | Valores |
| --- | --- |
| `UserRole` | `PASAJERO`, `MOSTRADOR`, `ADMIN` |
| `DocumentType` | `DNI`, `PASAPORTE`, `CEDULA`, `OTRO` |
| `CabinClass` | `ECONOMY`, `PREMIUM`, `BUSINESS`, `FIRST` |
| `AircraftStatus` | `ACTIVE`, `MAINTENANCE`, `RETIRED` |
| `FlightStatus` | `SCHEDULED`, `BOARDING`, `DEPARTED`, `ARRIVED`, `DELAYED`, `CANCELLED` |
| `SeatType` | `WINDOW`, `AISLE`, `MIDDLE`, `EXIT` |
| `DemandLevel` | `LOW`, `NORMAL`, `HIGH` |
| `TripType` | `ROUND_TRIP`, `ONE_WAY` |
| `BookingStatus` | `PENDING`, `CONFIRMED`, `PAID`, `BOARDED`, `CANCELLED`, `COMPLETED`, `NO_SHOW` |
| `PaymentMethod` | `CREDIT_CARD`, `DEBIT_CARD`, `TRANSFER`, `CASH`, `WALLET` |
| `PaymentStatus` | `PENDING`, `APPROVED`, `REJECTED`, `REFUNDED` |
| `CheckInStatus` | `NOT_STARTED`, `OPEN`, `DONE` |
| `BaggageType` | `CABIN`, `HOLD`, `CARGO`, `SPECIAL` |
| `BaggageStatus` | `REGISTERED`, `CHECKED`, `LOADED`, `DELIVERED`, `LOST` |
| `BoardingPassStatus` | `ISSUED`, `USED`, `CANCELLED` |

## Decisiones

- **Precios en dos niveles.** `fares.base_price` es la tarifa de catálogo;
  `flight_fares.price` es el precio real de ese vuelo. El precio se **congela** en
  `booking_flights.price` al crear la reserva: cambiar la tarifa después no altera una
  reserva ya hecha.
- **Inventario en `flight_fares`.** Los asientos disponibles se descontan por tarifa, no
  por vuelo, que es como está modelado el producto.
- **Sesiones hasheadas.** `sessions.token_hash` es el SHA-256 del token de la cookie.
  La tabla no sirve para autenticarse.
- **Códigos públicos.** `bookings.booking_code` (`AG-XXXXXX`) y
  `boarding_passes.code` (`BP-XXXXXX`) son cortos y adivinables por diseño: son la
  forma de consultar una reserva sin sesión. Por eso las respuestas sin sesión van
  redactadas (ver `redactBooking` en `src/lib/bookings.ts`).
- **Timestamps en `timestamptz(3)`.** Siempre UTC en la base; la conversión a ART ocurre
  al presentar. Los horarios de vuelo son instantes reales, no "hora de tablero".
- **Columnas `date` sin hora.** `weekly_fares.date`, `passengers.birth_date` y
  `booking_passengers.birth_date` no tienen zona: se comparan y formatean por día.
- **Borrados en cascada solo hacia abajo.** `bookings` → `booking_flights`,
  `booking_passengers` y `payments` es `Cascade`; `booking_passengers` →
  `baggage`/`boarding_passes` también. Hacia arriba es `Restrict`: no se puede borrar
  un vuelo, una tarifa o una aeronave que ya figure en una reserva, y borrar un asiento
  deja la referencia en `SetNull` en lugar de perder el histórico.
- **`tags` y `benefits` son `text[]`.** Los rótulos libres de la tarjeta de vuelo y los
  iconos de la tarifa. Los beneficios se guardan como `"icono|Texto"`, que es lo que
  consume la interfaz.
- **Nombres en español, columnas en `snake_case`.** Los modelos usan PascalCase y
  `@@map` los lleva a `snake_case`, con índices para los accesos del buscador
  (`flights(route_id, departure_at)`, `flight_fares(fare_id)`, `bookings(user_id)`,
  `audit_logs(created_at)`).

## Seed

`prisma/seed.ts` es idempotente: usa `upsert` por clave natural, así que se puede volver
a correr sin duplicar. Carga los datos que estaban hardcodeados en los HTML originales:

5 aeropuertos · 3 tarifas · 3 aeronaves con su mapa de asientos · 5 rutas · 5 vuelos con
sus precios · 7 tarifas semanales (el calendario de la interfaz) · 3 usuarios · 1 reserva
de ejemplo (`AG-DEMO01`).
