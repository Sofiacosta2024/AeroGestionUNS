# API

Todos los handlers viven en `src/app/api/**/route.ts`. Salvo indicación contraria
responden con `cache-control: no-store`.

## Convenciones

**Éxito**

```json
{ "ok": true, "data": { "...": "..." } }
```

`201` en altas, `204` en borrados.

**Error**

```json
{ "ok": false, "error": { "code": "VALIDATION_ERROR", "message": "…", "details": [ { "campo": "…", "mensaje": "…" } ] } }
```

| Status | Cuándo |
| --- | --- |
| `400 BAD_REQUEST` | JSON inválido o referencia inexistente. |
| `401 UNAUTHORIZED` | Sin sesión. |
| `403 FORBIDDEN` | Rol insuficiente o la reserva no es del usuario. |
| `404 NOT_FOUND` | Recurso inexistente. |
| `409 CONFLICT` | Duplicado, vuelo cancelado, sin asientos, estado incompatible. |
| `422 VALIDATION_ERROR` | Falla el schema Zod. `details` lista campo y motivo. |
| `500 INTERNAL_ERROR` | Cualquier otro error. No se filtra información interna. |

Las violaciones de restricción de Prisma se traducen: `P2002` → `409`,
`P2003` → `400`, `P2025` → `404`.

**Listados**: aceptan `page` (≥1) y `pageSize` (1..100, por defecto 20), y devuelven
`pagination: { page, pageSize, total, pages }`.

**Fechas**: los parámetros de día usan `YYYY-MM-DD` y se resuelven en ART (UTC-3).

## Autenticación

| Método | Ruta | Rol | Descripción |
| --- | --- | --- | --- |
| `POST` | `/api/auth/register` | público | Alta de pasajero. |
| `POST` | `/api/auth/login` | público | Devuelve el usuario y setea la cookie `ag_session`. |
| `POST` | `/api/auth/logout` | con sesión | Destruye la sesión. |
| `GET` | `/api/auth/me` | público | Estado de la sesión. |
| `GET` | `/api/auth/demo` | público | `{ enabled }`: si el acceso demo está activo. |
| `POST` | `/api/auth/demo` | público | Abre sesión con el usuario de ejemplo del rol, sin contraseña. |

`POST /api/auth/demo`

```json
{ "role": "ADMIN" }
```

Devuelve `201` con el usuario y setea la cookie, igual que `/api/auth/login`, pero sin
verificar credenciales: es un bypass para demos. Registra `LOGIN_DEMO` en la auditoría.
Responde `404` si `DEMO_MODE="false"`, y la UI oculta el botón en ese caso.

`POST /api/auth/login`

```json
{ "email": "admin@uns.edu.ar", "password": "AeroGestion2025!", "role": "ADMIN", "remember": true }
```

`role` es opcional; si se envía debe coincidir con el rol real del usuario. `remember`
extiende la cookie de 1 a 30 días.

## Salud

| Método | Ruta | Rol | Descripción |
| --- | --- | --- | --- |
| `GET` | `/api/health` | público | Estado del servicio y de la base. |

## Catálogos

| Método | Ruta | Rol | Descripción |
| --- | --- | --- | --- |
| `GET` `POST` | `/api/airports` | público / `MOSTRADOR` | Lista / alta de aeropuertos. |
| `GET` `PATCH` `DELETE` | `/api/airports/:iata` | público / `MOSTRADOR` / `ADMIN` | Detalle, edición, baja. |
| `GET` | `/api/routes` | público | Rutas activas. |
| `GET` `PATCH` `DELETE` | `/api/routes/:id` | público / `ADMIN` / `ADMIN` | Detalle, edición, baja. |
| `POST` | `/api/routes` | `ADMIN` | Alta de ruta. |
| `GET` `POST` | `/api/aircraft` | público / `ADMIN` | Flota / alta. |
| `GET` `PATCH` `DELETE` | `/api/aircraft/:id` | público / `ADMIN` / `ADMIN` | Detalle, edición, baja. |
| `GET` `POST` `PUT` | `/api/aircraft/:id/seats` | público / `MOSTRADOR` / `MOSTRADOR` | Mapa de cabina, alta y carga masiva. |
| `DELETE` | `/api/aircraft/:id/seats/:seatId` | `MOSTRADOR` | Baja de un asiento. |
| `GET` `POST` | `/api/fares` | público / `ADMIN` | Tarifas / alta. |
| `GET` `PATCH` `DELETE` | `/api/fares/:id` | público / `ADMIN` / `ADMIN` | Detalle, edición, baja. |
| `GET` `POST` | `/api/weekly-fares` | público / `MOSTRADOR` | Calendario de tarifas por ruta. |
| `GET` `PATCH` `DELETE` | `/api/weekly-fares/:id` | público / `MOSTRADOR` / `MOSTRADOR` | Detalle, edición, baja. |

`GET /api/aircraft/:id/seats` acepta `cabinClass`, `type` (asiento) y
`free=true|false`. Devuelve `occupied` por asiento siempre; los nombres de los pasajeros
asignados **solo** para `MOSTRADOR` o superior.

`GET /api/weekly-fares` acepta `routeId` o `origin`+`destination`, más `from` y `to`
(`YYYY-MM-DD`, ambos inclusivos). La comparación es por día: `weekly_fares.date` es una
columna `date`.

## Vuelos

| Método | Ruta | Rol | Descripción |
| --- | --- | --- | --- |
| `GET` | `/api/flights` | público | Buscador (alimenta `/vuelos`). |
| `POST` | `/api/flights` | `MOSTRADOR` | Alta / actualización de un vuelo. |
| `GET` `PATCH` `DELETE` | `/api/flights/:id` | público / `MOSTRADOR` / `ADMIN` | Detalle, edición, baja. |
| `GET` `POST` `DELETE` | `/api/flights/:id/fares` | público / `MOSTRADOR` / `MOSTRADOR` | Precios del vuelo, alta, quitar. |
| `PATCH` | `/api/flights/:id/status` | `MOSTRADOR` | Cambio de estado operativo. |

`GET /api/flights`

| Parámetro | Descripción |
| --- | --- |
| `origin`, `destination` | Código IATA. |
| `date` | Un día puntual (ART). |
| `from`, `to` | Rango inclusivo; tiene prioridad sobre `date`. |
| `routeId`, `status` | Filtros directos. |
| `minPrice`, `maxPrice` | Sobre `flight_fares.price`. |
| `onlyDirect` | `true` / `false`. |
| `sort`, `order` | `departure` (por defecto), `price` o `punctuality`; `asc` / `desc`. |

Por defecto excluye los vuelos `CANCELLED`. `sort=price` pagina en memoria con un tope
de 500 filas y lo señala con `pagination.truncated`.

```bash
curl "localhost:3000/api/flights?origin=BHI&destination=AEP&date=2025-11-18"
```

```json
{
  "ok": true,
  "data": {
    "data": [
      {
        "code": "AG-1420",
        "departureAt": "2025-11-18T09:45:00.000Z",
        "arrivalAt": "2025-11-18T10:55:00.000Z",
        "punctualityPct": 98,
        "tags": ["Directo"],
        "route": { "durationMinutes": 70, "originAirport": { "iataCode": "BHI" } },
        "aircraft": { "model": "Boeing 737-800", "registration": "LV-CKU" },
        "prices": [ { "code": "ECONOMY", "name": "Economy Flex", "price": 64200, "currency": "ARS" } ]
      }
    ],
    "pagination": { "page": 1, "pageSize": 20, "total": 3, "pages": 1 }
  }
}
```

Los horarios llegan en UTC y **se muestran en ART**: `09:45Z` es 06:45 de tablero.

`PATCH /api/flights/:id/status` acepta `status` y `reason` opcional, y valida la
transición contra el estado actual.

## Pasajeros y reservas

| Método | Ruta | Rol | Descripción |
| --- | --- | --- | --- |
| `GET` `POST` | `/api/passengers` | autenticado | Listado / alta de pasajeros. |
| `GET` `PATCH` | `/api/passengers/:id` | autenticado | Detalle, edición. |
| `DELETE` | `/api/passengers/:id` | `ADMIN` | Baja. |
| `GET` `POST` | `/api/bookings` | con sesión / público | Reservas del usuario (o consulta por código) / alta. |
| `GET` `PATCH` `DELETE` | `/api/bookings/:code` | dueño o `MOSTRADOR` | Detalle, edición, cancelación. |
| `GET` | `/api/bookings/:code/passengers` | dueño o `MOSTRADOR` | Pasajeros de la reserva. |
| `POST` | `/api/bookings/:code/passengers` | dueño o `MOSTRADOR` | Paso 2: alta nominal y butaca. |
| `PATCH` | `/api/bookings/:code/passengers/:bookingPassengerId` | `MOSTRADOR` | Check-in, documento, asiento. |
| `GET` `POST` | `/api/bookings/:code/baggage` | dueño o `MOSTRADOR` | Equipaje / alta. |
| `GET` | `/api/bookings/:code/boarding-passes` | dueño o `MOSTRADOR` | Pases emitidos. |
| `POST` | `/api/bookings/:code/boarding-passes` | `MOSTRADOR` | Emisión del pase. |
| `GET` | `/api/bookings/:code/payments` | dueño o `MOSTRADOR` | Pagos de la reserva. |
| `POST` | `/api/bookings/:code/payments` | dueño o `MOSTRADOR` | Registrar pago. |

`GET /api/bookings/:code`, y los subrecursos marcados "dueño o `MOSTRADOR`", validan que
el usuario sea el dueño de la reserva o pertenezca a Operations (`assertCanAccess`).
Nunca responden a una consulta anónima.

`GET /api/bookings`

- Con sesión: devuelve las reservas del usuario; `MOSTRADOR` o superior ve todas.
- Sin sesión: solo se acepta `search` con un **código exacto** (`AG-XXXXXX`) y la
  respuesta viene **redactada** (sin nombres, documentos, contacto ni pagos), porque
  el código es público.

`GET /api/bookings/:code`

- El dueño y `MOSTRADOR` o superior reciben la reserva completa.
- Sin sesión, solo se responde si la reserva está `CONFIRMED`, y **igualmente
  redactada**: conocer el código no habilita ver datos nominales. Conserva lo
  operativo (tramos, estado, número de butaca) y oculta lo personal.
- Un usuario autenticado que no es el dueño ni es de Operations recibe `403`.
- Todos los subrecursos (`/passengers`, `/baggage`, `/payments`, `/boarding-passes`)
  exigen sesión y que sea el dueño o de Operations: nunca responden a una consulta
  anónima.

`POST /api/bookings` — el cliente nunca manda importes:

```json
{
  "tripType": "ROUND_TRIP",
  "cabinClass": "ECONOMY",
  "contactEmail": "pasajero@uns.edu.ar",
  "contactPhone": "2915555555",
  "flights": [ { "flightId": "...", "fareId": "...", "isReturn": false } ]
}
```

El servidor resuelve cada precio desde `flight_fares`, descuenta un asiento por vuelo
dentro de una transacción (con `updateMany` condicional para no sobrevender ante
concurrencia) y calcula `totalAmount`.

## Administración

| Método | Ruta | Rol | Descripción |
| --- | --- | --- | --- |
| `GET` `POST` | `/api/users` | `ADMIN` | Listado / alta de usuarios. |
| `GET` `PATCH` | `/api/users/:id` | autenticado | Detalle, edición. |
| `DELETE` | `/api/users/:id` | `ADMIN` | Baja. |
| `GET` | `/api/audit-logs` | `ADMIN` | Auditoría, con filtros `entity`, `action`, `userId`, `from`, `to`. |

Nunca se devuelven `passwordHash` ni `tokenHash` en ninguna respuesta.
