# USs-06AB · Avisos por reprogramación y cancelación de vuelos

Subgrupo Mellinger – Recalde – Gutiérrez · Sprint 3 · RF-06.

Cuando el admin reprograma un vuelo (US-11B), cada reserva con pasaje de ese vuelo recibe un
correo con el itinerario anterior y el nuevo (WF-06A). El correo usa la outbox, la cola y el
worker de comprobantes de la US-13, sin duplicar esa lógica.

## US-06A · Correo de reprogramación

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

### Reglas de US-06A

- **Quién recibe:** un correo por reserva, al email de contacto. Solo las reservas con
  pasaje: `PAID`, `CONFIRMED`, `REASIGNADO` o `REPROGRAMADA`. Las compras pendientes de pago no, porque su
  comprobante ya sale con el horario nuevo.
- **Qué lo dispara:** cualquier cambio de fecha, hora, aeronave o ruta guardado desde el
  panel (`PATCH /api/admin/flights/:id/itinerary`) o desde el endpoint previo
  `PATCH /api/flights/:id`.
- **Cambios de reserva:** al confirmar una reasignación o reprogramar una reserva desde la
  consulta se encola `ITINERARY_CHANGE` al correo de contacto.
- **Reservas sin aviso:** si el email no es válido o el código no tiene 6 caracteres (como
  las reservas de demo `AG-DEMOx`), la reserva queda sin aviso pero el cambio se guarda igual.
- **Dos reprogramaciones** del mismo vuelo mandan dos correos, cada uno con su antes y su después.
- **Link «Ver Mi Reserva»:** usa `NEXT_PUBLIC_APP_URL` si está definida y, si no, el origen
  del pedido.

### Modelo de datos de US-06A

Migración `20261108000000_us06a_email_kind`, ya aplicada en la base compartida:

- enum `EmailKind` (`RECEIPT`, `ITINERARY_CHANGE`);
- `email_dispatches.kind`, que por defecto es `RECEIPT` (las filas anteriores son comprobantes);
- `email_dispatches.payment_id` pasa a ser opcional.

## Correo de contacto y comprobantes

El pasaje y la factura se envían al email guardado en la reserva. Ese mismo email figura en
la factura descargable desde la confirmación de venta y en el PDF adjunto. Los avisos de
cancelación y reprogramación usan el correo que está guardado cuando se confirma el cambio.

Mostrador usa la simulación de pago web para tarjeta de crédito y débito. El número ficticio
`1111 1111 1111 1111` simula un rechazo. Un rechazo permite corregir la tarjeta y volver a
intentar. El sistema guarda el medio de pago y el importe de las ventas aprobadas.

## US-06B · Correo de cancelación

Al cancelar un vuelo desde la Planilla, el motor de contingencias genera las propuestas y
se encola un aviso `FLIGHT_CANCELLED` por cada reserva procesada con datos de contacto válidos.
La cancelación, las propuestas y la outbox se guardan en la misma transacción. La clave
`cancel-${flightId}-${bookingId}` evita avisos duplicados. La auditoría registra los conteos
`notifications.queued` y `notifications.skipped`.

El correo sigue el WF-06B. Muestra el vuelo cancelado, la propuesta o «A confirmar por Atención
prioritaria», el motivo oficial y el estado de la reserva. El botón «Ver Mi Reserva» lleva a
`/reserva`. Para resolver la contingencia, el pasajero puede comunicarse con Atención prioritaria.

### Migraciones

Las migraciones de US-12B incorporadas desde `main` registran los estados de contingencia,
el vuelo propuesto y el indicador de reembolso. La migración
[`20261112175000_us12_remaining_reassignment_columns`](../prisma/migrations/20261112175000_us12_remaining_reassignment_columns/migration.sql)
completa los tres campos que usa el motor en `bookings`:

- `vuelo_original_id` (`VARCHAR(30)`) identifica el vuelo afectado.
- `respuesta_pasajero` (`VARCHAR(20)`, por defecto `PENDIENTE`) registra la respuesta.
- `propuesta_motivo` (`VARCHAR(200)`) guarda la explicación de la propuesta.

Las columnas son opcionales y `IF NOT EXISTS` permite aplicar el cambio en bases que ya las
tienen. La migración de US-06B, `20261112180000_us06b_flight_cancelled_email`, agrega
`FLIGHT_CANCELLED` al enum `EmailKind` creado por US-06A.

Las dos migraciones se aplicaron y se verificaron en la base compartida el 12/11/2026.
La migración `20261112200000_booking_cancelled_email` agrega `BOOKING_CANCELLED` para la
cancelación de una reserva individual. En Contingencias, el aviso indica que el reembolso
quedó pendiente.

Aplicar las migraciones pendientes desde `feature6B` y regenerar Prisma:

```sh
npm run db:migrate:deploy
npm run db:generate
```

Actualizar el worker de `npm run worker:receipts` al código que admite `FLIGHT_CANCELLED` y `BOOKING_CANCELLED`
antes de confirmar una cancelación desde el panel.

La prueba de cancelación de `tests/us12-cancellation-reallocation.test.ts` comprueba los avisos
en el PostgreSQL de prueba. `tests/itinerary-email.test.ts` comprueba la plantilla y el despacho
con un proveedor simulado.

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

## Prueba manual

**Preparación**

1. Abrir Docker Desktop y levantar Redis: `docker compose -f compose.receipts.yml up -d`.
2. Completar el `.env` como arriba.
3. Ejecutar `npm ci`, `npm run db:migrate:deploy` y `npm run db:generate`.
4. Levantar dos terminales:
   - `npm run dev`;
   - `npm run worker:receipts`. Tiene que mostrar «Worker activo» y «Modo de prueba».

**US-06A · Reprogramación**

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

**US-06B · Cancelación**

1. Crear una reserva sintética con `RECEIPTS_TEST_RECIPIENT` en un vuelo que tenga una alternativa
   elegible. Anotar el código de reserva.
2. Desde **Planilla del día**, elegir el motivo y arrancar el cronómetro al confirmar la cancelación.
3. Al ver en la bandeja el asunto «ALERTA URGENTE · Vuelo cancelado — Reserva …», anotar el tiempo.
   El criterio de entrega es de hasta tres minutos desde la confirmación.
4. Comparar el vuelo del correo con la propuesta en **Contingencias**. Verificar el motivo, el
   estado y el enlace «Ver Mi Reserva» en escritorio y móvil. Repetir con un vuelo sin alternativa
   y comprobar que muestre «A confirmar por Atención prioritaria».
5. Si el mensaje demora, buscar en Prisma Studio la fila `FLIGHT_CANCELLED` de la reserva.
   `ENVIADO` y `acceptedAt` indican aceptación por Resend. `deliveredAt`, si está configurado
   el webhook, indica aceptación por el servidor de correo del destinatario. Para medir el tiempo
   hasta la bandeja, usar el registro del paso 3.

## Pruebas automáticas

`npx tsx --test tests/itinerary-email.test.ts tests/itinerary-notices.test.ts` corre sin base
de datos ni envíos reales. Cubre:

- las plantillas WF-06A y WF-06B, la hora ART, el escape de HTML y el aviso sin alternativa;
- el proveedor (sin adjuntos y con clave estable);
- el `processor` (elige la plantilla según `kind`; un aviso inválido falla sin reintentos);
- el armado del aviso por reserva y el link.

Los tests de la US-13 siguen pasando.
