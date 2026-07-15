# Futuro modulo: Recuperacion de carritos por WhatsApp

## Objetivo

El futuro modulo `/recuperacion` busca responder, con datos cruzados:

- Que clientes abandonaron o cancelaron una reserva.
- Si se les envio un WhatsApp.
- Si el mensaje fue entregado o leido.
- Si el cliente respondio.
- Que dijo el cliente.
- Si compro despues.
- Cuanto compro.
- Cuantos ingresos se recuperaron.

## Fuentes de datos

### BackendIncompleteBookings2

Uso: fuente base de carritos perdidos o cancelados.

Campos clave:

- `booking_id`
- `phone`
- `email`
- `type`
- `parking_code`
- `cms_url`
- `bform`
- `form_datetime`
- `Message_Sent`
- `Id_Mensaje`
- `createdAt`
- `updatedAt`

### Seguimiento

Uso: tracking del mensaje WhatsApp.

Campos clave:

- `Id_Mensaje`
- `Telefono_Negocio`
- `Telefono_Cliente`
- `Categoria_Mensaje`
- `Tipo_Cobro`
- `Fecha_Sent`
- `Fecha_Delivered`
- `Fecha_Read`
- `Fecha_Failed`
- `Json_Encuesta`
- `createdAt`
- `updatedAt`

### Whatsapp BBDD

Uso: conversacion y respuesta del cliente.

Campos clave:

- `timestamp`
- `conversation_id`
- `api_phone`
- `wa_id`
- `message_bound`
- `processing_time`
- `message_type`
- `time_of_day`
- `day_of_week`
- `message_sentiment`
- `chat_state`
- `intent_category`
- `Message`
- `text_summary`

### mcp_Buchungen.csv

Uso: compras y reservas reales.

Campos clave:

- `Id`
- `CustomerId`
- `Email`
- `Telefon`
- `Buchungszeit`
- `LocationCode`
- `ParkingCode`
- `Anreisedatum`
- `Anreisezeit`
- `Abreisedatum`
- `Abreisezeit`
- `Dauer`
- `Kennzeichen`
- `Buchungsnummer`
- `BookingStatus`
- `PayingStatus`
- `Preis`

Regla conocida:

- `BookingStatus` 1 y 8 son compras validas.

## Llaves de cruce recomendadas

- `BackendIncompleteBookings2.Id_Mensaje = Seguimiento.Id_Mensaje`
- Telefono normalizado entre `phone`, `Telefono_Cliente`, `wa_id` y `Telefon`.
- Email normalizado entre `email` y `Email`.
- Fechas para identificar compra posterior.
- Posible cruce por `booking_id` / `Buchungsnummer`, si aplica.
- `Seguimiento` con `Whatsapp BBDD` por `Telefono_Cliente` normalizado con `wa_id` o `api_phone`, mas fecha cercana.

## Normalizacion necesaria

- Telefonos: solo digitos, remover `+`, espacios y prefijos duplicados; estandar Chile `56XXXXXXXXX`.
- Emails: lowercase + trim.
- Fechas: una zona horaria unica.
- `Id_Mensaje` / `wamid`: limpiar espacios y formato.
- Precio: numero decimal limpio.
- Status compra: `BookingStatus in (1, 8)`.

## Regla conceptual de compra recuperada

Compra recuperada:

- Compra valida con `BookingStatus in (1, 8)`.
- Compra posterior a `Fecha_Sent`.
- Si no hay `Fecha_Sent`, usar `form_datetime`.
- Dentro de ventana de atribucion:
  - 24 horas.
  - 48 horas.
  - 7 dias.
- Si hay multiples compras posteriores, atribuir la primera compra valida dentro de la ventana.
- Monto recuperado = `Preis`.

## Confianza del match

- Alta: telefono + email.
- Media: solo telefono.
- Baja: solo email o fecha ambigua.

## Modelo de tablas recomendado

- `recovery_abandoned_carts`
- `recovery_message_tracking`
- `recovery_whatsapp_messages`
- `recovery_bookings_import`
- `recovery_attribution_cases`

La tabla clave seria `recovery_attribution_cases`, donde se consolida:

- Carrito origen.
- Mensaje enviado.
- Estado delivery/read.
- Respuesta detectada.
- Compra atribuida.
- Ventana de atribucion.
- Monto recuperado.
- Confianza del match.

## Diseno staging propuesto

Esta seccion documenta un diseno futuro de staging. No esta implementado y no implica crear tablas todavia.

### Tablas recomendadas

#### `recovery_abandoned_carts`

Proposito: representar carritos perdidos o cancelados desde `BackendIncompleteBookings2`.

Columnas principales:

- `id uuid`
- `source_id` o `n8n_id`
- `booking_id`
- `phone_raw`
- `phone_normalized`
- `email_raw`
- `email_normalized`
- `type`
- `parking_code`
- `cms_url`
- `bform jsonb`
- `form_datetime timestamptz`
- `message_sent boolean`
- `message_id`
- `source_created_at`
- `source_updated_at`
- `imported_at`
- `raw_payload jsonb`

#### `recovery_message_tracking`

Proposito: representar eventos de seguimiento desde `Seguimiento`.

Columnas principales:

- `id uuid`
- `source_id` o `n8n_id`
- `message_id`
- `business_phone_raw`
- `business_phone_normalized`
- `client_phone_raw`
- `client_phone_normalized`
- `message_category`
- `charge_type`
- `sent_at`
- `delivered_at`
- `read_at`
- `failed_at`
- `survey_json jsonb`
- `source_created_at`
- `source_updated_at`
- `imported_at`
- `raw_payload jsonb`

#### `recovery_whatsapp_messages`

Proposito: representar mensajes y respuestas desde Google Sheet `Whatsapp BBDD`.

Columnas principales:

- `id uuid`
- `source_row_id`
- `message_timestamp`
- `conversation_id`
- `api_phone_raw`
- `api_phone_normalized`
- `wa_id_raw`
- `wa_id_normalized`
- `message_bound`
- `processing_time`
- `message_type`
- `time_of_day`
- `day_of_week`
- `message_sentiment`
- `chat_state`
- `intent_category`
- `message_text`
- `text_summary`
- `imported_at`
- `raw_payload jsonb`

#### `recovery_bookings_import`

Proposito: representar compras o reservas reales desde `mcp_Buchungen.csv`.

Columnas principales:

- `id uuid`
- `source_booking_id`
- `customer_id`
- `email_raw`
- `email_normalized`
- `phone_raw`
- `phone_normalized`
- `booking_created_at`
- `location_code`
- `parking_code`
- `arrival_date`
- `arrival_time`
- `departure_date`
- `departure_time`
- `duration_days`
- `plate`
- `booking_number`
- `booking_status`
- `paying_status`
- `price numeric(12,2)`
- `is_valid_purchase boolean`
- `imported_batch_id`
- `imported_at`
- `raw_payload jsonb`

#### `recovery_import_batches`

Proposito: controlar cargas manuales o programadas.

Columnas principales:

- `id uuid`
- `source_type`
- `filename`
- `uploaded_by`
- `row_count`
- `valid_row_count`
- `invalid_row_count`
- `status`
- `created_at`
- `completed_at`
- `notes`

#### `recovery_attribution_cases`

Proposito: consolidar el resultado del matching entre carrito, mensaje, respuesta y compra.

Columnas principales:

- `abandoned_cart_id`
- `tracking_id`
- `whatsapp_conversation_id` o `whatsapp_message_id`
- `attributed_booking_import_id`
- `attribution_window_hours`
- `match_confidence`
- `match_method`
- `sent_at`
- `delivered_at`
- `read_at`
- `first_client_reply_at`
- `first_client_reply_text`
- `intent_category`
- `message_sentiment`
- `recovered_purchase_at`
- `recovered_amount numeric(12,2)`
- `days_to_purchase`
- `is_recovered`
- `created_at`
- `updated_at`

### Llaves de cruce staging

- Carrito con tracking: `message_id`.
- Carrito con WhatsApp: `phone_normalized` + ventana temporal.
- Carrito con compra: `phone_normalized`, `email_normalized` y `booking_id` si aplica.
- Tracking con WhatsApp: `client_phone_normalized` con `wa_id_normalized` o `api_phone_normalized`.
- Compra valida: `booking_status in (1, 8)`.

### Normalizacion staging

- Telefonos: normalizar a `56XXXXXXXXX`.
- Emails: `lowercase` + `trim`.
- Fechas: guardar como `timestamptz` en una zona unica.
- Precios: guardar como `numeric(12,2)`.
- `message_id`: limpiar espacios y conservar formato consistente.

### Indices sugeridos

- `message_id`
- `phone_normalized`
- `email_normalized`
- `booking_id`
- `form_datetime`
- `sent_at`
- `conversation_id`
- `booking_number`
- `booking_created_at`
- `is_valid_purchase`
- `imported_batch_id`

### Constraints sugeridas

- `unique(source_id)` cuando aplique por fuente.
- `unique(message_id)` en tracking si `Id_Mensaje` es unico.
- `unique(imported_batch_id, source_booking_id)` para evitar duplicados en cargas de compras.
- Checks para `match_confidence`.
- Checks para `source_type`.
- Checks para `status`.
- Checks para `attribution_window_hours`.
- Check `price >= 0`.

### Seguridad y RLS

Este modulo deberia tener acceso restringido por tratar datos personales y comerciales sensibles:

- Telefonos.
- Emails.
- Patentes.
- Mensajes.
- Reservas.
- Monto de compra.
- Comportamiento de recuperacion.

El acceso deberia limitarse a administradores o a un rol especifico de analitica/operaciones. No deberia estar disponible para usuarios generales.

### Vistas futuras

Cuando existan staging y matching, convendria exponer vistas limpias para la UI:

- `v_recovery_cases`
- `v_recovery_funnel`
- `v_recovery_kpis`

### Decision recomendada

Primero conviene prototipo local con datos ficticios o muestra anonimizada.

No partir con Supabase directo hasta cerrar:

- Normalizador telefono/email/fecha.
- Formato CSV esperado.
- Reglas de deduplicacion.
- Ventanas de atribucion.

### Proximas tareas chicas para staging

1. Crear normalizador local con datos ficticios.
2. Disenar plantilla CSV esperada para compras.
3. Definir politica de PII y acceso.
4. Crear migracion staging base solo despues de validar lo anterior.

## Metricas iniciales

- Carritos perdidos.
- Mensajes enviados.
- Mensajes entregados.
- Mensajes leidos.
- Clientes que respondieron.
- Compras recuperadas.
- Ingresos recuperados.
- Tasa de entrega.
- Tasa de lectura.
- Tasa de respuesta.
- Tasa de recuperacion.
- Conversion post lectura.
- Tiempo medio a compra recuperada.

## Propuesta visual de `/recuperacion`

- Resumen KPI arriba.
- Funnel: carritos -> enviados -> entregados -> leidos -> respondidos -> compras.
- Tabla de casos: telefono/email parcial, carrito, mensaje, estado, respuesta, compra atribuida, monto, confianza.
- Bloque "Compras recuperadas".
- Bloque "Sin recuperacion" o "motivos detectados".
- Filtros: fecha, parking, tipo, ventana de atribucion, estado WhatsApp.

## Integraciones futuras

- n8n: API o export programado hacia tabla staging.
- Google Sheet: import programado o conector manual.
- CSV compras: carga manual validada, con previsualizacion y normalizacion.
- Luego crear vista materializada o job de atribucion.

## Riesgos

- Telefonos con formatos distintos.
- Duplicados por mismo cliente.
- Mensajes no relacionados con carrito.
- Compras por otro canal atribuidas erroneamente.
- Falta de `Id_Mensaje`.
- Timezone inconsistente.
- Datos personales sensibles.
- Precio con moneda/formato variable.
- Multiples carritos antes de una compra.
- Multiples compras posteriores.

## Proximas tareas chicas

1. Definir esquema staging sin migrar todavia.
2. Crear script local de normalizacion de telefonos/emails/fechas con datos ficticios.
3. Disenar muestra de CSV esperado para compras.
4. Auditar si conviene Supabase directo o prototipo local primero.
5. Disenar mock visual de `/recuperacion` sin datos reales.

## Estado

Estado: documento de contexto. No implementado.
