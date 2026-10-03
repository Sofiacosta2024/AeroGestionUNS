# RF-01 · Alta y publicación de vuelos

Rama `feat/rf01-alta-vuelos` (sale de `mellinger-recalde-gutierrez`) · Sprint 1 · subgrupo
Mellinger – Recalde – Gutiérrez.

Cubre las dos US de RF-01:

- **US1**: el admin registra rutas, fechas y horarios, y el sistema rechaza los choques.
- **US2**: el admin asigna asientos y precio por clase para habilitar la venta.

Este documento resume qué se hizo y qué tienen que saber los demás subgrupos. El detalle
técnico está en [API.md](API.md), [MODELO-DATOS.md](MODELO-DATOS.md) y
[ARQUITECTURA.md](ARQUITECTURA.md).

---

## Lo importante para los otros subgrupos

### Base de datos compartida (Neon)

El 2/10/2026 se aplicaron en Neon **3 migraciones** de esta rama (ver [Migraciones](#migraciones)).
Mientras sus ramas no tengan estos cambios:

- **No corran `npm run db:seed`** contra Neon. El seed viejo revierte la clase Primera a
  `BUSINESS`, la capacidad del E190 y los asientos a la venta. Con eso el panel de alta
  rechaza Primera.
- **No corran `prisma migrate dev` ni `npm run db:reset`** contra Neon. Prisma detecta
  migraciones que su rama no tiene y propone resetear la base, lo que borra los datos de todos.
- Después de traer estos cambios alcanza con `npx prisma generate`.

### Cambios en código existente

Cada cambio tiene un comentario `Cambio RF-01` en el código explicando el motivo.

| Dónde | Antes | Ahora | ¿Afecta a alguien? |
| --- | --- | --- | --- |
| `POST /api/flights` | Recibía `code` y `arrivalAt` y creaba el vuelo sin validar. | Recibe `{ routeId, aircraftId, date, departureTime, fares[] }`. El código `AG-####` y la llegada los calcula el sistema, con las mismas reglas que el panel. Sigue permitido para `MOSTRADOR`. | Ninguna pantalla lo usaba. |
| `POST /api/routes` | La duración era opcional. | Duración obligatoria y par origen-destino único (`409` si ya existe). | Nadie lo usaba. |
| `PATCH /api/routes/:id` | Aceptaba duración `null`. | La duración no puede quedar vacía. | Nadie lo usaba. |
| `ApiError.conflict(msg)` | Solo mensaje. | Acepta `details` opcional. | No: los llamados existentes siguen igual. |
| `flightSchema` (`validation.ts`) | Alta de vuelos. | Eliminado; el alta usa `singleFlightSchema`. | Solo lo usaba `POST /api/flights`. |
| `/vuelos` (menú) | "Alta de Vuelos [Admin]" mostraba "en construcción". | Lleva al panel y **solo lo ve el admin** (`user.isAdmin` en el bootstrap). | Pantalla de RF-02: cambio mínimo. |
| `GET /api/flights` (buscador) | — | Devuelve además `scheduleId` y, por tarifa, `seatCapacity`. | Solo se agregan datos. |

### Clases y cabinas (importante para RF-02, RF-03 y RF-04)

El cliente definió **3 clases** (los documentos de RF todavía dicen 2 y conviene actualizarlos):

| Clase | Tarifa (`fares.code`) | Cabina (`cabin_class`) | Incluye |
| --- | --- | --- | --- |
| Economy | `ECON-BASIC` | `ECONOMY` | Solo mochila u objeto personal. Elegir asiento tiene cargo (lo resuelve el flujo de compra). |
| Economy Premium | `ECON-FLEX` | `ECONOMY` | Carry-on + valija en bodega. Elegir asiento sin cargo. |
| Primera Clase | `UNS-CORP` | `FIRST` | Sector propio del avión (fila 1 del mapa). |

- `fares.cabin_class` es la **cabina física** donde se sienta el pasajero: Economy y
  Economy Premium comparten los asientos `ECONOMY`, y solo Primera tiene asientos propios
  (`FIRST`).
- En `flight_fares`, `seat_capacity` son los asientos ofrecidos al publicar y
  `available_seats` es el remanente que descuentan las reservas.
- Los 5 vuelos de prueba de noviembre 2025 quedaron con 2 clases (Economy Premium y
  Primera). Los vuelos nuevos salen con las 3.

### Otros puntos de contacto

- **RF-02 (búsqueda):** los vuelos publicados aparecen solos en el buscador. El calendario
  semanal sale de `weekly_fares`, que nadie carga para fechas nuevas, así que muestra
  "Sin datos". Queda a cargo de RF-02.
- **RF-07 (roles):** `/admin/*` tiene un guard provisorio (`src/app/admin/require-admin.ts`).
  Sin sesión redirige a `/login` y con otro rol a `/vuelos`. Se puede reemplazar por el de RF-07.

---

## Reglas de negocio implementadas

| Regla | Detalle |
| --- | --- |
| Quién | El panel es solo para `ADMIN`. `POST /api/flights` también lo permite a `MOSTRADOR` (pendiente de definir). |
| Rutas | Un par origen-destino existe una sola vez y tiene duración obligatoria. Se puede crear desde el formulario. |
| Vuelo único o cronograma | Vigencia (desde/hasta, máximo 1 año) + días de la semana + hora de salida en ART. Cada vuelo generado tiene su propio código. |
| Código de vuelo | `AG-####` correlativo, de la secuencia `flight_code_seq`. Las pruebas consumieron AG-1437 a AG-1439 (ya borrados): el próximo es **AG-1440**. |
| Llegada | Salida + duración de la ruta. |
| Fechas | No se programan salidas en el pasado. |
| Margen entre salidas | Desde un mismo aeropuerto, al menos 20 min entre salidas (`MIN_DEPARTURE_GAP_MINUTES`). Desde aeropuertos distintos pueden coincidir. |
| Avión | No puede estar en dos vuelos cuyos horarios se superpongan. Solo se ofrecen aviones `ACTIVE`. |
| Asientos y precio | Cada clase con al menos 1 asiento y su precio (se propone el de catálogo). Tope por cabina contra el mapa del avión. |
| Borrador y publicación | Un borrador no aparece en el buscador ni reserva horario. Al publicar se vuelve a validar y se generan los vuelos. |
| Choques | Se detectan **mientras se carga** el formulario y otra vez al guardar y al publicar: nunca se guarda algo que choque. |
| Itinerario | Planilla del día: los vuelos que salen en una fecha. Es una vista, no tiene tabla. |

---

## Qué se agregó

### Modelo de datos

- Tablas nuevas **`flight_schedules`** (el cronograma que carga el admin, en borrador o
  publicado) y **`flight_schedule_fares`** (precio y asientos por clase).
- `flights.schedule_id`: qué cronograma generó el vuelo (null en los vuelos viejos). Además,
  un avión no puede tener dos salidas en el mismo instante.
- `flight_fares.seat_capacity`.
- `routes`: duración obligatoria y par origen-destino único.
- Secuencia `flight_code_seq` para los códigos de vuelo.

### Migraciones

| Migración | Qué hace |
| --- | --- |
| `20261002194247_rf01_alta_publicacion_vuelos` | Esquema: tablas, columnas, restricciones y secuencia nuevas. |
| `20261002202854_rf01_correccion_datos_prueba` | Datos: Business pasa a `FIRST`, capacidades alineadas con el mapa de asientos, borra el asiento de prueba 99Z del LV-CKU. |
| `20261002212542_rf01_catalogo_tres_clases` | Datos: catálogo de 3 clases (reactiva `ECON-BASIC` y cambia nombres y beneficios). |

### Backend (`src/lib/scheduling/`)

- **Reglas puras** (no tocan la base): `calendar.ts`, `conflicts.ts` y `capacity.ts`.
- **`repository.ts`**: acceso a datos.
- **`service.ts`**: casos de uso (chequear, guardar, editar, publicar, descartar).
- **`itinerary.ts`**: planilla del día.

Los endpoints nuevos son `/api/flight-schedules` (+ `/check`, `/:id`, `/:id/publish`) y
`/api/itinerary`, todos para `ADMIN` (ver [API.md](API.md)). La publicación usa un lock de
Postgres para que dos admins no tomen la misma franja a la vez.

### Pantallas

- **`/admin/vuelos/nuevo`**: alta y publicación, basada en el diseño de Stitch.
  - Ruta, avión, vuelo único o cronograma, salida y llegada calculada.
  - Asientos y precio de las 3 clases, con un contador de la cabina Economy compartida.
  - Chequeo en vivo de choques, y acciones Guardar borrador y Publicar.
  - Del diseño se omitieron los datos inventados del mock: METAR, telemetría, tasas e
    "Importar Plan ICAO".
- **`/admin/itinerario`**: planilla del día con navegación por fecha, y los borradores
  pendientes con las acciones Abrir, Publicar y Descartar.

---

## Cómo probarlo

1. `npm install`, `npx prisma generate` y `npm run dev`.
2. Entrar con el usuario de demostración `admin@uns.edu.ar` (contraseña en el README) y
   usar **Alta de Vuelos [Admin]** en el menú.
3. Casos para verificar:
   - Una salida desde BHI a menos de 20 min de otra se marca en rojo y no deja guardar.
   - A los 20 min exactos sí deja guardar.
   - La misma hora desde otro aeropuerto (por ejemplo AEP) está permitida.
   - Elegir un avión ya ocupado en ese horario marca un choque.
   - Asignar más asientos que los de la cabina da error.
   - Un borrador no aparece en el buscador; después de publicarlo, sí.
   - Como pasajero, `/admin/*` redirige a `/vuelos`. Sin sesión, a `/login`.

Lo que se publique queda en la base compartida y consume códigos `AG-####`.

---

## Pendientes y decisiones abiertas

- **Kg de equipaje de Economy Premium:** sin definir. El texto que ve el pasajero no menciona kg.
- **Reparto de asientos entre Economy y Economy Premium:** sin definir. Por ahora lo carga
  el admin, con tope en la cabina.
- **¿MOSTRADOR también da de alta vuelos?** Pendiente de la daily. El panel es solo `ADMIN`.
- **Endpoints viejos sin las reglas nuevas:** `PATCH /api/flights/:id` y
  `POST /api/flights/:id/fares`. Por ahí se puede cambiar un horario o cargar asientos de
  más. Corresponden a RF-11 (Sprint 2).
- **Documentos de requerimientos:** RF-01, RF-03, RF-04 y RF-09 todavía dicen "Economy y
  Primera Clase".
- **QA de RF-01:** casos de prueba, carga cronometrada de menos de 5 minutos y guion de la demo.

---

## Commits de la rama

| Commit | Contenido |
| --- | --- |
| `9cf52c6` | Modelo de cronogramas de vuelos y migración de esquema. |
| `0360edc` | Corrección de datos de prueba (clase Primera y capacidades). |
| `38e460d` | Servicio y API de programación de vuelos, y catálogo de 3 clases. |
| `f2316e9` | Documentación (API, modelo de datos, arquitectura, README). |
| `080e5a5` | Pantallas de alta de vuelos y planilla del día. |
