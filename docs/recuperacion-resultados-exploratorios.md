# Resultados exploratorios de recuperacion

## Contexto

Se cruzaron las fuentes staging:

- `recovery_incomplete_bookings_import`;
- `recovery_bookings_import`.

Reglas aplicadas:

- compra valida: `is_valid_purchase = true`;
- compra posterior al carrito;
- ventana maxima: 7 dias;
- atribucion al carrito mas reciente antes de la compra;
- primera compra valida posterior por carrito;
- sin duplicar compras entre carritos.

Estos resultados son exploratorios y sirven para validar si las reglas de atribucion son razonables antes de crear una vista SQL formal.

## Resumen general

| Metrica | Resultado |
|---|---:|
| Total carritos | 3.751 |
| Carritos con mensaje enviado | 3.663 |
| Recuperados 24h | 119 |
| Recuperados 48h | 129 |
| Recuperados 7d | 143 |
| Tasa 24h | 3,17% |
| Tasa 48h | 3,44% |
| Tasa 7d | 3,81% |
| Monto recuperado 24h | $3.506.956 |
| Monto recuperado 48h | $3.701.417 |
| Monto recuperado 7d | $4.024.100 |

## Por tipo de carrito

| Tipo | Total | Recuperados 24h | Recuperados 48h | Recuperados 7d | Monto 7d |
|---|---:|---:|---:|---:|---:|
| abandoned | 1.610 | 45 | 52 | 60 | $1.573.870 |
| canceled | 2.141 | 74 | 77 | 83 | $2.450.230 |

## Por confianza

| Confianza | Casos | Monto recuperado 7d |
|---|---:|---:|
| high | 123 | $3.368.858 |
| medium | 15 | $504.923 |
| low | 5 | $150.319 |

La mayoria de recuperaciones corresponden a matches `high`, es decir, coincidencia por email y telefono normalizados.

## Por parking

| Parking | Total carritos | Recuperados 7d | Monto 7d |
|---|---:|---:|---:|
| MPV | 3.710 | 139 | $3.952.706 |
| EAP | 41 | 4 | $71.394 |

## Observaciones

- Los resultados iniciales parecen razonables para una primera regla de atribucion.
- La tasa de recuperacion a 7 dias es 3,81%.
- El monto recuperado estimado a 7 dias es $4.024.100.
- La mayoria de matches son `high confidence`.
- `message_sent = true` no implica que el mensaje haya sido entregado o leido.
- Falta cruzar con la fuente `Seguimiento` para incorporar entrega, lectura, fallos y tiempos de WhatsApp.
- Estos resultados son exploratorios y no deben tratarse todavia como vista final de negocio.

## Proximo paso

Secuencia recomendada:

1. Crear vista SQL `v_recovery_attribution_cases`.
2. Crear KPIs en `/recuperacion` usando la vista.
3. Integrar la fuente `Seguimiento` para distinguir enviado, entregado, leido y fallido.

## Seguridad

Este documento no incluye:

- emails;
- telefonos;
- ids crudos;
- `source_id`;
- `booking_id`;
- `message_id`;
- filas reales;
- ningun dato personal identificable.
