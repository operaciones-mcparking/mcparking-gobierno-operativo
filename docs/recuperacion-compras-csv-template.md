# Plantilla CSV de compras para recuperacion

## Objetivo

Este CSV servira para cargar compras y reservas historicas en el futuro modulo `/recuperacion`, con el fin de cruzarlas con carritos perdidos, mensajes WhatsApp, seguimiento de entrega/lectura, respuestas de clientes y compras posteriores.

La fuente esperada es un archivo similar a `mcp_Buchungen.csv`.

Regla conocida:

- `BookingStatus` 1 y 8 son compras validas.

## Columnas esperadas

| Columna CSV | Obligatoria | Tipo esperado | Uso |
|---|---:|---|---|
| `Id` | Si | Texto / numero | Identificador de reserva/compra en la fuente original. |
| `Email` | Recomendado | Texto | Matching por email normalizado. |
| `Telefon` | Recomendado | Texto | Matching principal por telefono normalizado. |
| `Buchungszeit` | Si | Fecha/hora | Fecha de creacion de compra/reserva. |
| `BookingStatus` | Si | Entero | Determina si la compra es valida. |
| `Preis` | Si | Numero / texto monetario | Monto de compra. |
| `CustomerId` | Muy recomendado | Texto / numero | Identificador de cliente si existe. |
| `Buchungsnummer` | Muy recomendado | Texto | Trazabilidad y posibles cruces especificos. |
| `ParkingCode` | Muy recomendado | Texto | Segmentacion por parking. |
| `LocationCode` | Muy recomendado | Texto | Segmentacion por ubicacion/origen. |
| `Anreisedatum` | Opcional util | Fecha | Fecha de llegada. |
| `Anreisezeit` | Opcional util | Hora | Hora de llegada. |
| `Abreisedatum` | Opcional util | Fecha | Fecha de salida. |
| `Abreisezeit` | Opcional util | Hora | Hora de salida. |
| `Dauer` | Opcional util | Numero | Duracion de reserva. |
| `Kennzeichen` | Opcional sensible | Texto | Patente. Dato sensible/PII. |
| `PayingStatus` | Opcional util | Texto / entero | Estado de pago original. |

## Reglas por columna

### `Id`

- Identificador de reserva/compra en la fuente original.
- Se guardaria como `source_booking_id`.
- Debe ser estable entre cargas para evitar duplicados.

### `CustomerId`

- Identificador de cliente si existe.
- Ayuda a trazabilidad, pero no reemplaza telefono/email para matching inicial.

### `Email`

- Se normaliza con `lowercase + trim`.
- Es util para matching.
- Si falta telefono, puede permitir un match de menor confianza.

### `Telefon`

- Se normaliza a telefono chileno estandar.
- Es el campo principal para matching.
- Debe conservarse tambien el valor original como `phone_raw`.

### `Buchungszeit`

- Fecha/hora de creacion de la compra o reserva.
- Se usaria como `booking_created_at`.
- Debe permitir determinar si la compra ocurrio despues del carrito o mensaje.

### `BookingStatus`

- `1` y `8` = compra valida.
- Otros valores = no validos para recuperacion en la primera regla.
- Debe parsearse a entero.

### `PayingStatus`

- Estado de pago original.
- No define por si solo compra recuperada en esta primera regla.
- Puede servir para analisis posteriores.

### `Preis`

- Monto de compra.
- Debe convertirse a numero decimal limpio.
- Ejemplos validos: `120000`, `120.000`, `$120.000`, `120000,50`.

### `ParkingCode` / `LocationCode`

- Sirven para segmentar por parking, ubicacion u origen.
- No son llave principal de matching, pero ayudan al analisis.

### `Buchungsnummer`

- Puede ayudar a trazabilidad o cruces especificos si coincide con algun `booking_id`.

### `Kennzeichen`

- Patente del vehiculo.
- Es dato sensible/PII.
- Debe usarse con cuidado y con acceso restringido.

## Reglas de validacion

- Si falta `Email` pero existe `Telefon`, la fila puede servir para matching.
- Si falta `Telefon` pero existe `Email`, la fila puede servir con menor confianza.
- Si faltan `Email` y `Telefon`, la fila no sirve para matching.
- Si falta `Buchungszeit`, no se puede atribuir compra posterior.
- Si falta `BookingStatus`, no se puede determinar compra valida.
- Si `Preis` no se puede parsear, el monto recuperado deberia quedar `null` o `0`, segun decision futura.
- `BookingStatus` debe parsearse a entero.
- Fila con `BookingStatus` distinto de `1` o `8` puede importarse, pero `is_valid_purchase` deberia ser `false`.

## Normalizacion

Estas reglas deben alinearse con el script local `scripts/recovery/normalizer-demo.js`.

### `normalizePhone`

- Deja solo digitos.
- Remueve `+`, espacios, parentesis y guiones.
- Intenta devolver formato chileno `56XXXXXXXXX`.
- Si no puede normalizar, devuelve `null`.

### `normalizeEmail`

- Aplica `trim`.
- Convierte a lowercase.
- Devuelve `null` si queda vacio.

### `normalizePrice`

- Acepta numero o texto.
- Remueve simbolos de moneda y espacios.
- Convierte separadores de miles/decimales.
- Devuelve numero decimal o `null`.

### `isValidPurchase`

- Devuelve `true` solo si `BookingStatus` es `1` o `8`.
- Otros estados no cuentan como compra valida recuperada.

## Ejemplo CSV ficticio

```csv
Id,CustomerId,Email,Telefon,Buchungszeit,LocationCode,ParkingCode,Anreisedatum,Anreisezeit,Abreisedatum,Abreisezeit,Dauer,Kennzeichen,Buchungsnummer,BookingStatus,PayingStatus,Preis
1001,C001,cliente1@demo.cl,+56 9 1234 5678,2026-07-01 10:15:00,SCL,MPV,2026-07-05,08:00,2026-07-10,19:00,6,AA0000,BK-1001,1,1,120000
1002,C002,cliente2@demo.cl,912345679,2026-07-02 11:20:00,SCL,MPV,2026-07-06,09:00,2026-07-08,18:00,3,BB0000,BK-1002,8,1,$80.000
1003,C003,cliente3@demo.cl,912345680,2026-07-03 12:30:00,SCL,MPV,2026-07-07,10:00,2026-07-09,18:00,3,CC0000,BK-1003,2,0,50000
1004,C004,,+56 9 1234 5681,2026-07-04 14:45:00,SCL,MPV,2026-07-08,07:30,2026-07-12,20:00,5,DD0000,BK-1004,1,1,95000
1005,C005,cliente5@demo.cl,,2026-07-05 16:10:00,SCL,MPV,2026-07-09,11:00,2026-07-10,18:00,2,EE0000,BK-1005,8,1,120000,50
```

## Resultado esperado de una carga futura

Una carga futura deberia transformar cada fila en un registro normalizado con:

- `source_booking_id`
- `customer_id`
- `email_raw`
- `email_normalized`
- `phone_raw`
- `phone_normalized`
- `booking_created_at`
- `location_code`
- `parking_code`
- `booking_number`
- `booking_status`
- `paying_status`
- `price`
- `is_valid_purchase`
- `raw_payload`

## Estado

Estado: documento de contexto. No implementado.
