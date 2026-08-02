# Snapshots semanales de Recuperacion

## Objetivo

Los snapshots semanales guardan el resultado de la atribucion canonica de Recuperacion para poder comparar como cambia una semana cuando llegan nuevas cargas de carritos o compras.

Permiten responder cuanto cambio la tasa, cuantos carritos cambiaron, que carrito cambio de estado, que compra atribuida cambio, que monto cambio y que batch probablemente explica el cambio.

## Estado de aplicacion

Esta migracion aun no esta aplicada en Supabase. Los endpoints de importacion todavia no llaman snapshots, no existe cron, no existe job y no hay boton UI para generarlos.

## Arquitectura

TypeScript calcula la atribucion con la regla de negocio que vive en `src/lib/recuperacion/recovery-attribution.ts`, version `v1-intended-arrival`.

La migracion `20260802120000_create_recovery_weekly_snapshots.sql` no recalcula la atribucion. Crea tablas y una RPC transaccional para persistir el resultado que el backend calcula con el helper canonico.

Esta decision evita duplicar una segunda regla en SQL y reduce el riesgo de divergencia entre Dashboard, auditoria y snapshots.

## Tablas

`recovery_weekly_snapshots` guarda el agregado semanal:

- semana;
- tipo de snapshot;
- version de calculo;
- conteos derivados;
- monto recuperado validado;
- tasa recalculada;
- `payload_hash` deterministico;
- batch disparador y batches recientes probables.

`recovery_weekly_cart_snapshots` guarda el detalle por carrito:

- cart_id;
- estado canonico;
- compra atribuida;
- monto atribuido;
- razon de atribucion;
- hashes de carrito y compra;
- batches de origen;
- fechas seguras necesarias para comparar.

No guarda email, telefono, nombre, WAMID, texto de mensajes, payloads, tokens ni errores crudos.

## Resumen y detalle

La RPC deriva desde `p_cart_results`:

- carts_total;
- recovered_confirmed;
- recovered_review;
- unrecovered;
- operational_recovered;
- recovered_amount;
- recovery_rate.

Luego compara esos valores contra `p_summary`. Si el resumen no coincide con el detalle, la RPC falla antes de insertar datos.

## Idempotencia y payload_hash

La clave `snapshot_key` es unica. La RPC `create_recovery_weekly_snapshot` toma un `snapshot_key` obligatorio.

La RPC normaliza el payload sin PII, ordena el detalle por `cart_id`, deriva el resumen y calcula `payload_hash` con esa representacion estable. Si `snapshot_key` ya existe:

- con el mismo `payload_hash`, devuelve el snapshot existente con `created=false`;
- con un `payload_hash` distinto o metadata incompatible, lanza `snapshot_key_conflict`.

## Formatos recomendados de snapshot_key

No incluir PII ni usar `now()` sin normalizacion.

- batch: `recovery:week:<week_start>:<version>:batch:<batch_id>`
- daily: `recovery:week:<week_start>:<version>:daily:<YYYY-MM-DD>`
- weekly_close: `recovery:week:<week_start>:<version>:weekly_close`
- manual: `recovery:week:<week_start>:<version>:manual:<idempotency_token>`
- reconstructed: `recovery:week:<week_start>:<version>:reconstructed:<source_date>`

## RPC

`public.create_recovery_weekly_snapshot(...)` valida payload, rechaza campos prohibidos de PII de forma recursiva y defensiva, inserta agregado y detalle en una sola transaccion y recalcula `operational_recovered` y `recovery_rate` desde el detalle.

La RPC queda concedida solo a `service_role`. No se concede ejecucion a `anon` ni `authenticated`.

## Validacion PII

La funcion interna `public.recovery_jsonb_contains_forbidden_keys(jsonb)` recorre objetos y arrays solo despues de validar `jsonb_typeof()`. Los escalares (`string`, `number`, `boolean`, `null`) no rompen el recorrido.

Aunque la RPC no guarda el JSONB completo, cualquier clave prohibida en el payload produce rechazo seguro.

## Comparacion

`public.recovery_compare_snapshots(previous, current)` compara dos snapshots con `FULL OUTER JOIN` entre subconsultas ya filtradas por `snapshot_id`.

Antes de comparar exige que ambos snapshots existan, pertenezcan a la misma semana y usen la misma `calculation_version`.

Detecta:

- cambios de estado;
- cambios de compra atribuida;
- cambios de monto;
- cambios en intended arrival;
- cambios de hash del carrito;
- cambios de hash de compra;
- carritos agregados o removidos.

Las razones son probables, no prueba causal exacta. El batch responsable tambien es probable: apunta a batches relacionados, no garantiza causalidad unica.

## Frecuencia futura

La Etapa 2 no conecta importaciones, cron, jobs ni UI. En etapas posteriores se podra tomar snapshot despues de una carga relevante, al cierre diario o al cierre semanal.

## Reconstructed

Un snapshot `reconstructed` representa una reconstruccion con datos disponibles al momento de generarlo. No es necesariamente una foto historica exacta del pasado si los datos mutables ya cambiaron.

## Limitaciones

Por ahora no hay congelamiento de semanas. Un snapshot representa una foto tomada en un momento y version de calculo determinados. Si llegan datos mutables despues, otro snapshot permite comparar el cambio.
