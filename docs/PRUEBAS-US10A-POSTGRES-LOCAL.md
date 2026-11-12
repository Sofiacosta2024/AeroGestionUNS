# PostgreSQL local para pruebas US-10A

Este entorno es exclusivo para pruebas de integración. No usa Supabase, `.env.local`, `DATABASE_URL` de producción ni `DIRECT_URL` de producción.

## Requisitos

- Docker Desktop o Docker Engine con Compose v2.
- Node.js 22 o superior.
- Copiar `.env.test.example` a `.env.test` y cambiar únicamente los valores locales de ejemplo. `.env.test` está ignorado por Git.

## Configuración

Valores por defecto:

| Variable | Valor |
| --- | --- |
| `POSTGRES_TEST_HOST` | `127.0.0.1` |
| `POSTGRES_TEST_PORT` | `55432` |
| `POSTGRES_TEST_DB` | `aerogestion_us10a_test` |
| `POSTGRES_TEST_USER` | `aerogestion_us10a_test` |
| `POSTGRES_TEST_PASSWORD` | definida solo en `.env.test` |

La URL que usa el runner se construye desde esas variables y se muestra con la contraseña oculta:

```text
postgresql://aerogestion_us10a_test:REDACTED@127.0.0.1:55432/aerogestion_us10a_test?schema=public
```

## Comandos

```powershell
Copy-Item .env.test.example .env.test
npm run db:test:up
npm run db:test:status
npm run db:test:check
npm run db:test:prepare
npm run test:integration:us10a:safety
npm run test:integration:us10a:smoke
```

Detener sin borrar datos:

```powershell
npm run db:test:down
```

Detener y borrar el volumen exclusivo de test:

```powershell
npm run db:test:reset
```

`db:test:prepare` aplica las migraciones de Prisma únicamente después de validar host, puerto, base, usuario y contraseña. Si la URL no es la base local de test, el proceso aborta antes de ejecutar Prisma.

No usar `npm run test:db:receipts` para estas pruebas: ese harness carga `.env.local` y `.env`.

## Aislamiento

- El contenedor publica PostgreSQL solo en `127.0.0.1`.
- El volumen se llama `aerogestion-us10a-pgdata` y no comparte datos con otros entornos.
- El runner carga exclusivamente `.env.test`.
- `prisma.config.ts` omite `.env` y `.env.local` cuando `AEROGESTION_TEST_DB=1`.
- `tests/integration/us10a/harness.ts` exige `NODE_ENV=test`, `AEROGESTION_TEST_DB=1` y `US10A_TEST_DB=1`, y valida nuevamente la URL antes de crear el cliente Prisma.
- `resetTestDatabase()` trunca solo las tablas del esquema `public` de esa base local, conservando `_prisma_migrations`.

## Harness disponible

`tests/integration/us10a/harness.ts` permite:

- reiniciar y limpiar datos de prueba;
- crear dos usuarios de test diferenciados;
- crear aeropuertos, ruta, aeronave, asientos, tarifa y vuelo;
- consultar reservas y bloqueos por vuelo;
- cerrar la conexión de Prisma.

`tests/integration/us10a/http.ts` agrega `postJson()` para llamar endpoints HTTP reales solo contra `localhost`/`127.0.0.1`, con headers de autenticación provistos por el test.

`tests/integration/us10a/db-smoke.test.ts` comprueba que el harness puede inicializar, sembrar y limpiar la base local. Todavía no implementa la colisión web/móvil.

## Autenticación para la prueba futura

No se modifica la autenticación de producción.

Estrategia recomendada: usar una instancia Clerk de test con dos usuarios de prueba y ejecutar la aplicación Next contra la base local, haciendo HTTP real. Las claves de esa instancia Clerk de test irían solo en `.env.test` o en el entorno del proceso de test, nunca en `.env.local`.

Alternativa: invocar los Route Handlers en un proceso de test y reemplazar únicamente el módulo `@clerk/nextjs/server` en el límite del test para devolver identidades deterministas. El mock no debe formar parte de `src/` ni de la configuración de producción.

El bloqueo web permite usuario anónimo; la reserva móvil exige autenticación. La prueba futura debe usar dos identidades distintas y verificar:

1. bloqueo web exitoso sobre un asiento;
2. `POST /api/v1/mobile/reservas` con el mismo asiento;
3. HTTP 409 con cuerpo `SEAT_UNAVAILABLE`;
4. una sola reserva y un solo bloqueo en la base local.

## Limitaciones actuales

- La infraestructura no pudo arrancarse ni conectarse en el entorno de preparación porque Docker no está instalado en esa máquina.
- No se implementó todavía la prueba completa de colisión web/móvil.
- No hay harness de autenticación HTTP para Clerk; la estrategia está documentada arriba.
