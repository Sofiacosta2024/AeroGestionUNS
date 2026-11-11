# US-06A · Aviso por email al reprogramar un vuelo

Subgrupo Mellinger – Recalde – Gutiérrez · Sprint 3 · RF-06.

Cuando el admin reprograma un vuelo (US-11B), cada reserva con pasaje de ese vuelo recibe un
correo con el itinerario anterior y el nuevo (WF-06A). El correo usa la outbox, la cola y el
worker de comprobantes de la US-13, sin duplicar esa lógica.

## Cómo funciona

1. **Guardar el cambio.** `rescheduleFlight` (`src/lib/scheduling/reschedule.ts`) guarda el
   nuevo itinerario y, en la misma transacción, `notifyFlightRescheduled`
   (`src/lib/scheduling/itinerary-notices.ts`) encola una fila en `email_dispatches` con
   `kind = ITINERARY_CHANGE` por cada reserva. Si el cambio no se guarda, no sale ningún aviso.
2. **Enviar.** El worker de la US-13 (`npm run worker:receipts`) publica los pendientes cada
   5 s y los envía por Resend. Usa el mismo *lease*, los mismos 4 intentos y el mismo webhook
   de entrega que los comprobantes. El `processor` elige la plantilla según `kind`.
3. **Contenido.** El correo (`src/lib/email/itinerary-template.ts`) sigue el WF-06A:
   - banner «⚠ Tu vuelo fue reprogramado», saludo y código de reserva;
   - tabla Anterior (tachado en rojo) / Nuevo (en verde) con Fecha, Salida y Llegada en hora
     argentina. Vuelo, Ruta y Aeronave aparecen solo si cambian. Lo que no cambió va sin tachar;
   - botón «Ver Mi Reserva», que lleva a `/reserva` (US-14A).
4. **Registro.** La pantalla de reprogramación y la auditoría (`RESCHEDULE`) informan
   cuántos avisos se encolaron (`notifications.queued`) y cuántas reservas quedaron sin aviso
   (`notifications.skipped`).

## Reglas

- **Quién recibe:** un correo por reserva, al email de contacto. Solo las reservas con
  pasaje: `PAID`, `CONFIRMED` o `REASIGNADO`. Las compras pendientes de pago no, porque su
  comprobante ya sale con el horario nuevo.
- **Qué lo dispara:** cualquier cambio de fecha, hora, aeronave o ruta guardado desde el
  panel (`PATCH /api/admin/flights/:id/itinerary`) o desde el endpoint previo
  `PATCH /api/flights/:id`.
- **Qué todavía no lo dispara:** cancelar un vuelo y reasignar a sus pasajeros (US-12A/12B).
  Ver [Para la US-12B](#para-la-us-12b-marcos-avisar-al-reasignar-pasajeros).
- **Reservas sin aviso:** si el email no es válido o el código no tiene 6 caracteres (como
  las reservas de demo `AG-DEMOx`), la reserva queda sin aviso pero el cambio se guarda igual.
- **Dos reprogramaciones** del mismo vuelo mandan dos correos, cada uno con su antes y su después.
- **Link «Ver Mi Reserva»:** usa `NEXT_PUBLIC_APP_URL` si está definida y, si no, el origen
  del pedido.

## Modelo de datos

Migración `20261108000000_us06a_email_kind`, ya aplicada en la base compartida:

- enum `EmailKind` (`RECEIPT`, `ITINERARY_CHANGE`);
- `email_dispatches.kind`, que por defecto es `RECEIPT` (las filas anteriores son comprobantes);
- `email_dispatches.payment_id` pasa a ser opcional.

## Para la US-12B (Marcos): avisar al reasignar pasajeros

**Estado al 2026-11-11: pendiente, lo hace el equipo de la US-12B.** Hoy, cancelar un vuelo
(US-12A) y reasignar sus pasajeros (US-12B) **no manda ningún correo**. La reserva pasa a
`REASIGNADO`, la auditoría registra `PASSENGERS_REASSIGNED` y la outbox no recibe ninguna fila
`ITINERARY_CHANGE`. Se verificó con una compra de prueba.

La función de la US-06A ya está lista: `notifyBookingRescheduled`, en
`src/lib/scheduling/itinerary-notices.ts`. Solo falta llamarla desde la reasignación.

**Dónde va.** Va en `reprogramarPasajeros` de `src/lib/contingencias.ts`, dentro del
`prisma.$transaction`, después del paso «4. Marcar todas las reservas como REASIGNADO». Tiene que
ir en esa misma transacción para que el aviso solo se encole si la reasignación se guarda.

```ts
import { notifyBookingRescheduled } from '@/lib/scheduling/itinerary-notices';

// Dentro del $transaction, después de marcar REASIGNADO:
for (const b of bookingsToReassign) {
  await notifyBookingRescheduled(tx, {
    bookingId: b.id,
    fromFlightId: oldFlight.id, // vuelo cancelado: columna «Anterior» del correo
    toFlightId: newFlight.id,   // vuelo nuevo: columna «Nuevo»
    origin,                     // base del link «Ver Mi Reserva»
  });
}
```

**De dónde sale `origin`.** `reprogramarPasajeros` hoy no lo recibe. Hay que agregarle el
parámetro `origin: string`. El handler `src/app/api/admin/vuelos/[id]/reprogramar-pasajeros/route.ts`
le pasa `new URL(req.url).origin`, igual que la US-11B. Si `NEXT_PUBLIC_APP_URL` está definida,
el link usa esa variable.

**Qué más tener en cuenta**

- Cada llamada devuelve `{ queued, skipped }`. Se puede sumar y devolver en el resultado o en la
  auditoría, como hace la US-11B con `notifications`. Es opcional.
- `REASIGNADO` cuenta como reserva con pasaje (`TICKETED_STATUSES`). Si después la US-11B
  reprograma el vuelo nuevo, esa reserva también recibe aviso.
- Una reserva con email inválido o código de demo (`AG-DEMOx`) devuelve `skipped: 1`. No tira
  error ni frena la reasignación.
- No hay que tocar nada más: el worker de la US-13 manda el correo.

**Cómo verificarlo**

1. Comprar un pasaje con el email de `RECEIPTS_TEST_RECIPIENT`.
2. Cancelar ese vuelo desde la Planilla.
3. Reasignar los pasajeros a otro vuelo desde `/admin/contingencias/:id`.
4. En `email_dispatches` tiene que aparecer una fila `ITINERARY_CHANGE` por reserva.
5. Con el worker corriendo, llega el correo con el vuelo cancelado tachado y el nuevo en verde.

## Para la US-06B (correo de cancelación)

Se puede seguir el mismo camino:

1. Agregar `FLIGHT_CANCELLED` a `EmailKind`, con su migración.
2. Crear un snapshot y una plantilla propios, como `itinerary-snapshot.ts` e `itinerary-template.ts`.
3. Agregar una rama en `processor.ts`.
4. Enviar con `sendEmail` de `provider.ts`.

## Configuración (`.env` o `.env.local`, sin commitear)

```dotenv
RESEND_API_KEY="<clave de Resend>"
REDIS_URL="redis://127.0.0.1:6379"
# Sin dominio verificado, Resend solo entrega al titular de la cuenta.
RECEIPTS_TEST_RECIPIENT="<email del titular de la cuenta de Resend>"
# Opcional: base del link «Ver Mi Reserva».
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

> **Importante:** corré el worker siempre con `RECEIPTS_TEST_RECIPIENT`. En la outbox hay
> comprobantes viejos pendientes para mails de otras personas. Sin ese filtro, el worker
> intentaría enviarlos y quedarían FALLIDO.

Quien corra el worker tiene que tener este código. Un worker anterior a la US-06A marcaría
FALLIDO los avisos que tome.

## Prueba manual

**Preparación**

1. Abrir Docker Desktop y levantar Redis: `docker compose -f compose.receipts.yml up -d`.
2. Completar el `.env` como arriba.
3. Instalar: `npm ci` y `npx prisma generate`.
4. Levantar dos terminales:
   - `npm run dev`;
   - `npm run worker:receipts`. Tiene que mostrar «Worker activo» y «Modo de prueba».

**Caso principal**

1. **Comprar.** Como pasajero, entrar a `/vuelos`, elegir un vuelo futuro y un asiento. En la
   pantalla de pago, poner en «Email de confirmación» el mail de la cuenta de Resend. Pagar con
   una tarjeta de 16 dígitos que no sean todos «1» (por ejemplo `4242424242424242`), que el
   mock aprueba. Llega también el correo del comprobante (US-13).
2. **Reprogramar.** Como admin, ir a la Planilla del día de ese vuelo, «Reprogramar» y cambiar
   la hora de salida. El aviso amarillo tiene que decir «Este cambio notificará por email a 1
   pasajero…».
3. **Guardar.** Tocar «Actualizar Itinerario del Vuelo». El panel verde tiene que decir «Se
   encoló el aviso por email a 1 reserva (1 pasajero)».
4. **Ver la fila.** En `npx prisma studio`, `email_dispatches` tiene que tener una fila con
   `kind = ITINERARY_CHANGE` que pasa de PENDIENTE a ENVIADO en segundos.
5. **Ver el correo.** En la bandeja (≤ 3 minutos):
   - asunto «Reserva XXXXXX — Tu vuelo fue reprogramado»;
   - la hora anterior tachada y la nueva en verde, en hora argentina;
   - la fecha sin tachar si no cambió.
6. **Ver la reserva.** «Ver Mi Reserva» abre `/reserva`. Con el código y el apellido, el vuelo
   tiene que mostrar la hora nueva.

**Otros casos**

- **Vuelo sin reservas con pasaje:** el aviso dice que no hay pasajeros y no se encola nada.
- **Reprogramar dos veces:** llegan dos correos.
- **Cambiar la fecha:** la fila Fecha aparece tachada y en verde. Si solo cambia la hora, la
  fecha sale sin tachar.
- **Worker apagado:** apagar el worker, reprogramar y volver a levantarlo. El correo sale igual
  porque estaba en la outbox.
- **Compra sin pagar:** una reserva pendiente no recibe aviso.

Las compras de prueba quedan en la base compartida: usar datos sintéticos.

## Pruebas automáticas

`npx tsx --test tests/itinerary-email.test.ts tests/itinerary-notices.test.ts` corre sin base
de datos ni envíos reales. Cubre:

- la plantilla (WF-06A, hora ART, filas que cambian o no, escape de HTML);
- el proveedor (sin adjuntos y con clave estable);
- el `processor` (elige la plantilla según `kind`; un aviso inválido falla sin reintentos);
- el armado del aviso por reserva y el link.

Los tests de la US-13 siguen pasando.
