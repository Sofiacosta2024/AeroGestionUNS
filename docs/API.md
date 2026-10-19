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
| `POST` | `/api/routes` | `ADMIN` | Alta de ruta. *Cambio RF-01:* `durationMinutes` es obligatoria y un par origen-destino existe una sola vez (`409` si ya existe). |
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
| `POST` | `/api/flights` | `MOSTRADOR` | Alta de un vuelo puntual con las reglas de RF-01 (ver abajo). |
| `GET` `PATCH` `DELETE` | `/api/flights/:id` | público / `MOSTRADOR` / `ADMIN` | Detalle, edición, baja. *Cambio US-11B:* `PATCH` ya no acepta `code` ni `arrivalAt`, rechaza campos desconocidos y, si cambian `routeId`, `aircraftId` o `departureAt`, aplica las reglas de [reprogramación](#reprogramación-de-vuelos-us-11b). |
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
        "prices": [ { "code": "ECON-FLEX", "name": "Economy Premium", "cabinClass": "ECONOMY", "price": 64200, "currency": "ARS" } ]
      }
    ],
    "pagination": { "page": 1, "pageSize": 20, "total": 3, "pages": 1 }
  }
}
```

Los horarios llegan en UTC y **se muestran en ART**: `09:45Z` es 06:45 de tablero.

`PATCH /api/flights/:id/status` acepta `status` y `reason` opcional, y valida la
transición contra el estado actual.

`POST /api/flights` — *cambio RF-01:* antes recibía `code` y `arrivalAt` y creaba el vuelo
sin validar. Ahora el código `AG-####` y la llegada (salida + duración de la ruta) los
calcula el sistema, y aplica las mismas reglas que el panel de programación (ver
[Programación de vuelos](#programación-de-vuelos-rf-01)). Por dentro es un cronograma de un
solo día publicado en el acto.

```json
{
  "routeId": "...",
  "aircraftId": "...",
  "date": "2026-12-14",
  "departureTime": "12:00",
  "fares": [ { "fareId": "...", "price": 52900, "seats": 60 } ]
}
```

## Programación de vuelos (RF-01)

Alta y publicación de vuelos desde el panel de administración. Un **cronograma** define
ruta, avión, vigencia (`validFrom`–`validTo`), días de operación (`weekdays`, 0 = domingo)
y hora de salida en ART. Un vuelo único es un cronograma con `validFrom = validTo`.
Mientras está en borrador no existen vuelos: se generan al **publicar**, así el buscador
nunca muestra borradores.

| Método | Ruta | Rol | Descripción |
| --- | --- | --- | --- |
| `POST` | `/api/flight-schedules/check` | `ADMIN` | Chequeo en vivo para el formulario. No guarda nada. |
| `GET` `POST` | `/api/flight-schedules` | `ADMIN` | Lista (`status=DRAFT\|PUBLISHED`) / alta como borrador (con `publish: true` se publica en el acto). |
| `GET` `PUT` `DELETE` | `/api/flight-schedules/:id` | `ADMIN` | Detalle / editar un borrador / descartar un borrador. |
| `POST` | `/api/flight-schedules/:id/publish` | `ADMIN` | Publica el borrador: genera sus vuelos. |
| `GET` | `/api/itinerary?date=YYYY-MM-DD` | `ADMIN` | Planilla del día: vuelos que salen ese día (ART), con ocupación por clase. |

```json
{
  "routeId": "...",
  "aircraftId": "...",
  "validFrom": "2026-12-14",
  "validTo": "2026-12-31",
  "weekdays": [1, 2, 3, 4, 5],
  "departureTime": "07:30",
  "fares": [
    { "fareId": "<Economy>", "price": 52900, "seats": 100 },
    { "fareId": "<Economy Premium>", "price": 64200, "seats": 44 },
    { "fareId": "<Primera Clase>", "price": 138000, "seats": 6 }
  ],
  "publish": false
}
```

Reglas (se validan al chequear, al guardar y al publicar):

- No hay salidas en el pasado: un `validFrom` anterior a hoy, o un vuelo de hoy a una hora
  que ya pasó, responde `422`.
- Desde un mismo aeropuerto, dos salidas no pueden estar a menos de
  `MIN_DEPARTURE_GAP_MINUTES` minutos (20 por defecto). Desde aeropuertos distintos sí
  pueden coincidir.
- El mismo avión necesita al menos `MIN_TURNAROUND_MINUTES` minutos (120 por defecto) entre
  un aterrizaje y su siguiente despegue, respecto del vuelo anterior y del siguiente. Puede
  despegar desde cualquier aeropuerto: se asume que vuelve vacío si hace falta.
- Cada clase (tarifa activa) se vende con al menos 1 asiento y su precio. El tope es por
  **cabina**: Economy + Economy Premium no superan los asientos de la cabina Economy del
  avión; Primera Clase no supera los de su cabina.
- `validTo` no puede pasar de hoy + 1 año, inclusive (por ejemplo, hoy 17/10/2026 permite
  hasta el 17/10/2027). Si pasa, responde `422` con el detalle en `validTo`.

Un choque responde `409` con el mensaje «Ya existe un vuelo o cronograma que se superpone con
el ingresado». Un borrador no reserva horario: si mientras tanto otro vuelo ocupa la franja,
publicar también responde `409`. Los conflictos vuelven en `error.details` con `kind`
(`DEPARTURE_GAP`, `AIRCRAFT_BUSY`), `date`, `conflictingFlightCode` y `message`. Los datos
inválidos (clases faltantes, asientos de más, fechas fuera de rango) responden `422`.

`POST /api/flight-schedules/check` responde, sin guardar:

```json
{
  "flightsCount": 10,
  "dates": ["2026-12-14", "..."],
  "departureTime": "07:30",
  "arrivalTime": "08:40",
  "durationMinutes": 70,
  "cabins": [ { "cabinClass": "ECONOMY", "seats": 144, "assigned": 144 } ],
  "conflicts": [],
  "issues": [],
  "canSave": true
}
```

## Reprogramación de vuelos (US-11B)

Cambia la fecha, la hora de salida, la ruta o el avión de **un** vuelo publicado. La
llegada se recalcula con la duración de la ruta. Pantalla: `/admin/vuelos/:id/reprogramar`,
desde la acción «Reprogramar» de la planilla del día.

| Método | Ruta | Rol | Descripción |
| --- | --- | --- | --- |
| `POST` | `/api/admin/flights/:id/itinerary/check` | `ADMIN` | Chequeo en vivo. No guarda nada. |
| `PATCH` | `/api/admin/flights/:id/itinerary` | `ADMIN` | Guarda la reprogramación. |

Los dos reciben el itinerario completo:

```json
{ "routeId": "...", "aircraftId": "...", "date": "2026-10-21", "departureTime": "10:00" }
```

Reglas:

- Solo vuelos `SCHEDULED` o `DELAYED` que todavía no salieron (si no, `409`).
- Las mismas del alta, sin contar al propio vuelo: no al pasado, no más allá de hoy + 1
  año, margen entre salidas del mismo aeropuerto y rotación del avión.
- La ruta solo cambia si el vuelo no tiene reservas activas (pagadas, confirmadas o
  pendientes con el bloqueo vigente).
- El avión solo cambia si no hay asientos asignados ni bloqueados. Si lo ofrecido en una
  cabina no entra en el avión nuevo, cada clase de esa cabina se reduce en la misma
  proporción sin bajar de lo vendido (ej. 100 Economy + 44 Economy Premium en 144 → 75 + 33
  en 108). Si lo vendido no entra, responde `422`.

Respuestas de error:

- Avión ocupado: `409` con «La aeronave seleccionada ya tiene un vuelo asignado entre las
  HH:MM y las HH:MM hs.» (horario del otro vuelo).
- Salida a menos del margen de otra del mismo aeropuerto: `409` con «Ya existe un vuelo o
  cronograma que se superpone con el ingresado».
- Ruta o avión que no se pueden cambiar: `422` con el motivo en `details`.
- Sin cambios: `400`.

`check` responde, sin guardar:

```json
{
  "changed": true,
  "departureAt": "2026-10-21T13:00:00.000Z",
  "arrivalAt": "2026-10-21T14:10:00.000Z",
  "arrivalTime": "11:10",
  "arrivalDate": "2026-10-21",
  "durationMinutes": 70,
  "affectedPassengers": 2,
  "classes": [ { "fareId": "...", "name": "Economy", "sold": 2, "capacity": 111, "newCapacity": 111 } ],
  "conflicts": [],
  "issues": [],
  "canSave": true
}
```

Al guardar también se actualiza la salida copiada en `booking_flights.departure_at` y queda
en `audit_logs` (`action = RESCHEDULE`) el itinerario anterior y el nuevo, los pasajeros
afectados y las clases cuya capacidad se ajustó. La respuesta trae lo mismo. El aviso por
mail a los pasajeros es de RF-06.

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

## Comprobantes (RF-05)

| Método | Ruta | Rol | Descripción |
| --- | --- | --- | --- |
| `GET` | `/api/v1/reservas/:codigo/comprobantes/pasaje` | dueño o `MOSTRADOR` | Descarga binaria del pasaje en PDF. |
| `GET` | `/api/v1/reservas/:codigo/comprobantes/factura` | dueño o `MOSTRADOR` | Descarga binaria de la factura en PDF. |

Responden `application/pdf` con `content-disposition: attachment`, así que el navegador
descarga el archivo en lugar de mostrarlo; el nombre (`pasaje-AG-XXXXXX.pdf`,
`factura-AG-XXXXXX.pdf`) viaja en el header.

A diferencia de `GET /api/bookings/:code`, estas rutas **no se pueden redactar** (un PDF no
tiene versión pública): exigen sesión, ser el dueño o de Operations (`403` en caso
contrario) y además un **pago aprobado** (`409` si la reserva todavía no se cobró). `404` si
el código no existe. El presupuesto de respuesta es **menos de 5 s** (RF-05).

El PDF se arma en el momento de la descarga a partir de la reserva (`toTravelDocuments` →
`buildPassPdf` / `buildInvoicePdf`, ver `src/lib/pdf/documents.ts`). La **emisión** del
comprobante se registra aparte, al aprobarse el pago, en la tabla `comprobantes`.

## Administración

| Método | Ruta | Rol | Descripción |
| --- | --- | --- | --- |
| `GET` `POST` | `/api/users` | `ADMIN` | Listado / alta de usuarios. |
| `GET` `PATCH` | `/api/users/:id` | autenticado | Detalle, edición. |
| `DELETE` | `/api/users/:id` | `ADMIN` | Baja. |
| `GET` | `/api/audit-logs` | `ADMIN` | Auditoría, con filtros `entity`, `action`, `userId`, `from`, `to`. |

Nunca se devuelven `passwordHash` ni `tokenHash` en ninguna respuesta.
