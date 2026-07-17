# Plantilla CSV BackendIncompleteBookings2 para recuperacion

## Objetivo

`BackendIncompleteBookings2` representa reservas incompletas, carritos abandonados o cancelaciones desde n8n.

Esta fuente servira como base para identificar clientes que podrian ser contactados por WhatsApp y luego cruzar esos casos con:

- seguimiento de mensajes;
- conversaciones o respuestas del cliente;
- compras posteriores;
- ingresos potencialmente recuperados.

## Columnas esperadas

| Columna CSV | Clasificacion | Tipo esperado | Uso |
|---|---|---|---|
| `id` | Obligatoria | Texto / numero | Identificador tecnico de la fila en la fuente. |
| `booking_id` | Obligatoria | Texto | Identificador de la reserva o carrito. |
| `type` | Obligatoria | Texto | Tipo de caso: abandono o cancelacion. |
| `form_datetime` | Obligatoria | Fecha/hora | Fecha principal del carrito o formulario. |
| `phone` | Recomendada critica | Texto | Matching por telefono normalizado. |
| `email` | Recomendada critica | Texto | Matching por email normalizado. |
| `parking_code` | Recomendada | Texto | Segmentacion por parking. |
| `Message_Sent` | Recomendada | Boolean / texto | Indica si se envio mensaje. |
| `Id_Mensaje` | Recomendada | Texto | Llave para conectar con seguimiento WhatsApp. |
| `createdAt` | Recomendada | Fecha/hora | Fecha de creacion en la fuente. |
| `updatedAt` | Recomendada | Fecha/hora | Fecha de actualizacion en la fuente. |
| `cms_url` | Opcional sensible | Texto / URL | Link de trazabilidad. Puede contener datos sensibles. |
| `bform` | Opcional sensible | Texto / JSON | Payload del formulario. Puede contener datos personales. |

`phone` y `email` no son obligatorias estrictas porque una fila puede servir con solo uno de los dos datos.
Si faltan ambos, la fila queda con bajo o nulo valor para matching y debe reportarse en el preview seguro.

## Normalizacion

### `email`

- Aplicar `trim`.
- Convertir a lowercase.
- Guardar `null` si queda vacio.

### `phone`

- Usar la misma normalizacion chilena definida para compras.
- Remover espacios, `+`, parentesis y guiones.
- Intentar devolver formato `56XXXXXXXXX`.
- Guardar `null` si no se puede normalizar.

### `form_datetime`

- Fecha principal del carrito, abandono o cancelacion.
- Debe parsearse como fecha/hora.
- Sera la referencia inicial para atribuir una compra posterior si no existe fecha de mensaje.

### `createdAt` / `updatedAt`

- Fechas propias de la fuente n8n.
- Sirven para auditoria y trazabilidad del registro.

### `type`

- Aplicar `trim`.
- Convertir a lowercase.
- Validar contra los valores esperados.

### `parking_code`

- Aplicar `trim`.
- Convertir a uppercase.
- Guardar `null` si queda vacio.

### `Message_Sent`

- Normalizar a boolean.
- Valores esperados equivalentes a verdadero: `true`, `1`, `yes`, `si`, `sí`.
- Valores esperados equivalentes a falso: `false`, `0`, `no`.

### `Id_Mensaje`

- Aplicar `trim`.
- Guardar `null` si queda vacio.
- Mantener el formato limpio para cruce con la fuente `Seguimiento`.

## Valores esperados de `type`

Valores validos:

- `abandoned`
- `canceled`

Valores desconocidos:

- No deberian bloquear necesariamente el archivo en el MVP.
- Deben reportarse como valores desconocidos en el preview seguro.
- Deben revisarse antes de usar la fuente para metricas finales.

## Validaciones futuras

El validador local futuro debe reportar:

- filas totales;
- columnas faltantes;
- emails presentes;
- emails validos;
- telefonos presentes;
- telefonos normalizables;
- filas sin email ni telefono util;
- fechas `form_datetime` parseables;
- rango minimo y maximo de `form_datetime`;
- tipos validos;
- tipos desconocidos;
- duplicados por `id`;
- duplicados por `booking_id`;
- duplicados por `Id_Mensaje`;
- conteo `Message_Sent=true`;
- conteo `Message_Sent=false`;
- conteo `Message_Sent` no parseable.

## Seguridad PII

El preview futuro no debe mostrar:

- email completo;
- telefono completo;
- `cms_url` completo;
- `bform` completo;
- filas reales;
- payload raw.

El preview debe mostrar solo agregados seguros, igual que el flujo de compras.

## Staging futuro propuesto

Tabla futura:

`recovery_incomplete_bookings_import`

Campos sugeridos:

| Campo | Uso |
|---|---|
| `id` | Identificador interno. |
| `batch_id` | Batch de importacion. |
| `source_id` | Columna `id` de la fuente. |
| `booking_id` | Reserva o carrito de origen. |
| `email_normalized` | Email normalizado para matching. |
| `phone_normalized` | Telefono normalizado para matching. |
| `type` | Tipo normalizado del caso. |
| `parking_code` | Parking normalizado. |
| `form_datetime` | Fecha principal del carrito. |
| `message_sent` | Indica si se envio mensaje. |
| `message_id` | Columna `Id_Mensaje`. |
| `created_at_source` | Columna `createdAt`. |
| `updated_at_source` | Columna `updatedAt`. |
| `row_hash` | Hash de la fila normalizada. |
| `created_at` | Fecha de insercion en staging. |

No guardar inicialmente:

- `cms_url` completo;
- `bform` raw;
- email raw;
- telefono raw;
- raw payload.

Si mas adelante se requiere trazabilidad forense, debe evaluarse una estrategia separada con acceso restringido, retencion limitada y, si corresponde, cifrado.

## Relacion futura con compras

Cruces esperados:

- carrito incompleto con compra por `email_normalized`;
- carrito incompleto con compra por `phone_normalized`;
- compra posterior a `form_datetime` o a la fecha de mensaje;
- ventanas de atribucion: 24 horas, 48 horas y 7 dias;
- `Id_Mensaje` conecta con la fuente `Seguimiento`;
- `phone_normalized` conecta con conversaciones WhatsApp o Google Sheet.

Confianza inicial sugerida:

- Alta: telefono + email coinciden.
- Media: solo telefono coincide.
- Baja: solo email coincide.
- Ninguna: no hay match util.

## Ejemplo CSV ficticio

```csv
id,booking_id,phone,email,type,parking_code,cms_url,bform,form_datetime,Message_Sent,Id_Mensaje,createdAt,updatedAt
1,BKG-TEST-001,56912345678,test1@example.invalid,abandoned,MPV,,,"2026-07-15 10:00:00",true,MSG-TEST-001,"2026-07-15 10:01:00","2026-07-15 10:05:00"
2,BKG-TEST-002,,test2@example.invalid,canceled,EAP,,,"2026-07-15 11:00:00",false,,"2026-07-15 11:01:00","2026-07-15 11:05:00"
3,BKG-TEST-003,+56 9 1234 5679,,abandoned,MPV,,,"2026-07-15 12:00:00",true,MSG-TEST-003,"2026-07-15 12:01:00","2026-07-15 12:05:00"
```

## Proximas tareas chicas

1. Crear normalizador demo local para `BackendIncompleteBookings2` con datos ficticios.
2. Crear validador local CSV que entregue solo agregados seguros.
3. Auditar una muestra real sin guardar PII en el repo.
4. Disenar staging SQL solo despues de validar formato y reglas.
5. Crear UI mock de carga separada de compras.

## Estado

Estado: plantilla documentada. No implementado.
