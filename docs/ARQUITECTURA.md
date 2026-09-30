# Arquitectura

## Capas

```
Navegador  ──►  Route Handler  ──►  lib/* (validación, auth, fechas)  ──►  Prisma  ──►  PostgreSQL
```

- **`src/app/api/**/route.ts`** — cada archivo exporta los métodos HTTP. No contiene
  lógica de negocio más allá de la orquestación de la petición.
- **`src/lib/*`** — las reglas compartidas: sesión, RBAC, validación, zona horaria,
  formato, auditoría. Los Route Handlers son delgados y delegan.
- **`src/lib/prisma.ts`** — un único `PrismaClient` reutilizado entre hot reloads de
  desarrollo; sin eso Next abre un pool de conexiones por compilación.
- **`src/lib/api.ts`** — `handler()` normaliza los tres casos de toda ruta: respuesta
  `200/201/204`, `ApiError` con status explícito y excepción inesperada. Además fuerza
  `cache-control: no-store`: datos de negocio no se cachean.

## Sesión y RBAC

- `POST /api/auth/login` valida con bcrypt, crea una fila en `sessions` y pone el token
  en la cookie `ag_session`.
- El token se genera con 32 bytes aleatorios. **En la base solo se guarda su SHA-256**
  (`hashToken`): si alguien lee la tabla no permite suplantar a un usuario.
- `getCurrentUser()` resuelve la cookie → `tokenHash` → usuario, y descarta la sesión
  vencida. `requireUser()` y `requireRole(min)` lanzan `401/403`.
- Jerarquía: `ADMIN` (3) > `MOSTRADOR` (2) > `PASAJERO` (1). `canManage()` permite que
  Operations (mostrador) vea reservas ajenas; `isAdmin()` reserva la gestión de flota,
  usuarios y auditoría.
- `remember` elige la duración: 1 día sin marcar, 30 días marcado.
- `POST /api/auth/demo` es la excepción deliberada: crea la sesión del usuario de
  ejemplo sin verificar contraseña. Es un bypass de autenticación para demos, así que
  está detrás de `DEMO_MODE !== 'false'`, queda en `audit_logs` como `LOGIN_DEMO` y la
  UI solo lo dibuja si `GET /api/auth/demo` responde `enabled: true`. Con
  `DEMO_MODE="false"` el botón desaparece y el endpoint devuelve `404`.

## Zona horaria: todo en ART

La operación es de Bahía Blanca (UTC-3). El problema clásico es que `new Date('2025-11-18')`
es la medianoche **UTC**, que en ART cae el día 17, y las columnas `@db.Date` no tienen hora.

Reglas aplicadas:

- `toUtcRange('2025-11-18')` devuelve el rango `[medianoche ART, medianoche ART del día
  siguiente)`, de modo que "vuelos del 18" incluye el vuelo de las 00:30 ART.
- `localNoonUtc()` + `toFormattableDate()` sirven para **formatear** fechas sin hora: se
  anclan al mediodía local, así `formatDayMonth('2025-11-18')` devuelve "Mar 18 Nov" y no
  "Lun 17 Nov".
- `localWeekDays()` devuelve domingo a sábado de la semana local; el calendario de
  tarifas compara por día (`yyyy-mm-dd`), nunca por instante, porque `weekly_fares.date`
  es una columna de tipo `date`.
- El seed construye los horarios como hora de tablero: `utc(18, 6, 45)` guarda el
  instante que en ART **es** 06:45 (09:45Z), no las 06:45 UTC.
- `formatTime()` formatea siempre en ART. Los horarios que muestra la interfaz son
  horarios de local.

## Temas: dos pantallas, un solo Tailwind

`login.html` y `vuelos.html` traían cada uno su `<script id="tailwind-config">` con
tokens incompatibles (por ejemplo `secondary` = `#E11D48` en login y `#BA0035` en
vuelos; `headline-lg` = 24px vs 32px).

Un solo `tailwind.config.ts` compila todas las clases, y los tokens que colisionan se
declaran como custom properties con fallback:

```ts
secondary: 'var(--ag-color-secondary, #e11d48)',
'headline-lg': [ 'var(--ag-fs-headline-lg-size, 24px)', ... ],
```

Cada ruta define sus variables en el scope correcto:

- `src/app/login/layout.tsx` → `<div class="theme-login …">`
- `src/app/vuelos/layout.tsx` → `<div class="theme-vuelos …">`

`globals.css` define `.theme-login` y `.theme-vuelos` con los valores originales de cada
HTML. El resultado es que ambas pantallas conservan su diseño exacto sin duplicar la
configuración de Tailwind.

El `<body>` es único en toda la app, así que las clases que los HTML originales ponían
allí se aplican en el div contenedor de cada layout.

## Server vs Client

- `src/app/vuelos/page.tsx` es un **Server Component**: lee la sesión y carga con Prisma
  la primera tanda de vuelos y tarifas semanales para que la pantalla llegue renderizada.
- `src/app/vuelos/vuelos-client.tsx` es el **Client Component** que maneja el formulario
  de búsqueda, la selección de tarifa y el resumen. Cuando el usuario busca, sí va por
  HTTP contra `/api/flights` y `/api/weekly-fares`.

Separar ambos evita el *loopback* de fetch en el primer render y deja la API como el
camino real para las operaciones del usuario.

## Privacidad de datos personales

El código de reserva (`AG-XXXXXX`) es público y se usa para consultar una reserva sin
sesión, así que conocerlo no puede dar acceso a datos nominales:

- `redactBooking()` (en `src/lib/bookings.ts`) enmascara nombres, documentos, fecha de
  nacimiento, código de check-in, contacto, pagos y notas, y anula `userId`. Se aplica
  **siempre que `canViewBookingPii()` sea falso**, tanto en el listado por `search`
  (`GET /api/bookings`) como en el detalle por código (`GET /api/bookings/:code`). La
  vista conservada sigue siendo operativa: tramos, estado y número de butaca.
- `canViewBookingPii()` exige que el usuario sea el dueño de la reserva o de Operations.
  Los subrecursos (`/passengers`, `/baggage`, `/payments`, `/boarding-passes`) la
  exigen siempre: son datos de viaje nominales.
- `GET /api/aircraft/:id/seats` es público porque el mapa de cabina hace falta para
  reservar, pero los nombres de los pasajeros asignados solo se devuelven a Operations.
  El campo `occupied` alcanza para elegir butaca.

## Decisiones y límites conocidos

- **Sin pasarela de pago**: `POST /api/bookings/:code/payments` marca el pago como
  `APPROVED` sin estar integrado con un gateway real. Es un punto de extensión, no un sistema de
  cobro.
- **Check-in**: `PATCH /api/bookings/:code/passengers/:id` marca `checkInStatus` pero la
  emisión del pase de embarque es un endpoint aparte de Operations.
- **`POST /api/bookings`** usa siempre `passengersCount = 1` y descuenta un asiento por
  vuelo. El flujo de varios pasajeros del diseño todavía no está conectado.
- **Orden por precio**: no se puede ordenar en SQL (depende del mínimo de `flight_fares`),
  así que `GET /api/flights?sort=price` pagina en memoria con un tope duro de 500 filas y
  lo avisa con `pagination.truncated`.
- **Auditoría sin transacción**: `audit()` se ejecuta después del `await` principal y
  nunca hace fallar la operación de negocio si la escritura de auditoría falla.
