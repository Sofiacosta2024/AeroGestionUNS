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
| Autenticación | Clerk + perfiles y roles en Prisma |

---

## Puesta en marcha

```bash
npm install
cp .env.example .env      # y completar DATABASE_URL, DIRECT_URL y las claves de Clerk
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
| `DIRECT_URL` | sí | Conexión directa a PostgreSQL para migraciones. |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | sí | Clave pública del proyecto Clerk. |
| `CLERK_SECRET_KEY` | sí | Clave secreta del mismo proyecto Clerk. |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` | sí | `/login`. |
| `NEXT_PUBLIC_CLERK_SIGN_UP_URL` | sí | `/sign-up`. |
| `NEXT_PUBLIC_SUPABASE_URL` | no | URL del proyecto Supabase. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | no | Clave publicable de Supabase. |
| `MIN_DEPARTURE_GAP_MINUTES` | no | Minutos mínimos entre dos salidas del mismo aeropuerto (RF-01). Por defecto 20. |
| `MIN_TURNAROUND_MINUTES` | no | Minutos mínimos entre el aterrizaje de un avión y su siguiente despegue (RF-01). Por defecto 120. |

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

El seed crea tres perfiles locales sin contraseña. El acceso se realiza con cuentas de Clerk; al ingresar con el mismo email verificado se vincula el perfil.

| Email | Rol | Legajo |
| --- | --- | --- |
| `pasajero@uns.edu.ar` | `PASAJERO` | `UNS-2025-4417` |
| `mostrador@uns.edu.ar` | `MOSTRADOR` | `UNS-LEJ-0088` |
| `admin@uns.edu.ar` | `ADMIN` | `UNS-LEJ-0001` |

El rol jerárquico es `ADMIN` > `MOSTRADOR` > `PASAJERO`; cada endpoint de escritura
declara el mínimo requerido. Hay una reserva de ejemplo con código `AG-DEMO01`.

Configurar los roles `ADMIN`, `MOSTRADOR` o `PASAJERO` en los metadatos públicos de Clerk y exponerlos en el claim de sesión `metadata.role` (por ejemplo, con `"metadata": "{{user.public_metadata}}` en la configuración del token de sesión). Si no se recibe ese claim, el rol es `PASAJERO`.

Estos datos son de prueba. La integración no ejecuta migraciones ni carga el seed sobre una base compartida.

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
    (auth)/              login y registro con Clerk
    vuelos/              motor de búsqueda
    api/                 39 Route Handlers
  lib/
    api.ts               envoltorio de handlers, errores HTTP y parseo
    audit.ts             auditoría no bloqueante
    auth.ts              identidad de Clerk, perfiles Prisma y RBAC
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
- [`docs/RF-01-ALTA-VUELOS.md`](docs/RF-01-ALTA-VUELOS.md) — qué se hizo en RF-01 (alta y publicación de vuelos) y qué tienen que saber los demás subgrupos.

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
