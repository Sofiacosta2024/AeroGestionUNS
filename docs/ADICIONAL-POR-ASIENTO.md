# Adicional fijo por tarifa

Implementado directamente sobre `main`, actualizado a `ff87541`, sin superpowers.

## Configuración y cobro

El administrador entra a `/admin/tarifas` desde **Adicionales por asiento**. Cada tarifa Economy tiene un campo independiente, con importes en formato argentino, y un botón Guardar. Premium y Primera muestran la elección incluida, sin campo de recargo. El valor se aplica por pasajero en todos los vuelos que usan esa tarifa. Se permiten cero y hasta dos decimales. Los errores aparecen debajo del campo; un fallo de guardado conserva la edición para reintentar.

La pantalla usa el PATCH de tarifas existente, restringido a ADMIN y auditado. No se creó otro campo ni hace falta una migración: se utiliza `Fare.seatSelectionFee`.

Web y Mostrador usan la misma regla de precios: elección manual en Economy = adicional configurado × pasajeros; asignación automática = sin recargo. El valor 0 deja la elección Economy incluida. Premium y Primera no llevan adicional, aunque el catálogo contenga un valor. Se quitaron los importes fijos por filas especiales de la web.

El servidor calcula el total con Decimal y guarda tanto el adicional como el precio base en la reserva. El cliente web envía el total mostrado para detectar cambios de precio antes de reservar. No puede eliminar el cargo solicitando AUTO a través de esa API. Las compras y los snapshots de comprobantes anteriores conservan sus importes aunque después cambie el catálogo.

## Correos

Por indicación posterior del usuario se conserva la configuración de correo anterior, sin cambiar la cuenta Resend ni el destinatario de prueba de Bart. No se requiere configurar el mail de la comisión.

## Verificación

245 pruebas locales aprobaron, incluyendo los importes guardados, la igualdad entre canales, las distintas filas, el adicional cero, el control de cotizaciones anteriores, la conservación de derechos de selección ya contratados y la validación del administrador. TypeScript principal y de tests sin errores. Las 12 pruebas PostgreSQL aprobaron en un esquema temporal aislado, eliminado al finalizar; verificaron también que cambiar la tarifa no altera compras ni snapshots existentes.

La prueba de contingencias US-12 incorporada en main requiere la base compartida: al ejecutar la suite general falló en su primera consulta por falta de conectividad, sin escribir datos. Se excluyó de la suite local posterior y no se ejecutó sobre la base compartida.

El formulario real se probó en navegador con tarifas ficticias y una API simulada: validación bajo el campo, guardado con centavos, importe cero, recuperación tras error y vista móvil sin desbordamiento. Las pruebas PostgreSQL comprueban la persistencia real del cálculo; la prueba de interfaz no reemplaza el inicio de sesión con ADMIN.

Después de la aclaración de que el cargo sólo corresponde a Economy, se repitieron tres casos PostgreSQL aislados: competencia web/Mostrador por la última plaza, selección Economy/Premium/Primera y conservación de importes al cambiar la tarifa. Pasaron incluso con adicionales residuales en las clases incluidas. La compilación final de producción también terminó correctamente.
