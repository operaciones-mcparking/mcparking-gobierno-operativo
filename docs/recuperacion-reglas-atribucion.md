# Reglas de atribucion de recuperacion

## Objetivo

Estas reglas definen como cruzar carritos perdidos o cancelados con compras posteriores para medir recuperacion en el modulo `/recuperacion`.

El objetivo es identificar casos donde un evento de carrito en `BackendIncompleteBookings2` termina en una compra valida posterior, sin duplicar compras, sin sobreatribuir y sin usar datos personales crudos en la salida.

## Definicion de recuperacion

Un carrito se considera recuperado si existe una compra valida posterior al carrito dentro de una ventana de atribucion.

Fuentes:

- carrito: `recovery_incomplete_bookings_import`;
- compra: `recovery_bookings_import`;
- compra valida: `is_valid_purchase = true`;
- fecha carrito: `form_datetime`;
- fecha compra: `booking_created_at`;
- condicion temporal: `booking_created_at >= form_datetime`.

No considerar recuperacion si:

- la compra es anterior al carrito;
- la compra no es valida;
- la compra esta fuera de ventana;
- no hay email ni telefono util para matching;
- el match es masivo, compartido o ambiguo.

## Ventanas de atribucion

Ventanas iniciales:

- 24 horas;
- 48 horas;
- 7 dias.

Campos futuros:

- `recovered_24h`;
- `recovered_48h`;
- `recovered_7d`.

La ventana principal inicial sera 7 dias. Las ventanas de 24h y 48h ayudan a medir inmediatez y separar recuperaciones rapidas de compras mas tardias.

## Matching y confianza

Niveles de confianza:

- `high`: coinciden `email_normalized` y `phone_normalized`.
- `medium`: coincide solo `phone_normalized`.
- `low`: coincide solo `email_normalized`.
- `ambiguous`: el match aplica a multiples carritos, multiples compras o datos compartidos/masivos.
- `none`: no hay match confiable.

Regla de prioridad:

1. Priorizar matches `high`.
2. Luego matches `medium`.
3. Luego matches `low`.
4. Marcar como `ambiguous` cuando el match pueda sobreatribuir o duplicar.
5. No atribuir si la confianza es `none`.

## WhatsApp

La medicion debe separar:

- recuperacion total;
- recuperacion con `message_sent = true`;
- recuperacion sin mensaje enviado.

`message_sent = true` no significa entregado ni leido. Solo indica que se marco envio desde la fuente de carritos. La entrega, lectura y fallos deben medirse mas adelante con la fuente `Seguimiento`.

Para atribucion WhatsApp pura, la regla recomendada es exigir `message_sent = true`.

Para analisis general de recuperacion, conviene mantener ambos grupos visibles.

## Tipos de carrito

Los tipos deben reportarse separados:

- `abandoned`;
- `canceled`.

No mezclar tasas sin segmentar, porque un abandono y una cancelacion pueden representar comportamientos distintos.

## Multiples carritos

Si varios carritos de la misma persona matchean una compra, atribuir la compra al carrito mas reciente antes de la compra dentro de la ventana.

No atribuir la misma compra a multiples carritos.

## Multiples compras

Si un carrito tiene varias compras posteriores, tomar la primera compra valida posterior dentro de la ventana como recuperacion principal.

No sumar compras posteriores en el monto recuperado inicial.

## Monto recuperado

Definicion:

`recovered_amount = price`

Donde `price` corresponde a la compra valida atribuida.

Solo contar:

- compras validas;
- compras no duplicadas;
- primera compra atribuida.

Si `price` es `null`, el caso puede contarse como recuperado, pero no debe sumar monto recuperado.

## Modelo futuro

Vista futura sugerida:

`v_recovery_attribution_cases`

Campos sugeridos:

- `cart_id`;
- `cart_batch_id`;
- `cart_type`;
- `cart_form_datetime`;
- `message_sent`;
- `purchase_id`;
- `purchase_batch_id`;
- `purchase_created_at`;
- `purchase_amount`;
- `match_type`;
- `confidence`;
- `window_hours`;
- `recovered_24h`;
- `recovered_48h`;
- `recovered_7d`;
- `attribution_reason`;
- `created_at`.

La primera implementacion deberia partir como query exploratoria read-only. Si los conteos son correctos y la logica se estabiliza, se puede crear una vista SQL.

## KPIs futuros

KPIs iniciales:

- carritos totales;
- carritos con mensaje enviado;
- recuperados 24h;
- recuperados 48h;
- recuperados 7d;
- tasa recuperacion 24h;
- tasa recuperacion 48h;
- tasa recuperacion 7d;
- monto recuperado;
- monto recuperado con mensaje enviado;
- recuperaciones por `abandoned` / `canceled`;
- recuperaciones por `parking_code`;
- recuperaciones por confianza.

## Riesgos

Riesgos principales:

- telefono compartido;
- email compartido;
- compra organica no causada por WhatsApp;
- `message_sent = true` no implica lectura;
- falta fuente `Seguimiento`;
- diferencias de timezone;
- varias reservas por misma persona;
- precios nulos;
- compras previas al carrito;
- misma compra atribuible a varios carritos;
- misma persona generando varios carritos antes de comprar;
- compra valida fuera de la ventana elegida.

## Proximo paso

Secuencia recomendada:

1. Crear query exploratoria read-only.
2. Revisar conteos reales para 24h, 48h y 7d.
3. Revisar resultados por confianza, tipo de carrito y `message_sent`.
4. Ajustar reglas si aparecen ambiguedades relevantes.
5. Recién despues crear vista SQL `v_recovery_attribution_cases`.
