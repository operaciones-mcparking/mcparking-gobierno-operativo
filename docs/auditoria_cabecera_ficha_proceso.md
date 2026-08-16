# Auditoria cabecera ficha de proceso

Etapa: 8B.7D.1. Solo auditoria y propuesta. No implementa UI, schema, migraciones ni datos.

## Estado inicial

- Repositorio: `C:\Users\McParking\Documents\red de roles, procesos, areas y responsables`.
- Rama esperada y validada: `main`.
- HEAD validado: `d54bc24`.
- `origin/main` validado despues de `git fetch origin`: `d54bc24`.
- Working tree: contiene el WIP local esperado de 8B.7C, no commiteado.
- No se hizo reset, restore, stash ni clean.

## Cabecera objetivo

La cabecera documental futura debe alimentar web y PDF desde el mismo `ProcessMasterDto`:

| Campo visible | Semantica | Fuente recomendada |
| --- | --- | --- |
| Proceso | Nombre documental y operativo del proceso | `public.processes.name` |
| Codigo | Codigo documental unico, no UUID tecnico | `public.processes.process_code` generado server-side |
| Dueno del proceso | Rol funcional oficial global del proceso | Nueva relacion explicita a `public.roles` |
| Persona actual | Persona primaria derivada desde el rol | `roles -> person_roles -> people` o `public.v_role_dictionary` |
| Version | Version documental vigente publicada | `public.processes.version` para vigente + historial futuro |
| Ultima edicion | Ultimo cambio de la ficha completa | Requiere estrategia mayor que `processes.updated_at` |
| Estado | Estado operativo simplificado | `processes.status`: inactive/active/archived |

## Estado actual del owner del proceso

Hoy no existe un dueno global explicito del proceso.

El modelo actual usa `public.process_roles`, que contiene:

- `process_id` obligatorio.
- `subprocess_id` nullable.
- `role_id` obligatorio.
- `responsibility_type` obligatorio.
- `impact_percent`, `criticality`, `is_required`, `notes`.
- Unique actual: `(process_id, subprocess_id, role_id, responsibility_type)`.

En la practica V2, `process_roles` esta funcionando como relacion por etapa/subproceso. La vista `public.v_process_subprocess_matrix_v2` une `process_roles` por `subprocess_id` para owner/user/support/backup. La vista `public.v_process_catalog_v2` agrega roles owner desde relaciones existentes, pero eso no equivale a un dueno global unico.

Conclusion: el owner global no debe deducirse automaticamente desde el owner de una etapa.

## Fuente oficial para dropdown

La fuente correcta para el dropdown es el diccionario oficial de roles activos, actualmente expuesto por `public.v_role_dictionary` y usado por `/estructura` y por pantallas de edicion de etapas.

La vista entrega, entre otros:

- `role_id`.
- `role_name`.
- `role_status`.
- `area_name`.
- `company_name`.
- `current_person_id`.
- `current_person_name`.

La vista filtra `where r.status = 'active'::public.record_status`, por lo que ya excluye roles archivados. El dropdown no debe aceptar texto libre, personas ni roles fuera de esta fuente.

## Persona actual derivada

La persona no debe guardarse en `processes` ni seleccionarse manualmente.

Derivacion recomendada:

1. Owner global apunta a un rol oficial activo.
2. El rol se resuelve contra `public.v_role_dictionary`.
3. `current_person_name` viene desde `person_roles` activo, primario, vigente y compatible con contexto.
4. Si no existe persona primaria vigente, UI muestra `Sin persona asignada`.

Esto mantiene una sola fuente de verdad para asignaciones persona-rol.

## Opciones de modelado para owner global

### Opcion A: `processes.owner_role_id`

Agregar columna nullable:

```sql
owner_role_id uuid references public.roles(id) on delete restrict
```

Ventajas:

- Muy clara para un unico dueno global.
- Facil de consultar para cabecera, PDF y listados.
- Evita mezclar semantica de etapa con semantica documental global.
- Dropdown simple: guarda un `role_id` oficial.
- Facil para futura descripcion de cargo: `roles -> procesos donde soy owner global`.
- Nullable permite migracion sin backfill automatico de los 19 procesos.

Desventajas:

- Requiere migracion de `processes`.
- Si un rol se archiva, el FK conserva integridad pero la UI debe mostrar `Rol archivado` o exigir reemplazo antes de publicar version.
- No guarda textos de responsabilidad/autoridad/accountability; eso corresponde mejor a `process_role_profiles`.

### Opcion B: `process_roles` sin `subprocess_id`

Usar una fila `process_roles` con `subprocess_id is null`, `responsibility_type = 'owner'`.

Ventajas:

- Reutiliza tabla existente.
- Ya tiene `process_id`, `role_id`, `responsibility_type`.
- Puede convivir con relaciones por etapa si se define convención clara.

Desventajas:

- La tabla ya representa participacion operativa y se repite por etapa.
- `subprocess_id` nullable abre ambiguedad semantica: owner global vs owner sin etapa cargada.
- Las vistas actuales y tests tratan `process_roles` como base de etapas y agregados.
- La constraint unique con `subprocess_id` nullable no garantiza de forma simple un unico owner global por proceso en PostgreSQL si no se agrega indice parcial.
- Mayor riesgo de duplicados o interpretaciones incorrectas.

### Opcion C: `process_role_profiles`

Usar `process_role_profiles(process_id, role_id)` para representar el owner global.

Ventajas:

- Tabla de nivel proceso, no por etapa.
- Ya fue pensada para textos de responsabilidad, autoridad y accountability.
- Sirve para futura ficha maestra enriquecida.

Desventajas:

- Su semantica natural es perfil/documentacion de roles asociados al proceso, no seleccion de dueno unico.
- Puede haber muchos roles perfilados por proceso; no expresa cual es el owner global sin campo adicional.
- Usarla para owner requeriria flags o convenciones adicionales.
- Mezcla cabecera con documentacion de responsabilidades.

### Opcion D: tabla dedicada `process_owners`

Crear tabla:

```sql
process_owners (
  process_id uuid primary key references public.processes(id),
  role_id uuid not null references public.roles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
)
```

Ventajas:

- Semantica pura y extensible.
- Evita tocar `processes`.
- Permite historizar owner mas adelante.

Desventajas:

- Sobremodelado para un unico owner vigente.
- Mas joins para cabecera y PDF.
- Aumenta superficie de RLS y endpoints.

## Recomendacion owner

Recomiendo Opcion A: `public.processes.owner_role_id` nullable.

Motivo: para un unico dueno global, el modelo mas claro y mantenible es una FK directa en `processes`. `process_roles` debe conservarse para responsabilidades por etapa; `process_role_profiles` debe conservarse para descripciones de rol dentro de la ficha; y una tabla dedicada seria mas compleja de lo necesario en esta etapa.

Reglas recomendadas:

- Nullable al inicio.
- FK `on delete restrict`.
- Validacion server-side: solo roles activos de `v_role_dictionary` o tabla `roles` con `status='active'`.
- No asignar persona manualmente.
- No inferir owner de los 19 procesos sin aprobacion.
- Activacion futura puede exigir owner global cuando el usuario lo apruebe.

## Estado actual de `process_code`

La migracion de ficha maestra agrego:

- `public.processes.process_code text`.
- Check: `process_code is null or btrim(process_code) <> ''`.
- Indice unico parcial case-insensitive: `lower(process_code)` cuando no es null.

Actualmente el codigo es nullable y no se genera automaticamente. Es correcto para transicion y borradores existentes.

## Estrategia de generacion de codigo

No recomiendo que el usuario escriba `process_code` manualmente.

Recomiendo generar codigo server-side al crear el borrador, dentro de una transaccion/RPC o Server Action con mecanismo atomico.

Opciones evaluadas:

1. Calcular `max(numero)+1` leyendo `processes`.
   - Simple, pero riesgoso con concurrencia si no hay lock.
2. Usar tabla de secuencias por prefijo/empresa.
   - Mas robusta para multiempresa.
3. Usar secuencia global PostgreSQL.
   - Muy robusta, pero pierde numeracion por empresa.

Recomendacion: tabla de secuencia documental por prefijo.

Modelo conceptual:

```sql
process_code_counters (
  prefix text primary key,
  last_number integer not null,
  updated_at timestamptz not null default now()
)
```

RPC futura:

- Resolver prefijo segun empresa.
- Tomar `pg_advisory_xact_lock` o hacer `insert ... on conflict ... update returning`.
- Incrementar contador.
- Construir codigo `PREFIX-PROC-0001`.
- Insertar proceso con `process_code` en la misma transaccion.
- Reintentar si el indice unico detecta colision excepcional.

## Estrategia multiempresa

No conviene asumir `MCP` para todos los procesos.

Opciones:

| Formato | Evaluacion |
| --- | --- |
| `MCP-PROC-001`, `ELA-PROC-001` | Claro para usuarios y separa empresas. Requiere prefijo por empresa. |
| `PROC-MCP-001`, `PROC-ELA-001` | Ordena por tipo de documento primero, menos natural para lectura rapida. |
| `PROC-0001` global | Simple y robusto, pero pierde contexto multiempresa. |
| UUID corto | Tecnico, no documental. No recomendado. |

Recomendacion: `MCP-PROC-0001`, `ELA-PROC-0001`, con prefijo documental configurable por empresa.

No usar `company.name` directamente como prefijo. Agregar o derivar formalmente `companies.document_prefix` en una etapa futura, o mantener un mapa server-side temporal revisado. Para MVP, si solo existen McParking y El Alba, se puede partir con prefijos aprobados `MCP` y `ELA`, pero la arquitectura debe permitir nuevas empresas.

## Backfill futuro de codigos

Para los 19 procesos activos existentes:

- No generar ni escribir codigos automaticamente en esta auditoria.
- Preparar propuesta read-only con orden estable.
- Orden sugerido para backfill: por `owner_company_id/company_id`, luego `process_type` en orden strategic/operational/support, luego nombre normalizado, o el orden oficial del catalogo V2 si se conserva en documentacion/migracion.
- Ejecutar backfill manual/aprobado en una migracion controlada.
- Mantener codigos nullable hasta completar decision.

## Estado actual de `version`

La columna `public.processes.version text` existe como campo vigente, nullable, sin historial asociado.

No hay tabla local o migracion especifica para `process_versions`, `process_revisions`, `process_history` o `process_change_log`. Si existe patron de snapshots en el proyecto, esta en Recuperacion (`recovery_weekly_snapshots`) y no debe reutilizarse directamente para procesos, aunque aporta una idea: snapshot estable, hash/idempotencia y comparacion posterior.

## Modelo recomendado de versionado

Distinguir explicitamente:

- Guardar cambios: edicion normal del borrador o de ficha vigente, no incrementa version por si sola.
- Publicar nueva version: evento controlado que crea snapshot historico e incrementa version.

Para MVP:

- Version inicial: `1.0` al crear/publicar primera ficha vigente.
- Boton futuro: `Publicar nueva version`.
- Opcion inicial: revision menor automatica `1.1`, `1.2`, `1.3`.
- Cambio mayor `2.0` puede quedar como seleccion manual posterior cuando exista UX clara.

## Snapshot vs audit log

### A. Snapshot JSONB completo de `ProcessMasterDto`

Ventajas:

- Permite abrir version historica tal como se veia.
- Alimenta PDF historico sin reconsultar tablas actuales.
- Captura 1:1, etapas, roles, persona derivada, metricas/documentos futuros.
- Es compatible con comparar versiones si el DTO es estable.

Desventajas:

- Duplicacion de datos.
- Requiere versionar shape del snapshot.

### B. Copia estructurada de columnas

Ventajas:

- Consultas SQL mas tipadas.
- Validaciones por columna mas simples.

Desventajas:

- Crece rapido con etapas, roles, metricas, riesgos, controles y documentos.
- Dificulta reconstruir la ficha completa historica sin muchas tablas historicas hijas.

### C. Audit log campo por campo

Ventajas:

- Excelente para saber que campo cambio y por quien.
- Bueno para compliance granular.

Desventajas:

- Malo como fuente primaria para renderizar version historica.
- Reconstruir estado requiere replay y es mas fragil.

### D. Modelo hibrido

Recomendacion: hibrido.

- `process_versions`: snapshot JSONB completo de `ProcessMasterDto` al publicar.
- `process_change_events` opcional mas adelante para auditoria campo por campo.

Esto resuelve primero abrir/PDF/comparar versiones, y deja auditoria granular para una etapa posterior.

## Schema propuesto para versiones

Tabla recomendada futura:

```sql
create table public.process_versions (
  id uuid primary key default gen_random_uuid(),
  process_id uuid not null references public.processes(id) on delete restrict,
  version text not null,
  snapshot jsonb not null,
  snapshot_schema_version text not null default 'process-master-v1',
  published_at timestamptz not null default now(),
  published_by uuid null,
  change_summary text null,
  created_at timestamptz not null default now(),
  unique (process_id, version),
  check (btrim(version) <> '')
);
```

Indices recomendados:

```sql
create index idx_process_versions_process_published_at
  on public.process_versions(process_id, published_at desc);
```

RLS/permisos: inicialmente server-side/service role para escritura. Lectura segun permisos actuales de procesos cuando se diseñe acceso final.

## Flujo `Publicar nueva version`

1. Usuario edita y guarda cambios sin incrementar version.
2. Usuario presiona `Publicar nueva version`.
3. Server valida ficha completa.
4. Server calcula siguiente version.
5. Server construye `ProcessMasterDto` completo desde una unica funcion read model.
6. Server inserta snapshot en `process_versions`.
7. Server actualiza `processes.version`, `effective_date` si corresponde, `documentation_status='documented'` y/o `status='active'` segun flujo.
8. UI muestra version vigente y permite abrir historicas.

## Ultima edicion

`processes.updated_at` existe y tiene trigger `set_processes_updated_at`, pero solo cambia cuando se actualiza `public.processes`.

La ficha completa puede cambiar por modificaciones en:

- `processes`.
- `subprocesses`.
- `process_roles`.
- `metrics`.
- `risks`.
- `controls`.
- `process_documents` futuro.
- `process_role_profiles` futuro.

Por lo tanto, `processes.updated_at` no basta si la cabecera quiere representar la ultima modificacion de la ficha completa.

Recomendacion futura:

- Agregar `processes.master_updated_at timestamptz` o `processes.last_document_change_at timestamptz`.
- Actualizarlo desde todas las Server Actions que cambian componentes de la ficha.
- En una etapa mas robusta, centralizar mutaciones en RPCs transaccionales que actualicen el padre.

MVP posible:

- Para la cabecera inicial, mostrar `processes.updated_at` solo como `Ultima edicion de datos generales` si no se implementa aun `master_updated_at`.
- No llamarlo `Ultima edicion de la ficha completa` hasta cubrir hijos.

## Estado interno y mapping UI

Estado interno actual:

- `inactive`.
- `active`.
- `archived`.

Mapping recomendado para UI:

- `inactive` -> `Borrador`.
- `active` -> `Vigente`.
- `archived` -> `Archivado`.

Esto es compatible con el flujo actual:

- `/procesos/nuevo` crea `status='inactive'` y `documentation_status='draft'`.
- `activateProcess` valida la ficha y pasa `inactive -> active`.
- `archiveProcess` pasa a `archived`.

En `/procesos/nuevo`, Estado debe ser solo visual: `Borrador`. No debe existir dropdown para elegir `Vigente`.

## `documentation_status`

No eliminar ni confundir con estado operativo.

Uso recomendado:

- `status`: ciclo de vida operativo/documental visible principal: Borrador/Vigente/Archivado.
- `documentation_status`: calidad/completitud documental secundaria: draft/documented/needs_update/not_started.

La cabecera principal debe mostrar `Estado` desde `processes.status`. `documentation_status` puede quedar como badge secundario o dentro de completitud/validacion.

## Compatibilidad con activacion

La regla es compatible con `activateProcess` y `validateProcessForActivation`:

- Nuevo proceso inicia como borrador/inactive.
- No se permite saltar a vigente desde `/nuevo`.
- Activacion corre validaciones antes de `active`.
- Owner global debe agregarse primero como nullable; luego se puede decidir si pasa a requisito bloqueante de activacion.

No recomiendo exigir owner global a los 19 procesos existentes hasta hacer backfill aprobado.

## Compatibilidad con los 19 procesos activos

Los 19 procesos activos existentes no deben recibir owner global ni codigo sin aprobacion.

Estrategia:

1. Agregar schema nullable.
2. Mostrar en UI valores pendientes para procesos sin owner/codigo.
3. Preparar reporte de candidatos desde owners de etapas y Fuente A.
4. Usuario aprueba mapeo.
5. Ejecutar backfill controlado.
6. Recién despues convertir owner/codigo en requisito para nueva publicacion o activacion.

## Impacto futuro PDF

La cabecera debe vivir en `ProcessMasterDto` y ser usada tanto por web como por PDF.

No crear reglas paralelas para PDF. El PDF debe recibir un DTO de version vigente o de `process_versions.snapshot` historico.

## Cierre posterior a la aplicacion manual

Estado confirmado el 13 de agosto de 2026:

- `20260813120000_add_process_document_header.sql`: **APLICADA Y VALIDADA**.
- `20260813143000_create_process_draft_with_document_header.sql`: **APLICADA Y VALIDADA**.
- `processes_total = 38`.
- `processes_active = 19`.
- `subprocesses_total = 111`.
- `subprocesses_active = 94`.
- `process_roles_total = 249`.
- `processes_process_code_non_null = 0`.
- `processes_version_non_null = 0`.
- `processes_owner_role_id_non_null = 0`.
- `processes_master_updated_at_non_null = 0`.
- `process_versions_rows = 0`.
- `process_code_sequences_rows = 0`.
- `orphan_subprocesses = 0`.
- `orphan_process_roles = 0`.

Resumen documental: procesos con codigo utilizado = 0; versiones vigentes = 0;
snapshots en `process_versions` = 0; contadores en `process_code_sequences` = 0.

La RPC `public.create_process_draft_with_document_header(jsonb, uuid)` fue
validada con `SECURITY DEFINER`, `search_path = public, pg_temp` y `EXECUTE`
exclusivo para `service_role`. La funcion valida el owner contra
`public.v_role_dictionary` con `role_status = 'active'`, reserva el codigo con
`public.reserve_process_code()` e inserta el proceso dentro de la misma
transaccion PostgreSQL. No crea filas en `process_versions`.

Todavia **NO se ha realizado la primera creacion real mediante la nueva RPC**.
No se ha generado `PROC-000001` ni se ha consumido el contador documental.

### Hallazgo pendiente de la auditoria de aplicacion

La ruta principal `/procesos/nuevo` usa `createProcessDraft` y la nueva RPC
atomica. Sin embargo, permanece una accion heredada `addProcess` que hace
`upsert` directo sobre `public.processes`. Esa accion sigue referenciada desde
el formulario de administracion y desde `CreateProcessModal`, aunque el listado
principal actual ya navega a `/procesos/nuevo`.

Mientras esa accion heredada siga activa, no existe una unica ruta de creacion
para toda la aplicacion: esos formularios alternativos pueden crear un proceso
sin reservar `process_code`. Antes de la primera prueba real debe aprobarse una
micro-etapa que elimine o redirija ese flujo a la RPC atomica y agregue una
guarda de regresion que prohiba futuros `insert` o `upsert` directos de

### Resolucion del hallazgo

El riesgo anterior fue eliminado en la micro-etapa siguiente. `addProcess`
conserva su firma como adaptador de compatibilidad, completa `process_type`
cuando el formulario antiguo no lo incluye y delega en `createProcessDraft`.

La ruta `/procesos/nuevo`, el formulario de `/admin` y `CreateProcessModal`
terminan ahora en el mismo cliente server-only y en la RPC
`public.create_process_draft_with_document_header(jsonb, uuid)`.

El contrato de regresion prohibe `insert` o `upsert` directos sobre
`public.processes` para creacion. Las ediciones siguen usando un `UPDATE`
explicito, validan primero que el `process_id` exista y no reservan codigo ni
modifican version.

Todavia no se ha realizado la primera creacion real con esta arquitectura.

Campos de cabecera recomendados en DTO futuro:

```ts
header: {
  processName: string;
  processCode: string | null;
  ownerRoleId: string | null;
  ownerRoleName: string | null;
  ownerPersonName: string | null;
  version: string | null;
  lastEditedAt: string | null;
  statusLabel: 'Borrador' | 'Vigente' | 'Archivado';
}
```

## Impacto en descripcion de cargo

`processes.owner_role_id` permite resolver facilmente:

- Procesos de los cuales un rol es dueno global.
- Responsabilidad documental del cargo.
- Cruce con etapas donde participa como owner/user/support/backup.

Esto complementa `process_role_profiles`, que puede documentar responsabilidades/autoridad/accountability del rol dentro del proceso.

## Riesgos

- Si se usa `process_roles` para owner global, se puede mezclar owner de etapa con owner global.
- Si `process_code` se genera por `max+1` sin lock, pueden aparecer colisiones bajo concurrencia.
- Si se muestra `processes.updated_at` como ultima edicion completa, el dato sera incompleto cuando cambien etapas/roles/riesgos/metricas/documentos.
- Si se exige owner/codigo de inmediato, se bloquean los 19 procesos existentes sin backfill aprobado.
- Si PDF consulta tablas actuales para versiones historicas, no podra reconstruir version anterior fielmente.

## Siguiente micro-etapa recomendada

Etapa 8B.7D.2: preparar diseno tecnico acotado de schema, sin aplicar aun:

1. Migracion propuesta para `processes.owner_role_id uuid null references roles(id) on delete restrict`.
2. Diseno de generacion atomica de `process_code` con prefijo multiempresa.
3. Definir si `version` inicial se asigna al crear borrador o al activar/publicar.
4. Definir `master_updated_at` o nombre equivalente para ultima edicion de ficha completa.
5. Preparar tests estaticos de schema y read model, sin tocar UI todavia.

No pasar aun a implementar cabecera visual hasta aprobar estas decisiones.
## Etapa 8B.7D.2 - Diseno final recomendado de schema

Esta etapa transforma la auditoria anterior en una propuesta de schema local, sin aplicar SQL remoto y sin tocar UI.

### Estado auditado

- `public.processes` ya tiene `process_code text` nullable, `version text` nullable e indice unico parcial case-insensitive para codigos no blancos.
- `public.companies` no tiene `code`, `short_code`, `slug`, `abbreviation` ni otro prefijo corporativo estable reutilizable.
- `public.roles` es la tabla correcta para la FK del dueno global.
- `public.v_role_dictionary` sigue siendo la fuente oficial para validar que el rol elegido este activo y sea visible como rol oficial.
- `public.user_profiles(user_id)` existe como perfil de usuario de la aplicacion y referencia `auth.users(id)`.

### Dueno global

Decision: agregar `public.processes.owner_role_id uuid null` con FK `processes_owner_role_id_fkey` hacia `public.roles(id) on delete restrict`.

La columna representa el dueno global documental del proceso. No reemplaza `public.process_roles`, que se mantiene para responsabilidades por etapa/subproceso. La FK solo garantiza existencia del rol; la validacion de rol oficial activo debe quedar en Server Action contra `public.v_role_dictionary` o fuente equivalente.

No se agrega `owner_person_id`. La persona actual se deriva desde `owner_role_id -> person_roles -> people`, preferentemente usando el read model de `v_role_dictionary` cuando se construya la cabecera.

### Codigo documental

Decision final: usar codigo global `PROC-000001` en vez de `MCP-PROC-0001` / `ELA-PROC-0001`.

Motivos:

- No existe un prefijo corporativo estable en `companies`.
- Evita hardcodear McParking -> MCP y El Alba -> ELA en schema.
- El codigo documental no cambia si el proceso cambia de empresa.
- Requiere una sola secuencia y reduce superficie de configuracion.
- La empresa se muestra separadamente en la ficha.

La migracion local agrega `public.process_code_sequences` como contador transaccional y la funcion `public.reserve_process_code()` con `pg_advisory_xact_lock`. La funcion no usa `max(process_code) + 1`; incrementa una fila de contador global con `insert ... on conflict ... update returning`, por lo que dos creaciones simultaneas no deberian obtener el mismo codigo.

La creacion futura de borradores deberia llamar esta funcion server-side, en la misma operacion que inserta `public.processes`. El navegador no deberia enviar `process_code` editable en el modelo final.

No se hace backfill de codigos existentes. Los 19 procesos oficiales pueden seguir con `process_code = null` hasta una etapa aprobada de asignacion.

### Ultima edicion de ficha completa

Decision: agregar `public.processes.master_updated_at timestamptz null`.

Semantica:

- `created_at`: creacion tecnica de la fila.
- `updated_at`: ultima actualizacion de `public.processes`.
- `master_updated_at`: ultima edicion funcional de cualquier parte de la Ficha Maestra.

La migracion local usa triggers pequenos para actualizar `master_updated_at` desde cambios en:

- `public.processes`.
- `public.subprocesses`.
- `public.process_roles`.
- `public.process_role_profiles`.
- `public.metrics`.
- `public.risks`.
- `public.controls`.
- `public.process_documents`.
- `public.process_systems`.
- `public.process_clients`.

La estrategia de triggers se prefiere sobre actualizar manualmente en cada Server Action porque tambien cubre cambios futuros por SQL controlado, scripts o mutaciones server-side que no pasen por una accion especifica.

Para evitar recursividad en `processes`, el trigger de `processes` es `before insert or update` y compara el JSON de la fila excluyendo `updated_at` y `master_updated_at`. Los triggers hijos hacen un `update` del padre solo con `master_updated_at`. Esto centraliza la actualizacion de la cabecera documental sin tocar datos al aplicar la migracion.

`master_updated_at` queda nullable para registros existentes. No se inicializa con `updated_at` porque eso seria backfill.

### Versionado

Decision: crear `public.process_versions` para snapshots publicados.

Campos:

- `id uuid primary key default gen_random_uuid()`.
- `process_id uuid not null references public.processes(id) on delete restrict`.
- `version text not null`.
- `snapshot jsonb not null`.
- `snapshot_schema_version integer not null default 1`.
- `published_at timestamptz not null default now()`.
- `published_by uuid references public.user_profiles(user_id) on delete set null`.
- `change_summary text null`.
- `created_at timestamptz not null default now()`.
- `unique (process_id, version)`.

`snapshot` debe guardar una fotografia completa de `ProcessMasterDto`, no solo `public.processes`. Debe poder contener cabecera, proposito, etapas, roles, responsabilidades, indicadores, riesgos, controles, documentos y PDCA.

`snapshot_schema_version` es integer con default 1 para poder interpretar snapshots si el DTO evoluciona.

La version visible vigente sigue siendo `public.processes.version`. Representa la version publicada actual, no cantidad de guardados. Para MVP: primera publicacion `1.0`; siguientes publicaciones menores `1.1`, `1.2`, `1.3`, parseando segmentos enteros y sin usar floats.

### Publicar version futura

Flujo futuro recomendado, no implementado aqui:

1. Validar ficha completa.
2. Construir `ProcessMasterDto` desde un read model unico.
3. Determinar siguiente version como texto.
4. Insertar snapshot en `public.process_versions`.
5. Actualizar `public.processes.version`, `documentation_status` y timestamps.
6. Hacer todo en una operacion transaccional server-side/RPC.

### Estado y documentation_status

No se agrega nueva columna de estado.

Mapping UI:

- `inactive` -> `Borrador`.
- `active` -> `Vigente`.
- `archived` -> `Archivado`.

`documentation_status` se mantiene como concepto secundario de completitud documental. No se elimina ni se mezcla con `status`.

### RLS

La migracion local habilita RLS en:

- `public.process_versions`.
- `public.process_code_sequences`.

No crea policies abiertas. La escritura inicial queda pensada para server-side/service role. `reserve_process_code()` es `security definer`, revoca `public`, `anon` y `authenticated`, y concede ejecucion solo a `service_role`.

### Compatibilidad

La propuesta es additive-only:

- No cambia procesos existentes.
- No genera codigos.
- No asigna owners.
- No crea versiones reales.
- No actualiza `master_updated_at` para filas existentes.
- No cambia estados ni UUIDs.

Migracion local preparada: `supabase/migrations/20260813120000_add_process_document_header.sql`.

PRECHECK incluido como comentario read-only al inicio de la migracion.

Siguiente micro-etapa recomendada: revisar/aprobar la migracion local y, si corresponde, preparar ejecucion manual en Supabase SQL Editor con precheck/postcheck; despues conectar read model de cabecera sin habilitar edicion visual todavia.


## Etapa 8B.7D.3B - Revision final para aplicacion manual

### Resultado de auditoria

La migracion definitiva sigue siendo additive-only y transaccional. Agrega solamente:

- `public.processes.owner_role_id uuid null`.
- `public.processes.master_updated_at timestamptz null`.
- `public.process_code_sequences`.
- `public.reserve_process_code()`.
- `public.process_versions`.
- `public.touch_process_master_updated_at()`.
- Indices, constraints, permisos, RLS y triggers asociados.

No contiene backfill, snapshots, owners, codigos o versiones reales. No inserta, actualiza ni elimina filas de negocio al aplicarse.

### Triggers finales de master_updated_at

El trigger de `public.processes` es `BEFORE INSERT OR UPDATE`. Escribe sobre `NEW.master_updated_at` y nunca ejecuta un `UPDATE public.processes` desde el trigger del padre.

Los triggers hijos son `AFTER INSERT OR UPDATE OR DELETE`. Todas las tablas auditadas tienen `process_id` directo:

- `public.subprocesses`.
- `public.process_roles`.
- `public.process_role_profiles`.
- `public.metrics`.
- `public.risks`.
- `public.controls`.
- `public.process_documents`.
- `public.process_systems`.
- `public.process_clients`.

En `UPDATE`, la funcion toca tanto `OLD.process_id` como `NEW.process_id`, de modo que una reasignacion de proceso actualiza ambas fichas. El `UPDATE` del padre hecho por un trigger hijo solo modifica `master_updated_at`; el trigger `BEFORE UPDATE` del padre excluye `updated_at` y `master_updated_at` de su comparacion, por lo que no genera recursion.

### Secuencia documental final

`public.process_code_sequences` usa:

- `sequence_key text primary key`.
- Clave logica unica: `process`.
- `code_prefix = 'PROC'`.
- `last_value bigint`.
- RLS habilitado, sin policies.
- Privilegios directos revocados a `PUBLIC`, `anon` y `authenticated`.
- Acceso de tabla concedido a `service_role`.

`public.reserve_process_code()`:

- Es `SECURITY DEFINER`.
- Fija `search_path = public, pg_temp`.
- Solo puede ejecutarla `service_role`.
- Usa advisory transaction lock e `INSERT ... ON CONFLICT ... DO UPDATE ... RETURNING`.
- No usa `MAX`, `COUNT` ni filas de `processes`.
- Primera llamada: `PROC-000001`.
- Segunda llamada: `PROC-000002`.
- Valor 42: `PROC-000042`.
- Valor 999999: `PROC-999999`.
- Una llamada posterior aborta con error; no produce un codigo de siete digitos.

### Historial de versiones final

`public.process_versions` conserva:

- FK `process_versions_process_id_fkey` con `ON DELETE RESTRICT`.
- FK `process_versions_published_by_fkey` hacia `public.user_profiles(user_id)` con `ON DELETE SET NULL`.
- `snapshot jsonb not null`.
- `snapshot_schema_version integer not null default 1`.
- Unique nombrada `process_versions_process_version_key (process_id, version)`.
- RLS habilitado, sin policies.
- Privilegios directos solo para `service_role`.

La FK de `published_by` es estable porque `public.user_profiles.user_id` es PK y referencia `auth.users(id)`.

### PRECHECK definitivo read-only

```sql
with base_counts as (
  select
    (select count(*) from public.processes) as processes_total,
    (select count(*) from public.processes where status = 'active'::public.record_status) as processes_active,
    (select count(*) from public.subprocesses) as subprocesses_total,
    (select count(*) from public.subprocesses where status = 'active'::public.record_status) as subprocesses_active,
    (select count(*) from public.process_roles) as process_roles_total,
    (select count(*) from public.processes where process_code is not null) as processes_process_code_non_null,
    (select count(*) from public.processes where version is not null) as processes_version_non_null,
    (select count(distinct role_id) from public.v_role_dictionary) as official_roles_active,
    (
      select count(*)
      from public.subprocesses sp
      left join public.processes p on p.id = sp.process_id
      where p.id is null
    ) as orphan_subprocesses,
    (
      select count(*)
      from public.process_roles pr
      left join public.processes p on p.id = pr.process_id
      where p.id is null
    ) as orphan_process_roles
),
schema_state as (
  select
    count(*) filter (
      where table_schema = 'public'
        and table_name = 'processes'
        and column_name = 'owner_role_id'
    ) as owner_role_id_column,
    count(*) filter (
      where table_schema = 'public'
        and table_name = 'processes'
        and column_name = 'master_updated_at'
    ) as master_updated_at_column
  from information_schema.columns
)
select
  b.*,
  s.owner_role_id_column,
  s.master_updated_at_column,
  case when to_regclass('public.process_versions') is null then 0 else 1 end as process_versions_table,
  case when to_regclass('public.process_code_sequences') is null then 0 else 1 end as process_code_sequences_table,
  case when to_regprocedure('public.reserve_process_code()') is null then 0 else 1 end as reserve_process_code_function
from base_counts b
cross join schema_state s;
```

Esperado antes de aplicar:

- `processes_total = 38`.
- `processes_active = 19`.
- `subprocesses_total = 111`.
- `subprocesses_active = 94`.
- `process_roles_total = 249`.
- `owner_role_id_column = 0`.
- `master_updated_at_column = 0`.
- `process_versions_table = 0`.
- `process_code_sequences_table = 0`.
- `reserve_process_code_function = 0`.
- `official_roles_active = 8`.
- `orphan_subprocesses = 0`.
- `orphan_process_roles = 0`.

Conservar aparte los valores reales de `processes_process_code_non_null` y `processes_version_non_null`; deben repetirse exactamente en POSTCHECK.

### POSTCHECK definitivo read-only

```sql
with base_counts as (
  select
    (select count(*) from public.processes) as processes_total,
    (select count(*) from public.processes where status = 'active'::public.record_status) as processes_active,
    (select count(*) from public.subprocesses) as subprocesses_total,
    (select count(*) from public.subprocesses where status = 'active'::public.record_status) as subprocesses_active,
    (select count(*) from public.process_roles) as process_roles_total,
    (select count(*) from public.processes where process_code is not null) as processes_process_code_non_null,
    (select count(*) from public.processes where version is not null) as processes_version_non_null,
    (select count(*) from public.processes where owner_role_id is not null) as processes_owner_role_id_non_null,
    (select count(*) from public.processes where master_updated_at is not null) as processes_master_updated_at_non_null,
    (select count(*) from public.process_versions) as process_versions_total,
    (select count(distinct role_id) from public.v_role_dictionary) as official_roles_active,
    (
      select count(*)
      from public.subprocesses sp
      left join public.processes p on p.id = sp.process_id
      where p.id is null
    ) as orphan_subprocesses,
    (
      select count(*)
      from public.process_roles pr
      left join public.processes p on p.id = pr.process_id
      where p.id is null
    ) as orphan_process_roles
),
schema_state as (
  select
    count(*) filter (
      where table_schema = 'public'
        and table_name = 'processes'
        and column_name = 'owner_role_id'
    ) as owner_role_id_column,
    count(*) filter (
      where table_schema = 'public'
        and table_name = 'processes'
        and column_name = 'master_updated_at'
    ) as master_updated_at_column
  from information_schema.columns
),
rls_state as (
  select
    coalesce(bool_or(relrowsecurity) filter (where relname = 'process_versions'), false) as process_versions_rls,
    coalesce(bool_or(relrowsecurity) filter (where relname = 'process_code_sequences'), false) as process_code_sequences_rls
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname in ('process_versions', 'process_code_sequences')
)
select
  b.*,
  s.owner_role_id_column,
  s.master_updated_at_column,
  case when to_regclass('public.process_versions') is null then 0 else 1 end as process_versions_table,
  case when to_regclass('public.process_code_sequences') is null then 0 else 1 end as process_code_sequences_table,
  case when to_regprocedure('public.reserve_process_code()') is null then 0 else 1 end as reserve_process_code_function,
  r.process_versions_rls,
  r.process_code_sequences_rls
from base_counts b
cross join schema_state s
cross join rls_state r;

select
  conrelid::regclass::text as table_name,
  conname as constraint_name,
  pg_get_constraintdef(oid) as definition
from pg_catalog.pg_constraint
where connamespace = 'public'::regnamespace
  and conname in (
    'processes_owner_role_id_fkey',
    'process_versions_process_id_fkey',
    'process_versions_published_by_fkey',
    'process_versions_process_version_key',
    'process_versions_version_not_blank',
    'process_versions_snapshot_object',
    'process_versions_snapshot_schema_version_positive',
    'process_code_sequences_key_not_blank',
    'process_code_sequences_prefix_not_blank',
    'process_code_sequences_last_value_non_negative'
  )
order by table_name, constraint_name;

select
  schemaname,
  tablename,
  indexname,
  indexdef
from pg_catalog.pg_indexes
where schemaname = 'public'
  and indexname in (
    'idx_processes_owner_role_id',
    'idx_processes_master_updated_at',
    'idx_process_versions_process_published_at',
    'idx_process_versions_published_by',
    'process_code_sequences_pkey',
    'process_versions_pkey',
    'process_versions_process_version_key'
  )
order by tablename, indexname;

select
  c.relname as table_name,
  t.tgname as trigger_name,
  case t.tgenabled
    when 'O' then 'enabled'
    when 'D' then 'disabled'
    when 'R' then 'replica'
    when 'A' then 'always'
    else t.tgenabled::text
  end as enabled,
  pg_get_triggerdef(t.oid) as definition
from pg_catalog.pg_trigger t
join pg_catalog.pg_class c on c.oid = t.tgrelid
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where not t.tgisinternal
  and n.nspname = 'public'
  and t.tgname in (
    'set_process_code_sequences_updated_at',
    'set_processes_master_updated_at',
    'touch_processes_master_updated_at_from_subprocesses',
    'touch_processes_master_updated_at_from_process_roles',
    'touch_processes_master_updated_at_from_process_role_profiles',
    'touch_processes_master_updated_at_from_metrics',
    'touch_processes_master_updated_at_from_risks',
    'touch_processes_master_updated_at_from_controls',
    'touch_processes_master_updated_at_from_process_documents',
    'touch_processes_master_updated_at_from_process_systems',
    'touch_processes_master_updated_at_from_process_clients'
  )
order by table_name, trigger_name;

select
  p.oid::regprocedure::text as function_signature,
  p.prosecdef as security_definer,
  p.proconfig as function_config,
  has_function_privilege('service_role', p.oid, 'EXECUTE') as service_role_execute,
  has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute,
  exists (
    select 1
    from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
    where acl.grantee = 0
      and acl.privilege_type = 'EXECUTE'
  ) as public_execute
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('reserve_process_code', 'touch_process_master_updated_at')
order by p.proname;

select
  grantee,
  table_name,
  string_agg(privilege_type, ', ' order by privilege_type) as privileges
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in ('process_versions', 'process_code_sequences')
group by grantee, table_name
order by table_name, grantee;
```

Resultado esperado:

- Conteos base iguales al PRECHECK.
- Columnas, tablas y funcion = `1`.
- `process_versions_total = 0`.
- `processes_owner_role_id_non_null = 0`.
- `processes_master_updated_at_non_null = 0`.
- Conteos de codigo/version iguales al PRECHECK.
- Ambos RLS = `true`.
- Diez constraints listadas.
- Siete indices listados, contando PK/unique.
- Once triggers listados y `enabled`.
- `reserve_process_code()`: service role true; anon/authenticated/public false.
- Tablas nuevas: solo `service_role` con privilegios directos.

### Aplicacion manual exacta

1. Abrir Supabase SQL Editor en el proyecto correcto.
2. Ejecutar solo el PRECHECK y guardar su unica fila.
3. Detenerse si cualquier conteo esperado difiere, si hay orphans, o si algun objeto nuevo ya existe.
4. Abrir el archivo local `supabase/migrations/20260813120000_add_process_document_header.sql`.
5. Copiar su contenido completo, desde comentarios iniciales hasta `commit;`, sin agregar ni quitar SQL.
6. Ejecutarlo una sola vez. La transaccion aborta completa ante cualquier precondicion o error.
7. Si falla, no reintentar con fragmentos ni editar datos: copiar el error completo y revisar el estado con PRECHECK.
8. Si finaliza correctamente, ejecutar el POSTCHECK completo.
9. No llamar `reserve_process_code()` durante la validacion; hacerlo consumiria un codigo real.
10. No insertar snapshots ni asignar owners durante esta etapa.



## Modelo documental V1 - simplificacion de contenido

La ficha oficial interna queda compuesta por:

1. Proposito y alcance.
2. Entradas, actividades y salidas.
3. Roles, responsabilidades y autoridad.
4. Indicadores y objetivos.
5. Riesgos, controles y oportunidades.

La actividad clave usa public.subprocesses.name, description y sort_order. El estado se conserva como dato tecnico. El editor V1 no solicita frecuencia, criticidad, impacto porcentual, roles, sistemas, riesgos ni controles dentro de una actividad.

Los datos historicos en subprocesses, process_roles, process_systems, risks y controls no se eliminan ni se reescriben. Los procesos sin codigo siguen siendo legado legible y no reciben valores automaticos.

### Fuera de V1

- Documentos y registros asociados.
- Ciclo de mejora PDCA.
- Sistemas asociados como bloque de etapa.
- Criticidad de etapa.
- Frecuencia de etapa.
- Impacto porcentual.
- Roles multiples dentro de una etapa.
- Riesgo y control dentro de una etapa.

process_documents, los campos PDCA de processes y las estructuras historicas permanecen en base de datos. Solo se retiran del contrato visual; no se borran columnas, tablas, relaciones, triggers ni datos.

### Persistencia central disponible y brecha de conexion

El schema aplicado ya contiene process_role_profiles para responsabilidad, autoridad y rendicion de cuentas; metrics para formula, meta, frecuencia, responsable y orden; risks para riesgo u oportunidad; y controls para evidencia y responsable. No se necesita otra migracion.

La ficha V1 deja de derivar estos conceptos desde etapas. En esta micro-etapa no se agrega un CRUD improvisado: falta un read model server-side comun y acciones administrativas validadas. process_role_profiles tiene RLS sin una policy abierta, por lo que la UI no debe eludir el control usando credenciales privilegiadas. La conexion central debe ser una micro-etapa separada con autorizacion, validacion de roles oficiales y pruebas de permisos.

### Activacion V1

Se mantiene al menos una actividad activa. Se retiran como requisitos por actividad: owner, impacto definido o suma igual a 100%, respaldo para actividad critica y roles de apoyo. El owner documental sigue siendo processes.owner_role_id; la persona se deriva del rol. No se publica una version ni se modifica process_versions.

### Compatibilidad

PROC-000001 - Traslado al Aeropuerto se conserva como proceso nuevo, separado del historico homonimo sin process_code. No se copian etapas ni relaciones. El formulario simplificado permite comenzar sus actividades desde cero sin consumir otro codigo ni crear una version.
## Contrato Ficha de Proceso V1

### Cabecera

Orden visual definitivo:

1. Proceso / Codigo.
2. Dueno del proceso / Version.
3. Fecha ultima edicion / Estado.
4. Tipo de proceso.

- Proceso: `processes.name`, editable en la ficha y mostrado una sola vez como dato documental principal.
- Codigo: `processes.process_code`, solo lectura, reservado automaticamente y nunca recalculado por una edicion ordinaria.
- Dueno del proceso: `processes.owner_role_id`, UUID validado contra `v_role_dictionary`. La opcion visible usa `role_name`; no concatena `company_name` ni altera el nombre persistido del rol.
- Persona actual: informacion secundaria derivada del rol oficial; nunca se persiste como sustituto de `owner_role_id`.
- Version: `processes.version`, solo lectura; muestra `Sin publicar` mientras no exista publicacion.
- Fecha ultima edicion: solo lectura. Usa `processes.master_updated_at` como fuente principal y `processes.created_at` como fallback null-safe para historicos. Los triggers existentes mantienen el timestamp; la UI no lo escribe ni agrega una logica paralela.
- Estado: un unico valor comprensible derivado de `processes.status`: `active` se muestra como `Vigente`; cualquier estado editable no activo se muestra como `Borrador`. `documentation_status` permanece tecnico y no se duplica visualmente.
- Tipo de proceso: `processes.process_type`, editable y necesario para el mapa de procesos.

Empresa se resuelve server-side como la unica empresa activa llamada `McParking`, sin UUID hardcodeado y sin selector visible o valor de autoridad enviado por el navegador. Area queda fuera de la cabecera V1 y se conserva en schema, historicos, filtros y relaciones internas. No existe `Fecha de vigencia` editable en la cabecera V1; `effective_date` permanece en el schema por compatibilidad, sin input ni escritura desde este flujo.
### Seccion 1 - Proposito y alcance

- Proposito: reutiliza `processes.objective`. `description` y `expected_result` se preservan como legado, pero no se muestran como conceptos paralelos.
- Inicio: `processes.process_start`.
- Fin: `processes.process_end`.
- Alcance: `processes.scope`.

### Seccion 2 - Entradas, actividades y salidas

- Proveedor / Origen: nuevo `processes.supplier_origin`.
- Entradas: nuevo `processes.process_inputs`.
- Actividades clave: derivadas de `subprocesses` activos y ordenadas por `sort_order`.
- Salidas: nuevo `processes.process_outputs`.
- Cliente / Destino: nuevo `processes.client_destination`.

`inputs_providers` y `outputs_clients` permanecen intactos como campos combinados del legado. No se separan por comas ni se hace backfill automatico.

### Seccion 3 - Roles, responsabilidades y autoridad

- Rol: `process_role_profiles.role_id`, UUID de `v_role_dictionary`.
- Responsabilidad: `process_role_profiles.responsibility_description`.
- Autoridad: `process_role_profiles.authority_description`.
- Rendicion de cuentas: `process_role_profiles.accountability_description`.

El schema soporta el contrato, pero su RLS no tiene todavia una politica por alcance aprobada. No se conecta CRUD ni lectura privilegiada hasta definir autorizacion por proceso. `processes.owner_role_id` sigue siendo el dueno principal y no se duplica automaticamente.

### Seccion 4 - Indicadores y objetivos

- Indicador: `metrics.name`.
- Formula / criterio: `metrics.formula`.
- Meta: `metrics.target`.
- Frecuencia: `metrics.frequency`.
- Responsable: `metrics.owner_role_id`, rol oficial.

`basic_kpi` se conserva como fallback de lectura para registros historicos. No se copia silenciosamente a `metrics`. La conexion CRUD queda pendiente de una politica RLS y alcance aprobada.

### Seccion 5 - Riesgos, controles y oportunidades

- Riesgo / oportunidad: `risks.name` + `risks.risk_type`.
- Control: `controls.name`, relacionado por `controls.risk_id`.
- Evidencia: `controls.evidence`.
- Responsable: `controls.owner_role_id`, rol oficial.

La persistencia existe. Su CRUD central queda pendiente de endurecer y definir la autorizacion por alcance, ya que las policies MVP historicas de `risks` y `controls` son mas amplias que el contrato de seguridad deseado.

### Migracion pendiente

`20260813160000_complete_process_master_v1_contract.sql` agrega solo los cuatro campos separados de la seccion 2 y actualiza de forma compatible el RPC atomico de creacion. Es transaccional, additive-only, no borra ni transforma historicos y no fue aplicada desde Codex.

### Origen de la informacion

Desde `/estructura`: rol dueno, roles participantes y responsables de indicadores/controles; sus personas actuales se derivan del diccionario oficial. Propósito, limites, flujo, responsabilidades propias del proceso, indicadores, riesgos, controles y evidencias se escriben especificamente en la ficha.
