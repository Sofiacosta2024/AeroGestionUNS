# Verificación previa a US-08 y US-13

Fecha local: 20/10/2026. Rama: Manu-Tina. Base: 7289fae (origin/main incorporado).

## Base y Prisma

- Consulta remota de migraciones completada: las 10 migraciones de main están aplicadas.
- Comparación del esquema real con el esquema de main: `No difference detected` (exit 0).
- Prisma CLI y @prisma/client: 6.19.3 ambos. Esquema validado y cliente regenerado correctamente.
- Existe una migración NUEVA en borrador, `20261021000000_us08_us13`, sin aplicar. Su aparición como pendiente es esperada: fue creada al comenzar la implementación, antes de la solicitud de priorizar esta verificación.
- No se aplicaron migraciones ni se alteraron datos de la base durante esta revisión.

## Instalación y configuración

- `npm ls --depth=0` completó sin dependencias faltantes o inválidas.
- Instaladas las dependencias previstas para US-13: bullmq 6.3.19, ioredis 6.0.0 y svix 2.8.0. BullMQ usa la misma instalación de ioredis (deduplicada).
- Node 24.14.0; npm 11.13.0; Next instalado 15.5.27.
- Variables presentes: DATABASE_URL, DIRECT_URL, claves pública/privada Clerk y RESEND_API_KEY. Presencia no implica validación de credenciales del proveedor.
- Variables pendientes para US-13: REDIS_URL, RESEND_FROM y RESEND_WEBHOOK_SECRET. También falta MOSTRADOR_BRANCH_NAME para explicitar sucursal.
- No se enviaron emails reales. No se verificó conectividad Redis porque no está configurado.

## Comprobaciones del código original

Se verificó una copia de HEAD sin los cambios nuevos de funcionalidad, utilizando las dependencias instaladas; los fallos siguientes son previos a US-08/13.

- Build Next de producción: finalizó exitosamente (exit 0). Primer intento restringido falló por EPERM; el segundo, con permisos ampliados, completó compilación, generación de páginas y trazas.
- TypeScript independiente: falla en `tests/unit/public-booking-detail-render.test.tsx:69` porque falta la prop obligatoria `onReprogrammed` al renderizar ReservaDetalle.
- Tests: cuatro fallos en la suite completa. Uno en `tests/integration.test.ts:30` (límite de vigencia del cronograma) y tres en `tests/unit/middleware-routes.test.ts:38,45,62` (expectativas de rutas protegidas frente a wildcards públicos actuales). El build exitoso no sustituye estas comprobaciones.
- `npm test` sólo ejecuta tests de primer nivel; para la revisión se incluyeron también `tests/unit/*.test.ts` y `tests/unit/*.test.tsx`.

## Auditoría de dependencias

`npm audit --json` informó 12 vulnerabilidades: 9 high, 3 moderate, ninguna critical. Involucran dependencias de Prisma, Tailwind y el PostCSS interno de Next. Algunas soluciones propuestas cambian versiones mayores de Next/Tailwind. No se ejecutó `npm audit fix --force` ni se migró el stack automáticamente.

## Resultado

La base y las migraciones previas están sincronizadas, y la instalación/cliente Prisma quedaron actualizados respecto del proyecto. No se puede declarar una línea base completamente verde: quedan los fallos de tests/TypeScript y la auditoría arriba descritos. La implementación funcional se detuvo al recibirse la instrucción de verificar primero; los cambios iniciados permanecen como borrador local, sin commit ni push.
