# Recovery import row changes

## Objetivo

Esta etapa prepara una bitacora interna de cambios fila a fila para las importaciones de Recuperacion. La tabla permite saber que carritos o compras fueron insertados o actualizados por un batch, con valores tecnicos anteriores y actuales, sin cambiar el JSON publico que hoy reciben los endpoints de importacion.

La migracion queda preparada localmente y no debe asumirse aplicada hasta que exista una ejecucion manual controlada en Supabase.

## Por que los snapshots solos no bastan

Los snapshots semanales guardan el resultado canonico de atribucion para una semana, pero no dicen que filas cambiaron durante una importacion posterior. Las RPC de importacion vigentes devuelven conteos agregados y `batchId`; eso no alcanza para reconstruir con exactitud las semanas afectadas, especialmente cuando una fila existente se actualiza sin cambiar su `batch_id` original.

La bitacora `public.recovery_import_row_changes` registra el cambio dentro de la misma transaccion de importacion. Con eso una etapa posterior podra calcular las semanas que necesitan snapshots sin depender de inferencias por conteos.

## Tabla

La tabla unica `public.recovery_import_row_changes` registra eventos de dos fuentes:

- `source = carts`
- `source = purchases`

Cada evento registra:

- batch responsable;
- operacion `inserted` o `updated`;
- entidad afectada;
- hash deterministico de clave natural;
- `row_hash` anterior y actual;
- campos realmente modificados;
- valores tecnicos previous/current necesarios para recalcular atribucion.

No guarda payloads completos ni JSONB libre de filas importadas.

## Previous y current

Para carritos se guardan explicitamente:

- `form_datetime`;
- `intended_arrival_at`;
- `parking_code`;
- `type`;
- hashes de identidad email y telefono.

Para compras se guardan explicitamente:

- `booking_created_at`;
- `booking_status`;
- `paying_status`;
- `is_valid_purchase`;
- `price`;
- `parking_code`;
- hashes de identidad email y telefono.

En inserts, los campos `previous_*` quedan en `null`. En updates, los campos `previous_*` reflejan la fila antes del cambio y los `current_*` reflejan la fila posterior.

## changed_fields

`changed_fields` enumera nombres tecnicos estables para los campos que cambiaron. En updates se calcula con `IS DISTINCT FROM`, por lo que cubre cambios de `null` a valor, de valor a `null` y cambios entre valores no nulos.

Para carritos, los campos cubiertos incluyen fechas intended, `message_sent`, `message_id`, `cms_url`, `updated_at_source`, `parking_code`, `type`, hashes de identidad y `row_hash`. `message_id` y `cms_url` pueden aparecer como nombres de campo cambiado, pero sus valores no se guardan en la tabla de eventos.

Para compras, los campos cubiertos incluyen `booking_created_at`, `booking_number`, estados, validez, precio, parking, hashes de identidad y `row_hash`.

## Pseudonimizacion

La migracion agrega `public.recovery_import_safe_identity_hash(text)`, que aplica `digest(lower(trim(value)), 'sha256')` y devuelve hexadecimal. `null` y strings vacios se mantienen como `null`.

Estos hashes son pseudonimizacion, no anonimizacion perfecta: emails y telefonos pueden tener espacios de busqueda acotados. Por eso la tabla queda sin acceso para `anon` y `authenticated`, y su uso queda restringido a `service_role`.

Los hashes no se muestran en frontend, respuestas HTTP ni logs. No se usa HMAC en esta version porque SQL no tiene acceso a un secreto server-side seguro; esa decision debe revisarse si alguna vez se necesita exponer o compartir estos datos fuera del backend controlado.

## Idempotencia

La tabla usa una clave unica por:

`batch_id`, `source`, `entity_id`, `operation`

Las inserciones de eventos usan `on conflict do nothing`. Una reimportacion identica mantiene el comportamiento actual de duplicados y no debe crear eventos nuevos si no hubo cambio real.

## Transaccion

Los eventos se insertan como CTEs dentro de las RPC:

- `public.import_recovery_incomplete_bookings(...)`
- `public.import_recovery_purchases(...)`

Esto significa que la escritura del evento ocurre en la misma transaccion de la importacion. Si la escritura del evento falla, la importacion completa debe fallar tambien. Esta decision evita imports exitosos sin bitacora de semanas afectadas.

La auditoria es obligatoria, no best-effort. Para snapshots exactos es preferible fallar cerrado antes que aceptar una importacion sin trazabilidad.

## Contrato RPC intacto

Las RPC mantienen:

- misma firma;
- mismos contadores;
- mismo `batchId`;
- mismo JSON publico agregado;
- mismas reglas de insert, update, duplicado, invalido y conflicto.

Los endpoints de importacion no devuelven eventos, hashes ni filas afectadas al navegador.

## Snapshots todavia no conectados

Los snapshots todavia no estan conectados a estas importaciones. Esta etapa solo deja la infraestructura de eventos. Una etapa posterior debera leer eventos pendientes con permisos server-side, derivar semanas afectadas y ejecutar snapshots de forma controlada.

## Retencion inicial

En esta primera version no hay limpieza automatica de eventos:

- no se crea cron de limpieza;
- no se crea funcion de borrado;
- no se ejecuta `DELETE` automatico;
- los eventos se conservan mientras se valida el sistema de snapshots.

La retencion debe revisarse despues de medir volumen real durante 60 a 90 dias. Como recomendacion futura, conservar eventos detallados al menos 12 meses o archivarlos solo despues de confirmar que los snapshots consolidados ya cubren las necesidades de auditoria. No se deben borrar eventos sin asegurar que ya no son necesarios para explicar cambios de atribucion.

## Prueba pendiente antes de produccion

Las pruebas actuales son estaticas y de build. Antes de aplicar en produccion falta una prueba SQL real en entorno controlado o staging para validar permisos, rollback transaccional, `changed_fields`, captura previous/current y ausencia de PII en filas reales.

## Migracion no aplicada

La migracion `20260803110000_create_recovery_import_row_changes.sql` no se aplica automaticamente desde el repositorio. Debe revisarse y aplicarse manualmente cuando se apruebe la etapa.
