# Auditoria catalogo procesos v2\n\nEtapa: 2B, correccion de diseno definitivo, sin aplicacion remota.\n\n## Estado de fuentes\n\n- Fuente A: `C:\Users\McParking\Desktop\Manual Completo de Fichas de Proceso V2 - McParking.docx`.\n  - Estado local: disponible.\n  - Campos encontrados: tipo, nombre, objetivo, responsable/rol dueno, entradas/proveedores, salidas/clientes, KPI basico.\n  - Decision: Fuente A manda para la ficha documental.\n- Fuente B: `C:\Users\McParking\Desktop\procesos.docx`.\n  - Estado local: disponible.\n  - Campos encontrados: tipo proceso, proceso, subprocesos/etapas, rol dueno, persona actual, roles de apoyo.\n  - Decision: Fuente B manda para etapas y relaciones operativas, salvo discrepancias documentadas.\n\n## Catalogo esperado\n\n### Estrategicos\n\n1. Revenue Management\n2. Dirección y Planificación Operacional\n3. Estrategia Comercial y Alianzas\n4. Planificación de Capacidad y Ocupación\n\n### Clave / Operativos\n\n5. Reservas McParking\n6. Cotización y Reserva Online\n7. Check-in y Recepción del Vehículo\n8. Custodia del Vehículo\n9. Traslado al Aeropuerto\n10. Atención al Cliente Operacional\n11. Check-out y Entrega del Vehículo\n12. Gestión de Incidencias Operativas\n\n### Apoyo / Soporte\n\n13. Cierre Operacional, Liquidación y Cobranza a Inversionistas\n14. Finanzas y Contabilidad\n15. Sistemas y Datos\n16. Infraestructura y Mantenciones\n17. Personas y Turnos\n18. Gestión de Proveedores\n19. Control Documental y Administración\n\n## Cobertura Fuente A\n\n- Procesos con `objective`: 19/19\n- Procesos con `inputs_providers`: 19/19\n- Procesos con `outputs_clients`: 19/19\n- Procesos con `basic_kpi`: 19/19\n- Procesos con `owner_role_name`: 19/19\n\n## Matriz de registros actuales\n\n| Registro actual | Accion propuesta | Motivo |\n| --- | --- | --- |\n| Revenue Management | REUTILIZAR / ACTUALIZAR | Coincide con catalogo v2; conserva ID y sistemas actuales. |\n| Reservas McParking | REUTILIZAR / ACTUALIZAR | Coincide con catalogo v2; conserva ID, etapas reales, sistemas y roles existentes. |\n| Cierre Operacional, Liquidación y Cobranza a Inversionistas | REUTILIZAR / ACTUALIZAR | Coincide con catalogo v2; normaliza acento conservando dependencias reales. |\n| Planificación de Capacidad y Ocupación | REUTILIZAR / ACTUALIZAR | Coincide con catalogo v2; normaliza nombre heredado y corrige process_type a strategic. |\n| contabilidad test | ARCHIVAR | Test activo, no pertenece al catalogo maestro. |\n| teeeest | ARCHIVAR | Test activo, no pertenece al catalogo maestro. |\n| DEMO MAPA - * | ARCHIVAR | Datos demo/visual. |\n| Proceso Demo Mapa. | ARCHIVAR | Dato demo. |\n| test1l | ARCHIVAR | Test archivado; mantener archivado. |\n| Procesos v2 faltantes | CREAR | No existen hoy como procesos activos reales. |\n\n## Discrepancias Fuente A vs Fuente B\n\n| Proceso | Fuente A | Fuente B | Decision | Motivo |\n| --- | --- | --- | --- | --- |\n| Revenue Management | strategic / Responsable Revenue / Analista Revenue | etapas=5 / apoyos=Gerente General, Analista Datos TI | Combinar | Fuente A para ficha; Fuente B para etapas y apoyo operativo. |\n| Dirección y Planificación Operacional | strategic / Gerente General | etapas=4 / apoyos=Jefe Operaciones, Gerente Finanzas | Combinar | Fuente A para ficha; Fuente B para etapas y apoyo operativo. |\n| Estrategia Comercial y Alianzas | strategic / TI / Comercial | etapas=5 / apoyos=Gerente General, Revenue | Combinar | Fuente A para ficha; Fuente B para etapas y apoyo operativo. |\n| Planificación de Capacidad y Ocupación | strategic / Jefe Operaciones | etapas=4 / apoyos=Revenue, Analista Datos TI | Combinar | Fuente A para ficha; Fuente B para etapas y apoyo operativo. |\n| Reservas McParking | operational / Jefe Operaciones | etapas=6 / apoyos=Atencion al Cliente, TI / Comercial | Combinar | Fuente A para ficha; Fuente B para etapas y apoyo operativo. |\n| Cotización y Reserva Online | operational / TI / Comercial | etapas=4 / apoyos=Revenue, Atencion al Cliente | Combinar | Fuente A para ficha; Fuente B para etapas y apoyo operativo. |\n| Check-in y Recepción del Vehículo | operational / Jefe Operaciones | etapas=5 / apoyos=Atencion al Cliente | Combinar | Fuente A para ficha; Fuente B para etapas y apoyo operativo. |\n| Custodia del Vehículo | operational / Jefe Operaciones | etapas=5 / apoyos=Obras Civiles, Equipo Operativo | Combinar | Fuente A para ficha; Fuente B para etapas y apoyo operativo. |\n| Traslado al Aeropuerto | operational / Jefe Operaciones | etapas=4 / apoyos=Equipo Operativo | Combinar | Fuente A para ficha; Fuente B para etapas y apoyo operativo. |\n| Atención al Cliente Operacional | operational / Atención al Cliente | etapas=5 / apoyos=Jefe Operaciones | Combinar | Fuente A para ficha; Fuente B para etapas y apoyo operativo. |\n| Check-out y Entrega del Vehículo | operational / Jefe Operaciones | etapas=5 / apoyos=Atencion al Cliente | Combinar | Fuente A para ficha; Fuente B para etapas y apoyo operativo. |\n| Gestión de Incidencias Operativas | operational / Jefe Operaciones | etapas=5 / apoyos=Atencion al Cliente, Gerente General | Combinar | Fuente A para ficha; Fuente B para etapas y apoyo operativo. |\n| Cierre Operacional, Liquidación y Cobranza a Inversionistas | support / Gerente Finanzas | etapas=5 / apoyos=Analista Contable, Gerente General | Combinar | Fuente A para ficha; Fuente B para etapas y apoyo operativo. |\n| Finanzas y Contabilidad | support / Analista Contable | etapas=5 / apoyos=Gerente Finanzas | Combinar | Fuente A para ficha; Fuente B para etapas y apoyo operativo. |\n| Sistemas y Datos | support / Analista Datos TI | etapas=5 / apoyos=TI / Comercial | Combinar | Fuente A para ficha; Fuente B para etapas y apoyo operativo. |\n| Infraestructura y Mantenciones | support / Obras Civiles | etapas=6 / apoyos=Jefe Operaciones | Combinar | Fuente A para ficha; Fuente B para etapas y apoyo operativo. |\n| Personas y Turnos | support / Encargado de Turnos / Personas | etapas=5 / apoyos=Jefe Operaciones | Combinar | Fuente A para ficha; Fuente B para etapas y apoyo operativo. |\n| Gestión de Proveedores | support / Encargado de Proveedores | etapas=5 / apoyos=Finanzas, Operaciones | Combinar | Fuente A para ficha; Fuente B para etapas y apoyo operativo. |\n| Control Documental y Administración | support / Analista Contable | etapas=6 / apoyos=Gerente Finanzas | Combinar | Fuente A para ficha; Fuente B para etapas y apoyo operativo. |\n\n## Etapas de prueba detectadas\n\n- `Reservas McParking` contiene etapa `test8`: archivar, no borrar.\n- `Cierre Operacional, Liquidación y Cobranza a Inversionistas` contiene etapa `aaaaaaa`: archivar, no borrar.\n\n## Campos que se pueden cargar inmediatamente\n\n- `processes.name`\n- `processes.process_type`\n- `processes.objective`\n- `processes.inputs_providers`\n- `processes.outputs_clients`\n- `processes.basic_kpi`\n- `processes.area_id por nombre de area`\n- `processes.owner_company_id`\n- `processes.operating_company_id`\n- `subprocesses.name`\n- `subprocesses.sort_order`\n- process_roles para rol dueno y apoyo cuando haya match exacto con roles.name\n\n## Campos que quedan NULL\n\n- `description`: no hay descripcion distinta al objetivo.\n- `expected_result`: no se duplica `outputs_clients`; queda reservado para resultado esperado si se define explicitamente.\n- `subprocesses.description`: Fuente B no entrega descripcion formal por etapa.\n- `subprocesses.criticality`: Fuente B no entrega criticidad por etapa; la migracion usa default tecnico si inserta.\n\n## Propuesta final para ficha completa\n\nOpcion recomendada: columnas simples en `processes`: `inputs_providers text`, `outputs_clients text`, `basic_kpi text`.\n\nMapeo: `objective` -> `processes.objective`, `inputs_providers` -> columna nueva, `outputs_clients` -> columna nueva, `basic_kpi` -> columna nueva. `expected_result` no se usa para evitar duplicar salidas/clientes sin una definicion semantica propia.\n\n## Mapeo de roles\n\n| Rol solicitado | Rol existente | Estado |\n| --- | --- | --- |\n| Gerente General | Gerente General | exact: match directo. |\n| TI / Comercial | TI / Comercial | exact: match directo. |\n| Jefe Operaciones | Jefe Operaciones | exact: match directo. |\n| Atención al Cliente | Atencion al Cliente | exact: Same role; DB currently stores the ASCII spelling. |\n| Atencion al Cliente | Atencion al Cliente | exact: match directo. |\n| Gerente Finanzas | Gerente Finanzas | exact: match directo. |\n| Analista Contable | Analista Contable | exact: match directo. |\n| Analista Datos TI | Analista Datos TI | exact: match directo. |\n| Obras Civiles | Obras Civiles | exact: match directo. |\n| Responsable Revenue / Analista Revenue | - | missing: Requires user decision: create role or map to an existing role. |\n| Revenue Management | - | ambiguous: Manual/source uses a process or discipline label; requires concrete role. |\n| Revenue | - | ambiguous: Could mean a role or area; requires user decision. |\n| Equipo Operativo | - | ambiguous: Document uses this as person/team reference, not a role row. |\n| Finanzas | - | ambiguous: Area-level label; requires concrete role. |\n| Operaciones | - | ambiguous: Area-level label; requires concrete role. |\n| Encargado de Turnos / Personas | - | missing: Role does not exist in v_role_dictionary. |\n| Encargado de Proveedores | - | missing: Role does not exist in v_role_dictionary. |\n\n## Discrepancias y pendientes\n\n- Algunos roles de apoyo son areas o equipos, no roles exactos.\n- `Responsable Revenue / Analista Revenue`, `Encargado de Turnos / Personas` y `Encargado de Proveedores` requieren decision de creacion o mapeo.\n- La migracion conserva relaciones reales existentes y solo agrega relaciones con match exacto.\n- Los nombres finales quedan con acentos segun Fuente A; la migracion normaliza nombres heredados conocidos para preservar IDs cuando sea posible.\n- `expected_result` queda sin poblar para no duplicar `outputs_clients`.\n\n## SQL de validacion preparado\n\nAntes/despues usar las consultas comentadas al final de la migracion preparada.\n\n## Decision recomendada para ETAPA 3\n\n1. Confirmar si se crean roles faltantes de Revenue, Turnos/Personas y Proveedores.\n2. Confirmar mapeos para `Revenue`, `Equipo Operativo`, `Finanzas` y `Operaciones`.\n3. Confirmar aplicacion manual del SQL preparado en Supabase SQL Editor.\n4. Ejecutar validaciones SQL post-aplicacion antes de avanzar a UI/datos adicionales.\n

## Preflight Etapa 3A

### Estado remoto read-only

- Procesos remotos totales: 21.
- Procesos activos actuales: 6.
- Activos por tipo actual: strategic 1, operational 3, support 2.
- No se ejecutaron escrituras remotas.

### Mapa definitivo de roles dueño

| Proceso | Rol Fuente A | Rol Fuente B/persona ref. | Rol existente | ID | Clasificación | Decisión propuesta |
| --- | --- | --- | --- | --- | --- | --- |
| Revenue Management | Responsable Revenue / Analista Revenue | Por asignar | - | - | INEXISTENTE | D: requiere decisión; crear rol funcional o mapear explícitamente. |
| Dirección y Planificación Operacional | Gerente General | German | Gerente General | ce2bfa79 | EXACTO | Usar rol existente. |
| Estrategia Comercial y Alianzas | TI / Comercial | Jose Luis | TI / Comercial | 10771b45 | EXACTO | Usar rol existente. |
| Planificación de Capacidad y Ocupación | Jefe Operaciones | Diego Vera | Jefe Operaciones | d5aeb1c1 | EXACTO | Usar rol existente. |
| Reservas McParking | Jefe Operaciones | Diego Vera | Jefe Operaciones | d5aeb1c1 | EXACTO | Usar rol existente. |
| Cotización y Reserva Online | TI / Comercial | Jose Luis | TI / Comercial | 10771b45 | EXACTO | Usar rol existente. |
| Check-in y Recepción del Vehículo | Jefe Operaciones | Diego Vera | Jefe Operaciones | d5aeb1c1 | EXACTO | Usar rol existente. |
| Custodia del Vehículo | Jefe Operaciones | Diego Vera | Jefe Operaciones | d5aeb1c1 | EXACTO | Usar rol existente. |
| Traslado al Aeropuerto | Jefe Operaciones | Diego Vera | Jefe Operaciones | d5aeb1c1 | EXACTO | Usar rol existente. |
| Atención al Cliente Operacional | Atención al Cliente | Equipo Operativo | Atencion al Cliente | 1c13855a | EQUIVALENTE_SEGURO | Usar rol existente; diferencia solo de acento. |
| Check-out y Entrega del Vehículo | Jefe Operaciones | Diego Vera | Jefe Operaciones | d5aeb1c1 | EXACTO | Usar rol existente. |
| Gestión de Incidencias Operativas | Jefe Operaciones | Diego Vera | Jefe Operaciones | d5aeb1c1 | EXACTO | Usar rol existente. |
| Cierre Operacional, Liquidación y Cobranza a Inversionistas | Gerente Finanzas | Sin persona asignada | Gerente Finanzas | bc9176e9 | EXACTO | Usar rol existente; persona primaria nula. |
| Finanzas y Contabilidad | Analista Contable | Romario Larenas | Analista Contable | bdb81177 | EXACTO | Usar rol existente. |
| Sistemas y Datos | Analista Datos TI | Agustin Zilleruelo | Analista Datos TI | e2f8a7b5 | EXACTO | Usar rol existente. |
| Infraestructura y Mantenciones | Obras Civiles | Nicolas Valdes | Obras Civiles | 6f0a82e5 | EXACTO | Usar rol existente. |
| Personas y Turnos | Encargado de Turnos / Personas | Por asignar | - | - | INEXISTENTE | D: requiere decisión; crear rol o dejar sin relación temporal. |
| Gestión de Proveedores | Encargado de Proveedores | Por asignar | - | - | INEXISTENTE | D: requiere decisión; crear rol o dejar sin relación temporal. |
| Control Documental y Administración | Analista Contable | Romario Larenas | Analista Contable | bdb81177 | EXACTO | Usar rol existente. |

### Roles de apoyo

| Etiqueta apoyo | Rol existente | ID | Clasificación | Decisión |
| --- | --- | --- | --- | --- |
| Gerente General | Gerente General | ce2bfa79 | EXACTO | Usar. |
| Analista Datos TI | Analista Datos TI | e2f8a7b5 | EXACTO | Usar. |
| Jefe Operaciones | Jefe Operaciones | d5aeb1c1 | EXACTO | Usar. |
| Gerente Finanzas | Gerente Finanzas | bc9176e9 | EXACTO | Usar. |
| Atencion al Cliente | Atencion al Cliente | 1c13855a | EXACTO | Usar. |
| TI / Comercial | TI / Comercial | 10771b45 | EXACTO | Usar. |
| Obras Civiles | Obras Civiles | 6f0a82e5 | EXACTO | Usar. |
| Analista Contable | Analista Contable | bdb81177 | EXACTO | Usar. |
| Revenue | - | - | NO_ES_ROL | No mapear automáticamente; parece área/disciplina. |
| Equipo Operativo | - | - | NO_ES_ROL | No mapear automáticamente; en BD aparece como persona/equipo, no rol. |
| Finanzas | - | - | NO_ES_ROL | No mapear automáticamente; es área. |
| Operaciones | - | - | NO_ES_ROL | No mapear automáticamente; es área. |

### Persona Fuente B vs BD

- Coinciden 15 de 19 por persona primaria derivada desde `person_roles`.
- No coinciden por diseño o falta de rol/persona: Revenue Management, Cierre Operacional/Liquidación/Cobranza, Personas y Turnos, Gestión de Proveedores.
- `Gerente Finanzas` existe, pero sin persona primaria activa.
- Persona actual seguirá siendo derivada; no se duplica en `processes`.

### Procesos reutilizables confirmados

| Proceso destino | ID reutilizable | Nombre actual remoto | Estado | Observación |
| --- | --- | --- | --- | --- |
| Revenue Management | 75ed7877 | Revenue Management | active | Reutilizar/actualizar. |
| Planificación de Capacidad y Ocupación | bf2dc545 | Planificación de capacidad y ocupación | active | Reutilizar/actualizar y corregir tipo a strategic. |
| Reservas McParking | c18ae10b | Reservas McParking | active | Reutilizar; contiene etapa test8 activa. |
| Cierre Operacional, Liquidación y Cobranza a Inversionistas | 980dd2a7 | Cierre Operacional, Liquidacion y Cobranza a Inversionistas | active | Reutilizar; contiene etapa aaaaaaa activa. |

### Basura de prueba identificada

- Proceso activo `contabilidad test` (`e9fb0310`): archivar.
- Proceso activo `teeeest` (`28a9c550`): archivar.
- Etapa activa `test8` en `Reservas McParking` (`2259cb96`): archivar.
- Etapa activa `aaaaaaa` en `Cierre Operacional, Liquidacion y Cobranza a Inversionistas` (`3ef009cc`): archivar.

### Simulación lógica

| Métrica | Resultado |
| --- | ---: |
| Procesos activos antes | 6 |
| Procesos a archivar | 2 |
| Procesos a reutilizar/actualizar | 4 |
| Procesos a crear | 15 |
| Procesos activos después | 19 |
| strategic después | 4 |
| operational después | 8 |
| support después | 7 |
| Etapas esperadas desde Fuente B | 94 |
| Relaciones owner resolubles | 16/19 |
| Relaciones support resolubles | 22/29 |
| Dueños pendientes | 3 |
| Apoyos pendientes/no rol | 7 ocurrencias |

### Matriz final de migración

- ARCHIVAR: `contabilidad test`, `teeeest`, demos/test históricos si vuelven a estar activos; etapas `test8` y `aaaaaaa`.
- REUTILIZAR / ACTUALIZAR: Revenue Management, Planificación de Capacidad y Ocupación, Reservas McParking, Cierre Operacional/Liquidación/Cobranza.
- CREAR: los otros 15 procesos del catálogo maestro.
- ACTUALIZAR: fichas documentales completas, tipo, status, áreas y relaciones exactas.

### SQL read-only pre Etapa 3B

```sql
select count(*) as processes_total from public.processes;
select status::text, process_type::text, count(*) from public.processes group by status, process_type order by status, process_type;

select p.id, c.name as company_name, p.name, p.process_type::text, p.status::text
from public.processes p
join public.companies c on c.id = p.company_id
where lower(unaccent(p.name)) in (
  lower(unaccent('Revenue Management')),
  lower(unaccent('Planificación de Capacidad y Ocupación')),
  lower(unaccent('Reservas McParking')),
  lower(unaccent('Cierre Operacional, Liquidación y Cobranza a Inversionistas'))
)
order by p.name;

select r.id, r.name, r.role_code, r.status::text
from public.roles r
where r.status = 'active'
  and lower(unaccent(r.name)) in (
    lower(unaccent('Gerente General')),
    lower(unaccent('TI / Comercial')),
    lower(unaccent('Jefe Operaciones')),
    lower(unaccent('Atención al Cliente')),
    lower(unaccent('Gerente Finanzas')),
    lower(unaccent('Analista Contable')),
    lower(unaccent('Analista Datos TI')),
    lower(unaccent('Obras Civiles'))
  )
order by r.name;

select p.name as process_name, sp.id, sp.name as stage_name, sp.status::text, sp.sort_order
from public.subprocesses sp
join public.processes p on p.id = sp.process_id
where lower(sp.name) in ('test8', 'aaaaaaa')
   or lower(unaccent(p.name)) in (
     lower(unaccent('Reservas McParking')),
     lower(unaccent('Cierre Operacional, Liquidación y Cobranza a Inversionistas'))
   )
order by p.name, sp.sort_order;
```

Nota: si `unaccent` no está disponible en Supabase SQL Editor, reemplazar esas comparaciones por `lower(name)` y las variantes exactas con/sin acento ya documentadas.

### SQL read-only post Etapa 3B

```sql
select count(*) as active_processes
from public.processes
where status = 'active';

select process_type::text, count(*)
from public.processes
where status = 'active'
group by process_type
order by process_type;

select name, count(*)
from public.processes
where status = 'active'
group by name
having count(*) > 1;

select count(*) filter (where objective is not null) as objective_count,
       count(*) filter (where inputs_providers is not null) as inputs_count,
       count(*) filter (where outputs_clients is not null) as outputs_count,
       count(*) filter (where basic_kpi is not null) as kpi_count
from public.processes
where status = 'active';

select p.name
from public.processes p
where p.status = 'active'
  and (p.name ilike 'DEMO MAPA -%' or lower(p.name) in ('contabilidad test', 'teeeest', 'proceso demo mapa.', 'test1l'));

select sp.*
from public.subprocesses sp
left join public.processes p on p.id = sp.process_id
where p.id is null;

select pr.*
from public.process_roles pr
left join public.processes p on p.id = pr.process_id
left join public.roles r on r.id = pr.role_id
where p.id is null or r.id is null;
```

### Decisiones pendientes antes de Etapa 3B

1. Crear o no `Responsable Revenue / Analista Revenue`.
2. Crear o no `Encargado de Turnos / Personas`.
3. Crear o no `Encargado de Proveedores`.
4. Confirmar que `Revenue`, `Equipo Operativo`, `Finanzas` y `Operaciones` no deben generar relaciones hasta tener roles concretos.
5. Confirmar aplicación manual del SQL preparado y validación post-aplicación.


## Etapa 3B.3 - Reconciliacion de etapas heredadas

### Estado remoto confirmado post aplicacion principal

La migracion principal `20260810160000_prepare_process_catalog_v2.sql` fue aplicada manualmente en Supabase SQL Editor. El estado remoto confirmado despues de la aplicacion principal fue:

| Metrica | Resultado |
| --- | ---: |
| Procesos activos | 19 |
| Strategic | 4 |
| Operational | 8 |
| Support | 7 |
| Procesos con objective | 19/19 |
| Procesos con inputs_providers | 19/19 |
| Procesos con outputs_clients | 19/19 |
| Procesos con basic_kpi | 19/19 |
| Procesos con owner | 19/19 |
| Subprocesses huerfanos | 0 |
| Process_roles huerfanos | 0 |
| test8 | archived |
| aaaaaaa | archived |

El error `_process_catalog_v2` correspondio a una consulta de validacion posterior que intentaba leer una tabla temporal despues del `commit`. La carga principal persistio correctamente: procesos, campos de ficha, roles nuevos, relaciones y archivo de pruebas quedaron aplicados segun los postchecks remotos.

### Discrepancia detectada

| Concepto | Conteo |
| --- | ---: |
| Etapas Fuente B esperadas | 94 |
| Etapas activas actuales | 109 |
| Diferencia | 15 |
| Etapas antiguas en backup pre-aplicacion | 17 |
| Etapas test archivadas | 2 |
| Etapas heredadas activas restantes | 15 |

Conclusion: se confirma la hipotesis `94 + 15 = 109`. La migracion principal inserto las etapas nuevas de Fuente B y preservo etapas reales existentes bajo procesos reutilizados. Las pruebas `test8` y `aaaaaaa` si quedaron archivadas; las otras 15 etapas heredadas siguieron activas.

### Diferencias por proceso

| Proceso | Etapas Fuente B | Etapas activas actuales | Diferencia |
| --- | ---: | ---: | ---: |
| Revenue Management | 5 | 6 | +1 |
| Reservas McParking | 6 | 13 | +7 |
| Cierre Operacional, Liquidacion y Cobranza a Inversionistas | 5 | 12 | +7 |

### Etapas heredadas activas

| ID | Proceso | Etapa | Sort | Clasificacion | Match V2 | Dependencias actuales |
| --- | --- | --- | ---: | --- | --- | --- |
| 88188b89 | Reservas McParking | Sitioweb McParking.cl | 1 | LEGACY_NO_V2 | - | process_roles 3, systems 2, risks 1, controls 0, metrics 0 |
| 41a75020 | Reservas McParking | Metodo de pago | 2 | DUPLICADA_V2 | Pago | process_roles 3, systems 2, risks 1, controls 0, metrics 0 |
| c5ad56f5 | Reservas McParking | Precio y descuentos | 3 | LEGACY_NO_V2 | - | process_roles 3, systems 3, risks 1, controls 0, metrics 0 |
| 6de322e7 | Reservas McParking | Confirmacion de reserva | 4 | DUPLICADA_V2 | Confirmacion | process_roles 3, systems 3, risks 1, controls 0, metrics 0 |
| 83dd3297 | Reservas McParking | Conciliacion banco vs Transbank | 7 | LEGACY_NO_V2 | - | process_roles 3, systems 4, risks 1, controls 0, metrics 0 |
| 0f7199d9 | Revenue Management | Dashboard de Revenue | null | LEGACY_NO_V2 | - | process_roles 3, systems 3, risks 0, controls 0, metrics 0 |
| a7425934 | Reservas McParking | Emision de boleta | 5 | LEGACY_NO_V2 | - | process_roles 3, systems 2, risks 1, controls 0, metrics 0 |
| 23389806 | Reservas McParking | Registro en Banco de Reservas | 6 | LEGACY_NO_V2 | - | process_roles 3, systems 4, risks 1, controls 0, metrics 0 |
| 19035b37 | Cierre Operacional, Liquidacion y Cobranza a Inversionistas | Liquidaciones | 2 | LEGACY_NO_V2 | - | process_roles 3, systems 3, risks 1, controls 0, metrics 0 |
| f995a93e | Cierre Operacional, Liquidacion y Cobranza a Inversionistas | Cobranza | 3 | LEGACY_NO_V2 | - | process_roles 3, systems 5, risks 1, controls 0, metrics 0 |
| b99f0c71 | Cierre Operacional, Liquidacion y Cobranza a Inversionistas | Pagos / Nominas | 4 | LEGACY_NO_V2 | - | process_roles 3, systems 2, risks 1, controls 0, metrics 0 |
| 0fff1b5e | Cierre Operacional, Liquidacion y Cobranza a Inversionistas | Inversionistas | 5 | LEGACY_NO_V2 | - | process_roles 3, systems 2, risks 1, controls 0, metrics 0 |
| f9605417 | Cierre Operacional, Liquidacion y Cobranza a Inversionistas | Dashboard inversionista | 6 | LEGACY_NO_V2 | - | process_roles 3, systems 1, risks 1, controls 0, metrics 0 |
| d1e4e4c0 | Cierre Operacional, Liquidacion y Cobranza a Inversionistas | Debug / Auditoria | 7 | LEGACY_NO_V2 | - | process_roles 3, systems 3, risks 1, controls 0, metrics 0 |
| acf3d518 | Cierre Operacional, Liquidacion y Cobranza a Inversionistas | Operacion | 1 | LEGACY_NO_V2 | - | process_roles 3, systems 2, risks 1, controls 0, metrics 0 |

### Etapas test ya archivadas

| ID | Proceso | Etapa | Estado actual | Dependencias |
| --- | --- | --- | --- | --- |
| 2259cb96 | Reservas McParking | test8 | not_active / archived | 0 |
| 3ef009cc | Cierre Operacional, Liquidacion y Cobranza a Inversionistas | aaaaaaa | not_active / archived | 0 |

### Duplicados y conflictos actuales

Los duplicados no son necesariamente por nombre exacto; el problema principal es que los `sort_order` antiguos y los nuevos conviven bajo los mismos procesos. Se detectaron duplicados de `sort_order` en `Reservas McParking` y en `Cierre Operacional, Liquidacion y Cobranza a Inversionistas`. Dos etapas heredadas tambien tienen duplicado conceptual claro con Fuente B: `Metodo de pago` vs `Pago` y `Confirmacion de reserva` vs `Confirmacion`.

### Explicacion de relaciones owner = 109

El modelo real de `process_roles` conserva relaciones con `process_id` y tambien con `subprocess_id`. El postcheck devolvio `relaciones_owner = 109` porque existe una relacion `owner` por cada etapa activa. Al haber 109 etapas activas, existen 109 relaciones owner asociadas a esos subprocesses activos. No hay orphan `process_roles`; al archivar las 15 etapas, sus relaciones historicas quedan intactas pero dejan de contarse en vistas/postchecks filtrados por etapas activas.

### Estado final recomendado

- Mantener 19 procesos activos.
- Mantener las 94 etapas Fuente B como las unicas etapas activas del catalogo V2.
- Archivar las 15 etapas heredadas por UUID exacto.
- No borrar subprocesses.
- No borrar process_roles, systems, risks, controls ni metrics asociados.
- Mantener `test8` y `aaaaaaa` archivadas.

### SQL correctivo preparado

Se preparo la migracion correctiva separada:

`supabase/migrations/20260811143000_reconcile_process_catalog_v2_stages.sql`

Caracteristicas:

- Transaccional (`begin;` / `commit;`).
- Archiva solo los 15 UUIDs confirmados.
- No contiene `delete`, `truncate`, `drop table` ni `alter table`.
- No recrea procesos.
- No recrea etapas Fuente B.
- No toca roles salvo preservar relaciones historicas existentes.
- Tiene guardas de preestado: 19 procesos activos, 109 etapas activas, 15 target legacy activas, `test8` y `aaaaaaa` no activas.
- Tiene postcondicion: 94 etapas activas.

### Correccion a migracion original local

Tambien se corrigio localmente `20260810160000_prepare_process_catalog_v2.sql` para futuras instalaciones:

- Despues de insertar/actualizar etapas Fuente B, archiva etapas activas heredadas que no pertenecen al set Fuente B de cada proceso objetivo.
- Mantiene historico por `status = archived`; no borra filas.
- Evita que una instalacion futura termine nuevamente con 109 etapas activas.
- Ajusta comentarios de postcheck para esperar `active subprocesses = 94` y no depender de la tabla temporal `_process_catalog_v2` despues del `commit`.

### SQL read-only recomendado post correccion 3B.3

```sql
select count(*) as active_processes
from public.processes
where status = 'active';

select count(*) as active_subprocesses
from public.subprocesses sp
join public.processes p on p.id = sp.process_id
where p.status = 'active'
  and sp.status = 'active';

select p.name as process_name, count(*) as active_stages
from public.subprocesses sp
join public.processes p on p.id = sp.process_id
where p.status = 'active'
  and sp.status = 'active'
group by p.name
order by p.name;

select sp.id, p.name as process_name, sp.name as stage_name, sp.status::text
from public.subprocesses sp
join public.processes p on p.id = sp.process_id
where sp.id in (
  '88188b89-13c7-46ce-a0a7-a227ba8d6024',
  '41a75020-30d6-4f0f-a5ee-809ee4d0d537',
  'c5ad56f5-e456-48d0-bd24-2599e9bbffa7',
  '6de322e7-4b67-4db3-9609-75d198b2f935',
  '83dd3297-f9b8-4af4-8233-732cd35db067',
  '0f7199d9-6042-4503-b6fa-ccde6ba75131',
  'a7425934-c8ff-4607-9c10-28948187c8bf',
  '23389806-087b-474e-8336-7aab1b75200c',
  '19035b37-5ad2-47e2-9b1d-ef172ca38189',
  'f995a93e-bdc7-4d6a-9a9c-a89da4da6b26',
  'b99f0c71-78aa-4f75-89b0-cc56204bf23b',
  '0fff1b5e-3cd1-46f1-b656-1b8751648d2c',
  'f9605417-7d93-44bf-a14e-733325ba47d1',
  'd1e4e4c0-0428-43c4-9c3f-fbedd427ffb7',
  'acf3d518-6fc3-4ef6-a2fa-2108dbc332a0'
)
order by p.name, sp.sort_order nulls last, sp.name;
```


## Etapa 3B.5 - Reparacion tras archivado accidental de etapas

### Accidente operacional

Se ejecuto accidentalmente en Supabase:

```sql
update public.subprocesses
set status = 'archived';
```

No hubo `DELETE`; ninguna fila fue borrada. El estado remoto confirmado inmediatamente despues fue:

| Metrica | Resultado |
| --- | ---: |
| Total subprocesses | 111 |
| Active subprocesses | 0 |
| Archived subprocesses | 111 |
| Procesos activos | 19 |
| Strategic | 4 |
| Operational | 8 |
| Support | 7 |
| Etapas V2 existentes | 94 |
| Etapas V2 archivadas | 94 |
| Legacy 15 archivadas | 15 |
| test8 | archived |
| aaaaaaa | archived |

### Estado final correcto

- 94 etapas del catalogo V2 deben volver a `active`.
- 15 etapas legacy deben quedar `archived`.
- `test8` debe quedar `archived`.
- `aaaaaaa` debe quedar `archived`.
- Total final esperado: 111 subprocesses = 94 active + 17 archived.

### Migracion de reparacion preparada

Se preparo la migracion:

`supabase/migrations/20260811160000_restore_process_catalog_v2_active_stages.sql`

Caracteristicas:

- Transaccional.
- Generada desde `supabase/seeds/process_catalog_v2.json`.
- Contiene exactamente las 94 etapas V2 por `process_name + stage_name`.
- Resuelve UUIDs reales antes del UPDATE.
- Actualiza solo `public.subprocesses.status`.
- No toca `processes`, `process_roles`, `roles`, `people`, `process_systems`, `risks`, `controls`, `metrics` ni `process_clients`.
- Tiene precondiciones: 19 procesos activos, 111 subprocesses totales, 0 activos, 111 archivados, 94 V2 existentes y archivados, 17 no V2 archivados.
- Tiene postcondiciones: 94 activos, 17 archivados, 111 totales, las 94 V2 activas y conteo activo esperado por los 19 procesos.


## Etapa 3B.6 - Reconciliacion por UUID antes de restaurar

La revision read-only posterior al precheck manual confirmo el estado remoto actual:

| Metrica | Resultado |
| --- | ---: |
| Total subprocesses | 111 |
| Active subprocesses | 0 |
| Archived subprocesses | 111 |
| Procesos activos | 19 |
| UUID excluidos legacy/test | 17 |
| UUID V2 por exclusion matematica | 94 |
| Interseccion V2/excluidos | 0 |

La derivacion autoritativa para la reparacion pasa a ser por identidad fisica: todos los `subprocesses` actuales menos los 17 UUID legacy/test conocidos. Esa resta produce exactamente 94 UUID unicos, todos asociados a procesos activos y sin filas demo/test adicionales.

El archivo `20260811160000_restore_process_catalog_v2_active_stages.sql` fue corregido para restaurar por UUID exacto. Ya no depende de `process_name + stage_name` para el UPDATE. Solo ejecuta:

- `update public.subprocesses set status = 'active'` para los 94 UUID V2.
- Mantiene archived los 17 UUID legacy/test.
- No toca ninguna otra tabla ni columna.

La comparacion read-only actual no reprodujo el deficit 72/94: las 94 filas remotas actuales si tienen coincidencia exacta con `process_catalog_v2.json`. Por eso no se modifico el JSON en esta etapa.
