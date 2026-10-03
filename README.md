# AeroGestión UNS

Sistema de gestión aérea del Departamento de Ciencias e Ingeniería de la Computación
de la Universidad Nacional del Sur. Monorepo Next.js (App Router) con API propia,
PostgreSQL y Prisma.

`BHI // AIRPORT OPS` · versión 2.4.0

---

## Stack

| Capa | Tecnología |
| --- | --- |
| Frontend + API | Next.js 15 (App Router, Route Handlers), React 19, TypeScript |
| Base de datos | PostgreSQL + Prisma 6 |
| Estilos | Tailwind CSS 3.4 (compilado) con tokens por página |
| Validación | Zod |
| Passwords | bcrypt |

---

## Puesta en marcha

```bash
npm install
cp .env.example .env      # y completar DATABASE_URL
npm run db:generate
npm run db:migrate:deploy
npm run db:seed
npm run dev
```

La aplicación queda en `http://localhost:3000`:

- `/login` — portal de autenticación (diseño de `login.html`).
- `/vuelos` — motor de búsqueda de vuelos (diseño de `vuelos.html`).
- `/admin/vuelos/nuevo` — alta y publicación de vuelos (RF-01, solo `ADMIN`).
- `/admin/itinerario` — planilla del día y borradores pendientes (RF-01, solo `ADMIN`).
- `/` — redirige a `/vuelos` si hay sesión, a `/login` si no.

### Variables de entorno

| Variable | Obligatoria | Descripción |
| --- | --- | --- |
| `DATABASE_URL` | sí | Conexión PostgreSQL de Prisma (`schema.prisma`, `url = env("DATABASE_URL")`). |
| `AUTH_SECRET` | en producción | Secreto de la aplicación. |
| `NEXT_PUBLIC_SUPABASE_URL` | no | URL del proyecto Supabase. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | no | Clave publicable de Supabase. |
| `DEMO_MODE` | no | Habilita el botón **Acceso demo** del login. **Poner `false` en producción.** |
| `MIN_DEPARTURE_GAP_MINUTES` | no | Minutos mínimos entre dos salidas del mismo aeropuerto (RF-01). Por defecto 20. |

`AUTH_SECRET` se genera con `openssl rand -base64 32`.

> `.env` está en `.gitignore`. Nunca versionar credenciales.

### Scripts

| Comando | Descripción |
| --- | --- |
| `npm run dev` | Servidor de desarrollo. |
| `npm run build` | `prisma generate` + build de producción. |
| `npm run start` | Sirve el build de producción. |
| `npm run typecheck` | `tsc --noEmit`. |
| `npm run lint` | ESLint de Next. |
| `npm run db:generate` | Genera el cliente Prisma. |
| `npm run db:migrate` | Crea y aplica una migración en desarrollo. |
| `npm run db:migrate:deploy` | Aplica migraciones existentes (producción). |
| `npm run db:seed` | Carga los datos de demostración. Es idempotente. |
| `npm run db:reset` | Resetea la base y vuelve a correr migraciones + seed. |
| `npm run db:studio` | Prisma Studio. |

---

## Usuarios de demostración

El seed crea tres usuarios con la contraseña **`AeroGestion2025!`**:

| Email | Rol | Legajo |
| --- | --- | --- |
| `pasajero@uns.edu.ar` | `PASAJERO` | `UNS-LEJ-0000` |
| `mostrador@uns.edu.ar` | `MOSTRADOR` | `UNS-LEJ-0002` |
| `admin@uns.edu.ar` | `ADMIN` | `UNS-LEJ-0001` |

El rol jerárquico es `ADMIN` > `MOSTRADOR` > `PASAJERO`; cada endpoint de escritura
declara el mínimo requerido. Hay una reserva de ejemplo con código `AG-DEMO01`.

Estos datos son de prueba: rotar la contraseña y borrar la reserva antes de usar
cualquier base que exponga datos reales.

---

## Acceso demo (saltar el login)

La pantalla de login incluye un botón **Acceso demo** que abre sesión con el usuario de
ejemplo del perfil elegido, sin escribir la contraseña. La contraseña nunca viaja al
navegador: la sesión se crea en el servidor.

- `GET /api/auth/demo` informa si está habilitado; el botón solo se dibuja si lo está.
- `POST /api/auth/demo` con `{ "role": "PASAJERO" | "MOSTRADOR" | "ADMIN" }` crea la
  sesión y deja el evento en `audit_logs` como `LOGIN_DEMO`.

Está activo mientras `DEMO_MODE` no sea `false` (en `.env` queda en `true`). **Es un
acceso sin autenticar: poné `DEMO_MODE="false"` antes de publicar la aplicación**, o el
botón desaparecerá y el endpoint responderá `404`.

---

## Estructura

```
prisma/
  schema.prisma          20 modelos, 16 enums
  migrations/            migración inicial + migraciones de RF-01
  seed.ts                datos de demostración (idempotente)
src/
  app/
    layout.tsx           layout raíz + fuentes
    page.tsx             redirección raíz
    login/               portal de autenticación
    vuelos/              motor de búsqueda
    api/                 39 Route Handlers
  lib/
    api.ts               envoltorio de handlers, errores HTTP y parseo
    audit.ts             auditoría no bloqueante
    auth.ts              sesiones, bcrypt y RBAC
    bookings.ts          include/serialización/redacción de reservas
    dates.ts             filtros por día en ART
    fares.ts
    flights.ts           include/serialización de vuelos
    format.ts            importes, horarios y fechas (ART)
    prisma.ts            cliente Prisma singleton
    scheduling/          programación de vuelos (RF-01): reglas, repositorio y servicio
    validation.ts        schemas Zod
    view-models.ts       formas de datos que cruzan a React
  tailwind (config.ts)   tokens compilados + variables por página
docs/
  ARQUITECTURA.md        decisiones de diseño
  API.md                 referencia de endpoints
  MODELO-DATOS.md        modelo de datos
```

---

## Documentación

- [`docs/ARQUITECTURA.md`](docs/ARQUITECTURA.md) — capas, sesión, zona horaria, temas.
- [`docs/API.md`](docs/API.md) — los endpoints, convenciones y ejemplos.
- [`docs/MODELO-DATOS.md`](docs/MODELO-DATOS.md) — las 20 tablas, sus claves y decisiones.

---

## Seguridad

- **Sesiones opacas**: el token viaja en la cookie `ag_session` (HttpOnly, SameSite=Lax,
  `Secure` en producción) y en la base solo se guarda su SHA-256. Robar la tabla
  `sessions` no permite suplantar a nadie.
- **Passwords**: bcrypt con costo 12.
- **RBAC**: `requireUser` / `requireRole` en cada handler de escritura.
- **Precios en el servidor**: `POST /api/bookings` ignora cualquier importe enviado por
  el cliente y resuelve el precio desde `flight_fares`.
- **Sobreventa**: el descuento de asientos usa `updateMany` condicional dentro de una
  transacción, así que dos reservas concurrentes no pueden sobrevender.
- **Datos personales**: el código de reserva es público, por eso
  `GET /api/bookings?search=AG-XXXXXX` sin sesión devuelve la vista redactada
  (`src/lib/bookings.ts`) y los pases de embarque exigen sesión y propiedad de la reserva.
- **Auditoría**: toda escritura registra quién y qué en `audit_logs`.
- **Acceso demo**: existe para demos y desarrollo. Es un bypass de autenticación, por eso
  `DEMO_MODE="false"` lo desactiva por completo (botón oculto y endpoint en `404`).
