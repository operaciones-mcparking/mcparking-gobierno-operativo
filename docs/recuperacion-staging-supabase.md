# Diseno staging Supabase para recuperacion

## Objetivo

Este documento define el diseno propuesto de staging en Supabase para guardar compras importadas desde CSV en el modulo futuro `/recuperacion`.

El staging debe usarse solo despues de que el usuario valide el archivo, revise un preview seguro y confirme la importacion. La etapa actual no guarda datos.

## Estado actual

Actualmente existe:

- validacion local por CLI con `scripts/recovery/validate-purchases-csv.js`;
- helpers reutilizables de normalizacion y validacion CSV;
- endpoint web `POST /api/recuperacion/compras/validar`;
- UI de preview seguro en `/recuperacion`;
- ningun guardado real en Supabase.

## Flujo futuro

Flujo recomendado para una importacion confirmada:

1. Validar CSV.
2. Mostrar preview seguro sin PII.
3. Usuario confirma importacion.
4. Backend recalcula validacion.
5. Backend calcula `file_hash` y `row_hash`.
6. Crear batch de importacion.
7. Insertar filas normalizadas.
8. Marcar batch como `imported`.
9. Mostrar resultado final.

El backend no debe confiar solo en el resumen enviado desde el cliente. Al confirmar, debe volver a validar el archivo o usar un mecanismo temporal seguro.

## Tabla `recovery_import_batches`

Representa una carga de archivo.

Columnas propuestas:

| Columna | Tipo sugerido | Uso |
|---|---|---|
| `id` | `uuid` | Identificador del batch. |
| `import_type` | `text` | Tipo de importacion, por ejemplo `purchases_csv`. |
| `file_name` | `text` | Nombre original del archivo. |
| `file_size` | `bigint` | Tamano del archivo en bytes. |
| `file_hash` | `text` | Hash del archivo para detectar recargas. |
| `status` | `text` | Estado del batch. |
| `rows_total` | `integer` | Filas detectadas. |
| `columns_total` | `integer` | Columnas detectadas. |
| `valid_purchase_rows` | `integer` | Compras validas segun `BookingStatus in (1, 8)`. |
| `valid_purchase_amount` | `numeric(12,2)` | Monto valido agregado. |
| `missing_mandatory_columns` | `jsonb` | Columnas obligatorias faltantes. |
| `booking_status_counts` | `jsonb` | Conteos por `BookingStatus`. |
| `duplicate_id_groups` | `integer` | Grupos duplicados por `Id`. |
| `duplicate_booking_number_groups` | `integer` | Grupos duplicados por `Buchungsnummer`. |
| `created_by` | `uuid` | Usuario admin que creo el batch. |
| `created_at` | `timestamptz` | Fecha de creacion. |
| `confirmed_at` | `timestamptz` | Fecha de confirmacion. |
| `discarded_at` | `timestamptz` | Fecha de descarte. |
| `error_message` | `text` | Error de validacion o importacion, si aplica. |

## Tabla `recovery_bookings_import`

Guarda compras o reservas normalizadas desde el CSV.

Columnas propuestas:

| Columna | Tipo sugerido | Uso |
|---|---|---|
| `id` | `uuid` | Identificador de fila importada. |
| `batch_id` | `uuid` | Referencia a `recovery_import_batches`. |
| `source_booking_id` | `text` | Columna `Id` del CSV. |
| `customer_id` | `text` | Columna `CustomerId`. |
| `email_normalized` | `text` | Email normalizado para matching. |
| `phone_normalized` | `text` | Telefono normalizado para matching. |
| `booking_created_at` | `timestamptz` | Columna `Buchungszeit`. |
| `booking_status` | `integer` | Columna `BookingStatus`. |
| `paying_status` | `text` | Columna `PayingStatus`. |
| `price` | `numeric(12,2)` | Columna `Preis`. |
| `is_valid_purchase` | `boolean` | `true` si `BookingStatus in (1, 8)`. |
| `booking_number` | `text` | Columna `Buchungsnummer`. |
| `parking_code` | `text` | Columna `ParkingCode`. |
| `location_code` | `text` | Columna `LocationCode`. |
| `arrival_date` | `date` | Columna `Anreisedatum`. |
| `departure_date` | `date` | Columna `Abreisedatum`. |
| `duration_days` | `integer` | Columna `Dauer`. |
| `row_hash` | `text` | Hash de fila normalizada. |
| `created_at` | `timestamptz` | Fecha de insercion. |

## PII y minimizacion

En la primera etapa se recomienda guardar solo lo necesario para atribucion y auditoria:

- email normalizado;
- telefono normalizado;
- `customer_id`;
- `source_booking_id`;
- `booking_number`;
- fechas;
- status;
- monto;
- `parking_code` y `location_code`.

No se recomienda guardar inicialmente:

- email raw;
- telefono raw;
- patente;
- nombre completo;
- direccion;
- notas internas;
- CSV completo;
- filas raw completas;
- mensajes personales.

Si mas adelante se requiere trazabilidad forense, se debe evaluar una estrategia separada con acceso restringido, retencion limitada y, si corresponde, cifrado.

## Deduplicacion

Recomendacion inicial:

- `file_hash` para detectar archivos repetidos.
- `row_hash` para detectar filas repetidas.
- constraint recomendada: `unique(batch_id, source_booking_id)`.
- unique opcional: `unique(batch_id, row_hash)`.

No se recomienda usar todavia `unique(source_booking_id)` global. Antes hay que auditar recargas historicas, correcciones de origen y posibles cambios de estado en reservas existentes.

## Estados

Estados recomendados para `recovery_import_batches.status`:

- `validated`: archivo validado o batch preparado, aun sin insercion final.
- `importing`: importacion en curso.
- `imported`: filas normalizadas guardadas correctamente.
- `failed`: validacion o importacion fallida.
- `discarded`: batch descartado por el usuario.

## RLS / permisos

Recomendacion:

- habilitar RLS en `recovery_import_batches`;
- habilitar RLS en `recovery_bookings_import`;
- permitir lectura/escritura solo a usuarios admin mediante `public.is_app_admin()`;
- no otorgar acceso a `anon`;
- no exponer PII a usuarios no admin;
- futuras vistas agregadas sin PII podrian tener permisos mas amplios.

El patron sugerido es consistente con las politicas admin-only existentes del proyecto.

## Indices minimos

Indices sugeridos:

- `recovery_import_batches(file_hash)`;
- `recovery_import_batches(created_at)`;
- `recovery_import_batches(status)`;
- `recovery_bookings_import(batch_id)`;
- `recovery_bookings_import(booking_created_at)`;
- `recovery_bookings_import(phone_normalized)`;
- `recovery_bookings_import(email_normalized)`;
- `recovery_bookings_import(source_booking_id)`;
- `recovery_bookings_import(booking_number)`;
- `recovery_bookings_import(row_hash)`.

## Riesgos

Riesgos principales:

- PII: evitar guardar raw rows reduce exposicion.
- Duplicados entre batches: manejar primero deduplicacion dentro del batch.
- Fallos parciales: usar transaccion o marcar batch como `failed`.
- Encoding: validar UTF-8 y evaluar Latin-1 si aparecen archivos no compatibles.
- Timezone: normalizar `Buchungszeit` a una zona consistente.
- Insercion por lotes: evitar inserciones fila por fila para archivos grandes.
- Performance: indexar solo campos usados para matching y auditoria.
- Confianza cliente: no confiar en resumen enviado desde frontend.

## Proximo paso recomendado

Despues de documentar este diseno, la proxima tarea deberia ser crear una migracion base controlada con:

- las dos tablas;
- checks de `status`, `import_type` y montos no negativos;
- indices minimos;
- RLS admin-only;
- sin conectar todavia el boton `Confirmar importacion`.

El endpoint de confirmacion y la UI de importacion final deberian venir despues de revisar y aplicar esa migracion.
