# Auditoria ficha proceso maestra

Etapa: 8B.7B, revision y preparacion para aplicar schema. No aplica SQL remoto de escritura.

## Objetivo

La ficha maestra debe alimentar `/procesos/nuevo`, `/procesos/[id]/editar`, `/procesos/[id]`, un futuro PDF y una futura descripcion de cargo. La arquitectura visual actual ya usa `ProcessMasterDto -> ProcessMasterSheet -> mode=create | edit | readonly`.

## Validacion remota read-only

Con Supabase JS y service key local, sin imprimir secretos y sin escrituras, se confirmo:

| Conteo remoto | Valor |
| --- | ---: |
| `processes` total | 38 |
| `processes` activos | 19 |
| `subprocesses` total | 111 |
| `subprocesses` activos de procesos activos | 94 |
| `process_roles` total | 249 |
| `metrics` total | 0 |
| `risks` total | 14 |
| `controls` total | 14 |
| `roles` total | 15 |

PostgREST no expone `information_schema`, por lo que los tipos/constraints finales deben confirmarse en Supabase SQL Editor con el PRECHECK read-only. Tambien se confirmo por SELECT de columnas que las columnas nuevas no estan disponibles via API y que `process_role_profiles` y `process_documents` no existen en la schema cache publica.

## Modelo actual auditado

| Tabla | Columnas relevantes | Relaciones relevantes | Cobertura actual |
| --- | --- | --- | --- |
| `public.processes` | `id`, `company_id`, `area_id`, `name`, `description`, `objective`, `expected_result`, `inputs_providers`, `outputs_clients`, `basic_kpi`, `process_type`, `criticality`, `status`, `documentation_status`, `owner_company_id`, `operating_company_id`, `country_id`, `owner_site_id`, `operating_site_id`, `is_replicable`, `is_global`, `created_at`, `updated_at` | `company_id`, `owner_company_id`, `operating_company_id` -> `companies`; `area_id` -> `areas`; sites/country opcionales | Cabecera basica, proposito, entradas/salidas combinadas y KPI legacy |
| `public.subprocesses` | `id`, `process_id`, `name`, `description`, `frequency`, `criticality`, `impact_percent`, `sort_order`, `status`, `created_at`, `updated_at` | `process_id` -> `processes` | Actividades/etapas del proceso |
| `public.process_roles` | `id`, `process_id`, `subprocess_id`, `role_id`, `responsibility_type`, `impact_percent`, `criticality`, `is_required`, `notes`, `role_company_id`, `created_at`, `updated_at` | `process_id` -> `processes`; `subprocess_id` -> `subprocesses`; `role_id` -> `roles` | Participacion operativa por etapa, sin textos de responsabilidad/autoridad/accountability |
| `public.roles` | `id`, `area_id`, `name`, `description`, `level`, `role_code`, `responsibilities`, `org_parent_role_id`, `sort_order`, `status` | `area_id` -> `areas`; jerarquia por `org_parent_role_id` | Catalogo de roles funcionales |
| `public.person_roles` | `id`, `person_id`, `role_id`, `company_id`, `country_id`, `site_id`, `is_primary`, `is_backup`, `start_date`, `end_date`, `status` | Une personas con roles y contexto | Persona actual derivada por rol/contexto |
| `public.people` | `id`, `name`, `email`, `phone`, `status` | Usada desde `person_roles` | Persona vigente |
| `public.metrics` | `id`, `process_id`, `subprocess_id`, `owner_role_id`, `name`, `unit`, `frequency`, `status`, `created_at`, `updated_at` | `process_id`, `subprocess_id`, `owner_role_id` | Indicadores parciales; faltan formula, meta y orden |
| `public.risks` | `id`, `process_id`, `subprocess_id`, `role_id`, `system_id`, `name`, `description`, `severity`, `status`, `created_at`, `updated_at` | Riesgo por proceso/etapa/rol/sistema | Riesgos existentes; no distingue oportunidad |
| `public.controls` | `id`, `process_id`, `risk_id`, `owner_role_id`, `name`, `description`, `frequency`, `status`, `created_at`, `updated_at` | Control asociado a proceso/riesgo/rol | Controles existentes; falta evidencia |
| `public.process_systems` | `id`, `process_id`, `subprocess_id`, `system_id`, `notes`, `created_at`, `updated_at` | Une procesos/etapas con sistemas | Sistemas asociados |
| `public.process_clients` | `id`, `process_id`, `client_company_id`, `notes`, `status`, `created_at`, `updated_at` | Clientes empresariales por proceso | Cliente/destino estructurado parcial |

No se encontro tabla reutilizable para documentos, registros, evidencia documental o procedimientos asociados al proceso.

## Campos actuales en `processes`

| Campo | Tipo real local | Estado |
| --- | --- | --- |
| `name` | `text` | Existe |
| `description` | `text` | Existe |
| `objective` | `text` | Existe |
| `expected_result` | `text` | Existe |
| `inputs_providers` | `text` | Existe |
| `outputs_clients` | `text` | Existe |
| `basic_kpi` | `text` | Existe |
| `process_type` | `text` con check `strategic/operational/support` | Existe |
| `criticality` | `public.criticality_level` | Existe |
| `status` | `public.record_status` | Existe |
| `documentation_status` | `public.documentation_status` | Existe |
| `company_id` | `uuid` | Existe |
| `area_id` | `uuid` | Existe |

## Campos faltantes

| Campo | Cardinalidad | Entidad recomendada | Existe hoy | Cambio necesario | Motivo |
| --- | --- | --- | --- | --- | --- |
| Codigo proceso | 1:1 | `processes.process_code` | No | Columna nullable + indice unico parcial case-insensitive + check no blanco | Identificador documental; debe permitir borradores |
| Version | 1:1 | `processes.version` | No | Columna nullable `text` | Version documental vigente, no historial |
| Fecha de vigencia | 1:1 | `processes.effective_date` | No | Columna nullable `date` | Fecha documental, distinta de `created_at/updated_at` |
| Inicio | 1:1 | `processes.process_start` | No | Columna nullable `text` | Define borde inicial del proceso |
| Fin | 1:1 | `processes.process_end` | No | Columna nullable `text` | Define borde final del proceso |
| Alcance | 1:1 | `processes.scope` | No | Columna nullable `text` | No equivale a descripcion u objetivo |
| Entradas/proveedores | 1:1 legacy | `processes.inputs_providers` | Si | Sin cambio ahora | Mantiene compatibilidad V2 |
| Salidas/clientes | 1:1 legacy | `processes.outputs_clients` | Si | Sin cambio ahora | Mantiene compatibilidad V2 |
| Indicadores | 1:N | `metrics` | Parcial | Agregar `formula`, `target`, `sort_order` | Evita guardar multiples indicadores en `basic_kpi` |
| Responsabilidad/autoridad/accountability | N:M agregada | Nueva `process_role_profiles` | No | Tabla hija por `process_id + role_id` | Evita repetir textos por cada etapa |
| Riesgo/oportunidad | 1:N | `risks` | Riesgo parcial | Agregar `risk_type` nullable con check | Reutiliza tabla de riesgos y habilita oportunidades |
| Control/evidencia | 1:N | `controls` | Parcial | Agregar `evidence` | Campo textual suficiente para evidencia inicial |
| Documentos/registros | 1:N | Nueva `process_documents` | No | Tabla hija con `usage` | No hay modelo equivalente y la ficha pide Uso |
| PDCA | 1:1 | `processes` | No | `pdca_plan`, `pdca_do`, `pdca_check`, `pdca_act` | Cuatro textos de mejora vigente |

## Decisiones finales

- `process_code`: nullable durante borrador, unico solo cuando exista y comparado con `lower(process_code)`. El check `processes_process_code_not_blank` evita string vacio o solo espacios. No se genera automaticamente.
- `version`: `text`, por ejemplo `1.0`, `1.1`, `2.0`. Es version documental vigente, no historial.
- `effective_date`: `date nullable`; no reemplaza `created_at` ni `updated_at`.
- `process_start`, `process_end`, `scope`: nuevos textos 1:1. No se reutiliza `description`, `objective` ni `expected_result` porque la semantica es distinta.
- `inputs_providers` y `outputs_clients`: se mantienen combinados por compatibilidad. Separar `suppliers`, `inputs`, `outputs`, `clients` queda como deuda futura si se define migracion de datos.
- `metrics`: debe ser la entidad principal de indicadores. `basic_kpi` queda como resumen legacy. `target` se mantiene porque no hay `target_value` actual y representa meta documental textual.
- `process_role_profiles`: recomendado sobre extender `process_roles`, porque `process_roles` puede repetir el mismo rol por varias etapas. No incluye `subprocess_id`; representa rol dentro del proceso.
- `process_role_profiles` usa `on delete restrict`, porque el dominio archiva procesos/roles en vez de borrarlos.
- `risks`: se reutiliza con `risk_type = risk | opportunity` nullable. No se crea enum ni segunda tabla.
- `controls`: se reutiliza y se agrega `evidence`. `owner_role_id` ya representa responsable del control.
- `process_documents`: nueva tabla para procedimientos, registros, politicas, instrucciones, evidencias u otros documentos. Usa `usage` para representar el uso en la ficha.
- `document_type`: `text + check`, no enum, para permitir extension futura sin migracion de enum.
- `pdca_*`: columnas en `processes`; no se crea tabla solo para cuatro textos.
- RLS: las tablas nuevas quedan con RLS habilitado y sin policies abiertas en esta migracion. La UI futura debe usar server actions/service role o una migracion de policies aprobada.

## Compatibilidad

La migracion preparada es aditiva. No cambia UUID, owners, etapas, estados ni conteos del catalogo V2. Los 19 procesos activos y las 94 etapas activas deben conservarse. No hace backfill de `process_code`, `version`, `effective_date`, inicio, fin, alcance, PDCA, `risk_type` ni `evidence`.

## Activacion futura

No se cambia `activateProcess` en esta etapa. Propuesta futura:

| Campo | Severidad futura propuesta |
| --- | --- |
| `process_code` | Blocking para `documented/active` |
| `version` | Blocking |
| `effective_date` | Blocking |
| `process_start` | Blocking |
| `process_end` | Blocking |
| `scope` | Blocking |
| `pdca_*` | Warning inicial |
| `metrics[]` | Warning inicial, luego blocking si el proceso requiere KPI formal |
| `documents[]` | Warning inicial |

`documentation_status = documented` deberia representar ficha obligatoria completa. Si un proceso activo se edita y queda incompleto, una regla futura podria moverlo a `needs_update`.

## ProcessMasterDto objetivo

```ts
type ProcessMasterDtoTarget = ProcessMasterDto & {
  process: ProcessMasterDto["process"] & {
    processCode: string | null;
    version: string | null;
    effectiveDate: string | null;
    processStart: string | null;
    processEnd: string | null;
    scope: string | null;
    pdca: {
      plan: string | null;
      do: string | null;
      check: string | null;
      act: string | null;
    };
  };
  roleProfiles: Array<{
    processId: string;
    roleId: string;
    roleName: string;
    responsibilityDescription: string | null;
    authorityDescription: string | null;
    accountabilityDescription: string | null;
  }>;
  metrics: Array<{
    id: string;
    processId: string;
    subprocessId: string | null;
    name: string;
    formula: string | null;
    target: string | null;
    unit: string | null;
    frequency: string | null;
    responsibleRoleId: string | null;
    responsibleRoleName: string | null;
    sortOrder: number | null;
  }>;
  risks: Array<{
    id: string;
    processId: string | null;
    subprocessId: string | null;
    type: "risk" | "opportunity" | null;
    name: string;
    description: string | null;
    severity: ProcessMasterCriticality;
    responsibleRoleId: string | null;
  }>;
  controls: Array<{
    id: string;
    processId: string | null;
    riskId: string | null;
    name: string;
    description: string | null;
    evidence: string | null;
    frequency: string | null;
    responsibleRoleId: string | null;
  }>;
  documents: Array<{
    id: string;
    processId: string;
    type: "procedure" | "record" | "policy" | "instruction" | "evidence" | "other";
    name: string;
    usage: string | null;
    url: string | null;
    sortOrder: number | null;
  }>;
};
```

## Read model recomendado

No inflar `v_process_catalog_v2` con tablas 1:N. Mantener esa vista como listado. Crear luego `getProcessMasterById(processId)` server-side para componer:

- proceso desde `v_process_catalog_v2`;
- etapas desde `v_process_subprocess_matrix_v2`;
- role profiles desde `process_role_profiles`;
- metricas desde `metrics`;
- riesgos desde `risks`;
- controles desde `controls`;
- documentos desde `process_documents`;
- clientes/sistemas desde relaciones existentes cuando se requiera.

## PDF futuro

El PDF debe consumir el mismo `ProcessMasterDtoTarget` que usa la web readonly. Flujo recomendado:

`getProcessMasterById()` -> `ProcessMasterDtoTarget` -> web readonly -> renderer PDF.

El renderer PDF no debe hacer consultas propias.

## Actions futuras

- 1:1 de proceso: ampliar `updateProcessBasics` o crear una action documental acotada.
- Etapas: mantener actions especificas actuales.
- Indicadores: `add/update/archive metric`.
- Documentos: `add/update/archive process_document`.
- Perfiles de rol: `upsert/archive process_role_profile`.
- Riesgos/controles: reutilizar actions acotadas por entidad.

No conviene un mega update unico para toda la ficha porque mezcla cardinalidades 1:1 y 1:N.

## Migracion local preparada

Archivo: `supabase/migrations/20260812120000_extend_process_master_sheet.sql`.

Es aditiva: precondiciones read-only, `ALTER TABLE ADD COLUMN`, `CREATE TABLE`, `CREATE INDEX`, `ADD CONSTRAINT`, triggers y RLS. No contiene sentencias de carga de datos ni cambios de UI.

## Riesgos pendientes

- Confirmar en SQL Editor los tipos/constraints exactos porque PostgREST no expone `information_schema`.
- Confirmar si `target` en `metrics` debe quedar como texto libre o formalizarse con tipo/unidad mas adelante.
- Definir si `risk_type` debe volverse obligatorio cuando se migren datos existentes.
- Definir reglas exactas para pasar `documentation_status` a `documented` o `needs_update`.
- Definir policies finales para `process_role_profiles` y `process_documents`; por ahora quedan con RLS y sin acceso directo anon/auth.
- Separar entradas/proveedores/salidas/clientes podria requerir migracion de datos y decision editorial.

## Recomendacion para Etapa 8B.7C

1. Ejecutar PRECHECK definitivo en Supabase SQL Editor.
2. Si el PRECHECK coincide, copiar y ejecutar la migracion completa manualmente.
3. Ejecutar POSTCHECK definitivo inmediatamente.
4. Si todo queda OK, commitear artefactos locales.
5. Luego ampliar `ProcessMasterDto`, `getProcessMasterById()` y actions sin tocar el listado.
## Estado remoto 8B.7B

Fecha de aplicacion manual: 2026-08-13.

Migracion aplicada manualmente en Supabase SQL Editor:

- `supabase/migrations/20260812120000_extend_process_master_sheet.sql`

PRECHECK confirmado antes de aplicar:

| Check | Valor |
| --- | ---: |
| `processes_total` | 38 |
| `processes_active` | 19 |
| `subprocesses_total` | 111 |
| `subprocesses_active` | 94 |
| `process_roles_total` | 249 |
| `metrics_total` | 0 |
| `risks_total` | 14 |
| `controls_total` | 14 |
| `official_roles_active` | 8 |
| `orphan_subprocesses` | 0 |
| `orphan_process_roles` | 0 |
| `new_columns_found` | none |
| `process_role_profiles_table` | missing |
| `process_documents_table` | missing |

POSTCHECK confirmado despues de aplicar:

| Check | Valor |
| --- | ---: |
| `constraints_ok` | 2 |
| `controls_total` | 14 |
| `indexes_ok` | 6 |
| `metrics_total` | 0 |
| `new_columns_ok` | 15 |
| `new_tables_rls_enabled` | 2 |
| `process_documents_total` | 0 |
| `process_role_profiles_total` | 0 |
| `process_roles_total` | 249 |
| `processes_active` | 19 |
| `processes_total` | 38 |
| `risks_total` | 14 |
| `subprocesses_active` | 94 |
| `subprocesses_total` | 111 |

La migracion quedo aplicada correctamente. Una segunda ejecucion accidental fue rechazada por la precondicion:

`Unexpected process master sheet columns already exist in public.processes`

Esa segunda ejecucion no produjo cambios. El POSTCHECK posterior volvio a confirmar los mismos conteos.

Estado final remoto confirmado:

- No hubo cambios de datos existentes.
- No hubo backfill.
- Los 19 procesos activos quedaron intactos.
- Las 94 etapas activas quedaron intactas.
- `process_role_profiles` quedo creada y vacia.
- `process_documents` quedo creada y vacia.
- Los nuevos campos quedaron nullable.
- RLS quedo habilitado en las dos tablas nuevas.
