# Verificación local de US-08 y US-13

Prueba realizada el 20/10/2026 (ART), en `Manu-Tina`, sin superpowers.
La aplicación y Redis se ejecutan en esta computadora; PostgreSQL es la base Supabase que ya estaba configurada. No se reemplazó por una base local.

## Infraestructura

- Migración `20261021000000_us08_us13` aplicada con `prisma migrate deploy`. Las 11 migraciones están al día.
- Redis 7.4.11 portable, limitado a `127.0.0.1:6379`, con AOF y respuesta PONG comprobada mediante ioredis. No se instalaron servicios, Docker ni WSL.
- Next en `http://localhost:3000`, con las claves Clerk existentes.
- Worker real BullMQ activo (`npm run worker:receipts`), con la clave Resend existente y remitente local de pruebas.
- `.env.local` conserva las variables existentes e incorpora Redis y `RECEIPTS_TEST_RECIPIENT`. Este filtro limita tanto el relay como el procesamiento a la dirección de prueba autorizada. Sin esa variable, el worker procesa todos los pendientes.
- El primer arranque amplio del worker fue rechazado por revisión automática por su posible alcance sobre correos pendientes ajenos a la prueba. Se comprobó que no había pendientes y se agregó el filtro de destinatario; el arranque acotado fue aprobado.

El binario portable está en `tmp/local-runtime/redis/Redis-7.4.11-Windows-x64-msys2/`, ignorado por Git. Para reiniciar Redis desde esa carpeta:

```powershell
.\redis-server.exe --bind 127.0.0.1 --protected-mode yes --port 6379 --appendonly yes --save ""
```

El paquete proviene del [release comunitario Redis Windows 7.4.11](https://github.com/redis-windows/redis-windows/releases/tag/7.4.11). Se verificó SHA256 del ZIP: `EC629971D76756DD040204297F1A92F43848E7A5F4862D39426BEEAFCCA2A2A9`.

## Compras sintéticas y correo real

Se usó una aeronave y un vuelo dedicados, identificados como prueba, sin consumir plazas de vuelos existentes. Al finalizar se marcó el vuelo AG-1706 CANCELLED y su tarifa inactiva para retirarlos del buscador; se conservaron reservas y trazabilidad. Los pagos no representan transacciones comerciales: mostrador registra caja de prueba y web usa la pasarela mock existente.

| Reserva | Flujo | Importe ARS | Comprobantes | Despachos | Intentos | Aceptación desde encolado |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| AG-M9DAGA | Mostrador, Economy manual | 120 (100 + 20) | 2 | 1 | 1 | 7,505 s |
| AG-FQBSRV | Servicio de pago web simulado | 100 | 2 | 1 | 1 | 9,038 s |

Ambas reservas quedaron PAID. Cada solicitud se repitió y devolvió el pago/despacho original, sin duplicados. Quedaron dos plazas disponibles de cuatro. La API pública de asientos devolvió HTTP 200 y mostró 1A/2A ocupados y 3A/4A libres después de las compras.

Los dos despachos quedaron ENVIADO, sin errores, con identificadores de Resend:

- Mostrador: `01a15c52-ba80-76c2-aa53-e61dbae3af9c`.
- Web: `01a15c53-1749-7411-b115-b55330b34cd2`.

Cada envío adjunta `Pasaje_[Codigo].pdf` y `Factura_[Codigo].pdf`, generados desde el snapshot. Se comprobaron firmas PDF y se renderizaron los comprobantes de mostrador para inspección visual.

## Venta por pantalla con sesión real

Después de que el usuario inició sesión y asignó el rol MOSTRADOR en Clerk, se completó también el flujo pantalla → API autenticada → compra/outbox → Redis/BullMQ → worker → Resend real. Se reabrió temporalmente el mismo vuelo sintético, sin cambiar vuelos comerciales.

- La pantalla `/mostrador` permitió buscar BHI–AEP para el 22/10/2026 y seleccionar la tarifa de prueba de AG-1706.
- El mapa mostró 1A y 2A ocupados por las compras previas. Se eligió 3A, con recargo Economy de 20 y total ARS 120.
- El POST autenticado de venta respondió HTTP 201. La pantalla mostró el mensaje de éxito y código `ZGBU7A`.
- La base confirmó reserva PAID, un pago, dos comprobantes, una venta de mostrador y un despacho. Quedó exactamente una plaza libre de cuatro.
- El worker dejó el despacho ENVIADO en el primer intento, sin errores. Resend aceptó el mensaje `01a15c5f-17c8-7011-90a8-d1ac82e4cfcd` a los 6,436 segundos del encolado.
- Se descargaron desde los botones autenticados `pasaje_ZGBU7A.pdf` y `factura_ZGBU7A.pdf` en Downloads. Se verificaron PDFs legibles, código, pasajero sintético, DNI sintético, asiento 3A y total 120.
- Al terminar se volvió a cancelar sólo el vuelo de prueba y desactivar su tarifa para retirarlos del buscador. Se conservaron las tres compras y sus evidencias.

La primera descarga reprodujo un fallo del cliente: abortaba a los 5 segundos aunque el endpoint respondió HTTP 200 a los 5,137 segundos por la compilación inicial de desarrollo. Se amplió el timeout a 30 segundos y se comprobaron ambas descargas por navegador. TypeScript y las ocho pruebas relevantes de comprobantes/mostrador aprobaron después del cambio.

## Autorización y recepción

La navegación sin sesión a `/mostrador` redirigió al login y un POST sin sesión a `/api/v1/mostrador/ventas` devolvió HTTP 401. La sesión inicial sin rol de operador fue redirigida a `/vuelos`, como exige el guard. Tras la actualización de rol realizada por el usuario, se permitió el flujo de mostrador. No se omitió Clerk ni se cambiaron roles desde el script de pruebas.

El usuario confirmó recepción de los correos M9DAGA y FQBSRV, ambos con los dos PDFs. No se registró una hora exacta de recepción y por eso no se demuestra el SLA de inbox de 180 segundos. La tercera compra por pantalla tiene aceptación de Resend comprobada, sin una confirmación adicional de recepción del usuario.

La clave Resend local tiene permiso sólo de envío: las consultas de entrega/adjuntos respondieron 401. El conector de Resend tampoco encontró esos mensajes. El webhook local no quedó expuesto públicamente; no se verificó recepción de eventos reales de entrega/rebote.

Verificación posterior a los ajustes del worker: 216 tests locales aprobados, TypeScript principal y de tests sin errores, y `git diff --check` limpio. Las 11 pruebas PostgreSQL y el build de producción ya habían aprobado en la verificación inicial.

Los archivos de prueba y PDFs están en `tmp/local-runtime/` (ignorados por Git). Este informe describe las pruebas previas a la publicación.

## Verificación final para integrar en main

La suite completa terminó con 225 tests aprobados. Las 11 pruebas PostgreSQL volvieron a pasar y eliminaron su esquema temporal al finalizar. TypeScript principal y de tests no informó errores; Prisma generó su cliente y el build de producción de Next finalizó correctamente. `prisma migrate status` confirmó las once migraciones aplicadas en la base configurada. No se incluyeron secretos, archivos de entorno locales ni artefactos temporales en la integración.

El equipo eligió conservar Redis y el worker locales para la demo de producción. Esa dependencia y su configuración están documentadas en [DESPLIEGUE-US08-US13.md](DESPLIEGUE-US08-US13.md).
