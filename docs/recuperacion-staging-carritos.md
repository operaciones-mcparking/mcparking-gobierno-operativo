# Staging Supabase para carritos perdidos

## Objetivo

Este staging guardara carritos perdidos, reservas incompletas y cancelaciones importadas desde `BackendIncompleteBookings2`.

La finalidad es poder cruzar esos eventos con:

- compras posteriores importadas desde `mcp_Buchungen.csv`;
- seguimiento de mensajes WhatsApp;
- conversaciones o respuestas del cliente;
- futuras reglas de atribucion de recuperacion.

## Estado actual

Actualmente existe:

- plantilla documentada para `BackendIncompleteBookings2`;
- validador local de CSV;
- endpoint backend de validacion;
- UI en `/recuperacion` con preview seguro;
- validacion correcta del CSV real n8n.

Todavia no existe guardado real en Supabase para carritos perdidos.

## Estrategia de batches

Se recomienda reutilizar la tabla:

`recovery_import_batches`

con:

`import_type = 'incomplete_bookings_csv'`

Esto permite mantener un historial comun de importaciones, hashes de archivo, estados y auditoria basica.

Importante: el constraint actual de `recovery_import_batches.import_type` permite solo `purchases_csv`. Una migracion futura debe ampliarlo para aceptar `incomplete_bookings_csv`.

## Tabla futura

Tabla propuesta:

`public.recovery_incomplete_bookings_import`

Columnas sugeridas:

| Columna | Uso |
|---|---|
| `id` | Identificador interno. |
| `batch_id` | Referencia a `recovery_import_batches`. |
| `source_id` | Columna `id` del CSV/n8n. |
| `booking_id` | Identificador de reserva incompleta/cancelada. |
| `email_normalized` | Email normalizado para matching. |
| `phone_normalized` | Telefono normalizado para matching. |
| `type` | Tipo del evento: `abandoned` o `canceled`. |
| `parking_code` | Codigo de parking normalizado. |
| `form_datetime` | Fecha principal del carrito o formulario. |
| `message_sent` | Indicador normalizado de mensaje enviado. |
| `message_id` | Id de mensaje WhatsApp si existe. |
| `created_at_source` | Fecha de creacion en la fuente. |
| `updated_at_source` | Fecha de actualizacion en la fuente. |
| `row_hash` | Hash de fila normalizada. |
| `created_at` | Fecha de insercion en staging. |

`source_id` viene desde la columna `id` del CSV/n8n.

`booking_id` puede ser `not null` en el MVP porque el CSV real lo trae completo y el validador lo considera obligatorio. Si en el futuro aparece una fuente incompleta, esas filas deberian omitirse o quedar como invalidas antes de insertar.

## PII y minimizacion

Guardar solo:

- `email_normalized`;
- `phone_normalized`;
- ids de fuente;
- fechas;
- `type`;
- `parking_code`;
- `message_id`;
- `row_hash`.

No guardar inicialmente:

- email raw;
- telefono raw;
- `cms_url`;
- `bform`;
- CSV completo;
- raw payload;
- links completos;
- mensajes personales.

Aunque email y telefono esten normalizados, siguen siendo PII operativa. La tabla debe quedar restringida a administradores.

## Deduplicacion

Reglas recomendadas:

- `file_hash` detecta archivo ya importado.
- `row_hash` detecta fila normalizada repetida.
- `source_id` manda como llave principal de deduplicacion.
- `booking_id` y `message_id` son duplicados probables.
- Si `source_id` ya existe en un batch importado, omitir.
- Si el mismo `source_id` viene con `row_hash` distinto, reportar conflicto y no sobrescribir.
- No contar `message_id null` como duplicado.

Constraints e indices sugeridos:

- `unique(batch_id, source_id)`;
- indice unico parcial `(batch_id, row_hash) where row_hash is not null`;
- indices en `batch_id`, `source_id`, `booking_id`, `message_id`, `email_normalized`, `phone_normalized`, `form_datetime`, `type` y `row_hash`.

## Estados

Reutilizar estados de batch:

- `validated`: archivo validado o batch preparado.
- `importing`: importacion en curso.
- `imported`: filas normalizadas guardadas correctamente.
- `failed`: validacion o importacion fallida.
- `discarded`: batch descartado.

## RLS / permisos

Recomendaciones:

- habilitar RLS en `recovery_incomplete_bookings_import`;
- policy admin-only con `public.is_app_admin()`;
- sin grants a `anon`;
- RPC futura con `security definer`, `search_path = public` y validacion interna de `public.is_app_admin()`;
- respuestas JSON sin PII.

Las futuras vistas agregadas sin PII podrian tener permisos mas amplios, pero el staging crudo normalizado debe quedar restringido.

## Relacion futura con compras

El cruce posterior se deberia calcular contra `recovery_bookings_import`:

- carrito a compra por `phone_normalized` y/o `email_normalized`;
- compra posterior a `form_datetime` o a la fecha del mensaje si existe;
- ventanas de atribucion: 24 horas, 48 horas y 7 dias;
- excluir compras anteriores al carrito;
- si hay varias compras posteriores, tomar la primera valida dentro de la ventana;
- si hay varios carritos previos a una compra, priorizar el evento mas cercano.

Confianza sugerida:

- alta: coincide email y telefono;
- media: coincide telefono;
- baja: coincide email.

`message_id` conectara con la fuente futura `Seguimiento` para incorporar envio, entrega, lectura y fallos del WhatsApp.

## Migraciones futuras

Migraciones necesarias antes de guardar carritos:

1. Ampliar `recovery_import_batches.import_type` para aceptar `incomplete_bookings_csv`.
2. Crear `recovery_incomplete_bookings_import`.
3. Crear RPC `public.import_recovery_incomplete_bookings(...)`.
4. Mas adelante, crear vistas agregadas tipo `v_recovery_cases`.

## Riesgos

- PII normalizada: email y telefono siguen siendo datos personales.
- `cms_url` y `bform` pueden contener datos sensibles.
- `booking_id` puede no equivaler a la compra final.
- `message_id` puede venir vacio cuando no se envio WhatsApp.
- Diferencias de timezone en `form_datetime`.
- Encoding, BOM UTF-8 o exportaciones con separadores distintos.
- Duplicados entre exportaciones.
- Cruces falsos por telefonos o emails compartidos.
- Multiples carritos antes de una misma compra.

## Proximo paso

Secuencia recomendada:

1. Crear helper de filas normalizadas para carritos.
2. Crear migracion base de staging.
3. Crear RPC transaccional.
4. Crear endpoint de importacion.
5. Conectar el boton `Preparar importacion`.
