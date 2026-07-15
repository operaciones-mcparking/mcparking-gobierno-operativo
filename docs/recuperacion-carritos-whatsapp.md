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
