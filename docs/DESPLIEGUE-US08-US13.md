# US-08 y US-13: demo en producción

## Web y base de datos

El proyecto existente `unsaerogestion`, del equipo `pss24`, publica `main` en https://unsaerogestion.vercel.app mediante la integración con GitHub. Se conserva esa integración y la configuración existente de Clerk/PostgreSQL.

La migración `20261021000000_us08_us13` agrega el recargo, las ventas de mostrador y la outbox de comprobantes. Antes de publicar debe ejecutarse `npm run db:migrate:deploy` con la conexión del entorno correspondiente. No ejecutar resets ni seeds sobre la base compartida. La base configurada localmente ya tiene las once migraciones aplicadas.

## Worker local para la demo

Por decisión del equipo, Redis y el worker se mantienen locales. Vercel ejecuta la web; no arranca `workers/receipt-email.ts`. Las ventas confirman la compra y guardan el despacho en PostgreSQL, sin depender de la disponibilidad de Redis. El worker consulta esa misma base cada cinco segundos.

Usar Node 22 o superior y el mismo código publicado. En la computadora que ejecuta el worker, configurar mediante archivos ignorados por Git:

```dotenv
# DATABASE_URL y DIRECT_URL deben apuntar a la misma base que la web desplegada.
REDIS_URL="redis://127.0.0.1:6379"
RESEND_API_KEY="<clave existente de Resend>"
RESEND_FROM="AeroGestión UNS <onboarding@resend.dev>"
# En la demo, limitar al email del titular de la cuenta Resend.
RECEIPTS_TEST_RECIPIENT="<email del titular de Resend>"
```

Con Redis local activo, ejecutar y mantener abierta otra terminal:

```powershell
npm run worker:receipts
```

Redis debe escuchar sólo en localhost. Si se dispone de Docker, `docker compose -f compose.receipts.yml up -d` levanta la instancia prevista. El entorno local de prueba también dispone de Redis portable dentro de `tmp/`, que no se publica en Git.

La computadora y los dos procesos deben seguir encendidos. Si se detienen, los despachos quedan en la outbox y se recuperan al reiniciar. El filtro de destinatario deja pendientes los correos de otras direcciones: no los redirige al titular. El remitente de prueba de Resend sólo permite enviar al titular; para otros destinatarios hace falta un dominio verificado.

Para registrar eventos reales de entrega y rebote también hay que configurar el webhook de Resend hacia `/api/webhooks/resend` y su `RESEND_WEBHOOK_SECRET` en Vercel. Sin esa configuración, el estado ENVIADO acredita aceptación del proveedor, sin confirmar entrega mediante webhook.

## Validación de una publicación

Comprobar el SHA publicado y el estado exitoso del deployment en GitHub. Verificar `/api/health`, la consulta pública de vuelos y que `/mostrador` y su API exijan sesión. Con sesión MOSTRADOR, ingresar por el login y comprobar la redirección a `/mostrador`.

Para una venta de demostración, usar datos sintéticos, un vuelo de prueba y el destinatario autorizado por Resend. Comprobar el total, el medio de pago persistente, la descarga de los dos PDFs y el despacho del worker. Mantener esas pruebas fuera de ventas comerciales.
