# Contexto PC 2 - Web Orquestador

## 1. Proposito

Este documento describe el modulo `/orquestador` de la nueva web del PC 2, basandose unicamente en el codigo real del repositorio:

`C:\Users\McParking\Documents\red de roles, procesos, areas y responsables`

El objetivo es dejar contexto reutilizable para futuros chats, futuros Codex, migracion gradual de controles desde el orquestador antiguo, integracion futura de Agente 02 y mantenimiento de la arquitectura:

```text
Nueva web PC 2 / Vercel
  -> API server-side segura
  -> Supabase ops_orchestrator
  -> Worker existente PC 1
  -> Wrapper fijo
  -> Agente local
  -> Resultado/eventos en Supabase
  -> Nueva web
```

## 2. Alcance

Incluye:

- Funcionamiento observado del modulo `/orquestador`.
- Contrato de RPC usado por la web.
- Patrones de autenticacion, admin activo, DTO seguro, sanitizacion, polling y readiness.
- Controles implementados: Health Check, Source Connection Check, Banco de Reservas last-week, Banco de Packs actualizar-packs y Dashboard last-month.
- Patron recomendado para replicar Banco de Packs y futuros controles.
- Responsabilidades del PC 2/Vercel, Supabase y PC 1.

No incluye:

- Codigo interno del worker del PC 1.
- Codigo de `D:\mcparking-orquestador` o `D:\mcparking-platform`.
- Secretos, service role, tokens, URLs sensibles, PII o credenciales.
- Ejecuciones reales ni consultas directas a fuentes operacionales.

## 3. Estado del repositorio

Estado inicial observado en esta tarea:

| Campo | Valor |
|---|---|
| `git status --short` | limpio |
| Rama | `main` |
| HEAD corto | `a091de2` |
| HEAD | `a091de2 Add real last-week reservation update control` |
| Remoto | `origin https://github.com/operaciones-mcparking/mcparking-gobierno-operativo.git` |

Ultimos commits observados:

```text
a091de2 Add real last-week reservation update control
c373dec Update recovery carts on mutable changes
d333cbf Add restricted source connection check control
1b2cb9d Add safe worker health check control
ae21656 Add read-only orchestrator monitoring
6460942 Refine mobile dashboard navigation
40fc955 Default recovery chat source to all
```

Archivos esperados confirmados:

- `src/app/orquestador/page.tsx`
- `src/app/api/orquestador/health-check/route.ts`
- `src/app/api/orquestador/source-connection-check/route.ts`
- `src/app/api/orquestador/banco-reservas/last-week/route.ts`
- `src/app/orquestador/worker-health-check-button.tsx`
- `src/app/orquestador/source-connection-check-control.tsx`
- `src/app/orquestador/banco-reservas-last-week-control.tsx`
- `src/lib/orquestador/auth.ts`
- `src/lib/orquestador/supabase-admin.ts`
- `src/lib/orquestador/types.ts`
- `src/lib/orquestador/banco-reservas-last-week.ts`

## 4. Arquitectura fisica

### PC 1

Hecho arquitectonico indicado por el contexto operativo, no confirmado desde codigo del PC 2:

- Aloja el worker local.
- Aloja wrappers, locks y agentes.
- Ejecuta procesos reales.
- Accede a fuentes y bases locales.
- Rutas conocidas de referencia: `D:\mcparking-orquestador` y `D:\mcparking-platform`.

Responsabilidad del PC 1:

- Tomar jobs desde Supabase.
- Validar payloads operacionales reales.
- Ejecutar wrappers/agentes locales.
- Reportar eventos, estados y resultados.
- Mantener locks y barreras de ejecucion real.

### PC 2

Hecho observado desde este repositorio:

- Aloja el desarrollo de la nueva web Gobierno Operativo.
- Implementa `/orquestador` como interfaz web y API server-side.
- Crea jobs compatibles mediante endpoints dedicados.
- Consulta workers, jobs, job types y eventos.
- No ejecuta scripts del PC 1.
- No reimplementa logica de agentes.

### Vercel

Proyecto indicado por contexto operativo y validado previamente por GET publico:

- Proyecto: `mcparking-gobierno-operativo`.
- Dominio: `https://mcparking-gobierno-operativo.vercel.app`.
- Aloja la aplicacion Next.js.
- No tiene acceso al disco `D:\` del PC 1.
- No debe ejecutar agentes locales.

No confirmado desde codigo del PC 2:

- Project ID Vercel.
- Org ID Vercel.
- Root Directory real configurado en dashboard.
- Commit exacto desplegado en cada deployment.

### Supabase

Hecho observado por codigo:

- La web usa Supabase server-side para auth y para RPC del orquestador.
- El modulo se integra con RPC `orchestrator_*`.
- El schema operativo esperado es `ops_orchestrator`, indicado por contexto del proyecto. El codigo del PC 2 llama RPC publicas y no consulta tablas `ops_orchestrator` directamente.

## 5. Principio arquitectonico

El PC 2 no ejecuta procesos. El PC 2 solo:

1. autentica y autoriza usuarios admin activos;
2. valida readiness y payload cerrado;
3. crea jobs especificos en Supabase mediante RPC;
4. consulta estados/resultados sanitizados;
5. muestra estado y controles de forma segura.

La ejecucion real queda en PC 1. Supabase actua como cola y registro de estado/eventos, no como ejecutor local.

## 6. Responsabilidades por capa

| Capa | Responsabilidades | No debe hacer |
|---|---|---|
| PC 2 web | UI, API server-side, auth, DTO seguro, polling, crear jobs cerrados | ejecutar scripts, aceptar comandos libres, tocar D:\ |
| Vercel | alojar Next.js y API routes | acceder a fuentes locales del PC 1, ejecutar agentes |
| Supabase | cola, RPC, workers, jobs, eventos, resultados | ejecutar procesos locales |
| PC 1 worker | tomar jobs, validar payload, ejecutar wrappers/agentes, reportar eventos | depender de parametros libres enviados por navegador |

## 7. Modulo `/orquestador`

### Punto de entrada

- Archivo: `src/app/orquestador/page.tsx`.
- Funcion principal: `OrquestadorPage()`.
- Configuracion: `export const dynamic = "force-dynamic"`.

La pagina:

- exige `requireAdminAccess()` antes de cargar datos;
- carga workers, jobs, eventos y tipos de job con `loadOrquestadorData()`;
- renderiza KPIs, tablas y controles;
- monta `WorkerHealthCheckButton`, `SourceConnectionCheckControl`, `BancoReservasLastWeekControl` y `OrquestadorRefreshButton`.

### Carga de datos

`loadOrquestadorData()` llama en paralelo:

- `listOrchestratorWorkers()`
- `listOrchestratorJobs()`
- `listOrchestratorEvents()`
- `listOrchestratorJobTypes()`

Fuente: `src/app/orquestador/page.tsx` y `src/lib/orquestador/supabase-admin.ts`.

### Visualizacion

La pagina muestra:

- workers: `worker_id`, `display_name`, `status`, `last_seen_at`, `locked_job_id`;
- jobs: `id`, `job_type`, `status`, `worker_id`, `attempts/max_attempts`, fechas y `error_message` sanitizado;
- eventos: fecha, tipo, job, worker y mensaje sanitizado;
- job types: tipo, nombre, enabled y descripcion sanitizada.

## 8. Autenticacion y permisos

### Pagina server-side

- Archivo: `src/lib/auth/admin.ts`.
- Funcion: `requireAdminAccess()`.
- Uso: `src/app/orquestador/page.tsx`.

La pagina `/orquestador` requiere admin activo server-side antes de renderizar datos.

### API routes

- Archivo: `src/lib/orquestador/auth.ts`.
- Funcion: `getActiveAdminUser()`.

Regla real observada:

```text
profile.app_role === "admin"
profile.status === "active"
```

`getActiveAdminUser()`:

1. crea cliente auth server-side con `createSupabaseAuthServerClient()`;
2. obtiene `supabase.auth.getUser()`;
3. consulta `user_profiles` con `.select("app_role,status")` y `.eq("user_id", user.id)`;
4. rechaza si no hay usuario, si hay error, si no existe perfil, si no es admin o si no esta activo.

Errores publicos usados por rutas:

- no autenticado: `401` con `No autenticado.`;
- no admin/activo: `403` con `No autorizado.`.

## 9. Capa Supabase admin

- Archivo: `src/lib/orquestador/supabase-admin.ts`.
- Proteccion: `import "server-only"`.
- Cliente: `createOrquestadorSupabaseAdminClient()`.

Variables observadas:

- URL: `process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL`.
- Service role: `process.env.SUPABASE_SERVICE_ROLE_KEY`.

Hecho de seguridad:

- El service role queda en helper server-only.
- No se exporta a componentes client-side.
- Las APIs devuelven mensajes publicos controlados, no `error.message` de Supabase.

## 10. Contrato con Supabase

### RPC utilizadas

| Funcion web | RPC | Argumentos observados |
|---|---|---|
| `listOrchestratorWorkers()` | `orchestrator_list_workers` | sin argumentos |
| `listOrchestratorJobs()` | `orchestrator_list_jobs` | `{ p_limit: 20 }` |
| `listOrchestratorJobsForGuard()` | `orchestrator_list_jobs` | `{ p_limit: 1000 }` |
| `listOrchestratorEvents()` | `orchestrator_list_events` | `{ p_limit: 50 }` |
| `listOrchestratorJobTypes()` | `orchestrator_list_job_types` | sin argumentos |
| `createWorkerHealthCheckJob()` | `orchestrator_create_job` | contrato fijo health check |
| `createSourceConnectionCheckJob()` | `orchestrator_create_job` | contrato fijo source check |
| `createBancoReservasLastWeekJob()` | `orchestrator_create_job` | contrato fijo Banco de Reservas |
| `createBancoPacksUpdateJob()` | `orchestrator_create_job` | contrato fijo Banco de Packs actualizar-packs |

### Tablas/vistas

No hay consultas directas a tablas `ops_orchestrator` desde el modulo PC 2. La web opera mediante RPC publicas `orchestrator_*`.

No confirmado desde codigo PC 2:

- definicion SQL exacta de las RPC;
- DDL actual de tablas `ops_orchestrator`;
- constraints atomicas disponibles en Supabase.

### Mapeos DTO

Archivo: `src/lib/orquestador/types.ts`.

| Supabase/raw | DTO navegador | Nota |
|---|---|---|
| `RawWorkerRow.current_job_id` | `OrchestratorWorker.locked_job_id` | alias usado por UI |
| `RawJobRow.locked_by_worker_id ?? target_worker_id` | `OrchestratorJob.worker_id` | worker seguro visible |
| `RawJobRow.error_message` | `OrchestratorJob.error_message` | sanitizado |
| `RawJobRow.result` | `*_result` especifico | nunca result crudo |
| `RawEventRow.message` | `OrchestratorEvent.message` | sanitizado |
| `RawJobTypeRow.display_name` | `OrchestratorJobType.name` | nombre visible |

Campos raw definidos pero no expuestos directamente:

- `payload`
- `result`
- `metadata`
- `data`

## 11. DTO y sanitizacion

Archivo: `src/lib/orquestador/types.ts`.

Funcion principal: `sanitizeOperationalText()`.

Reglas observadas:

- reemplaza whitespace multiple por un espacio;
- rechaza texto vacio;
- rechaza rutas locales tipo `C:\...`;
- rechaza patrones de stack trace;
- rechaza JSON crudo si empieza/termina con `{}` o `[]`;
- trunca a 160 caracteres aproximadamente;
- fallback: `Error operacional registrado.`.

Resultados seguros por job type:

| Job type | Funcion | Campos expuestos |
|---|---|---|
| `worker_health_check` | `safeHealthCheckResult()` | `ok`, `worker_id`, `checked_at`, `dry_run`, `real_execution_allowed` |
| `source_connection_check` | `safeSourceConnectionResult()` | `ok`, `source_key`, `checked_at`, `duration_ms`, `read_only`, `worker_id` |
| `banco_reservas_actualizar` | `safeBancoReservasLastWeekResult()` | `ok`, `duration_seconds`, `modo`, `returncode`, `timed_out` |
| `banco_packs_actualizar_sin_consumos` | `safeBancoPacksUpdateResult()` | `ok`, `duration_seconds`, `action`, `returncode`, `timed_out` |

No se expone:

- payload completo;
- result crudo;
- metadata;
- stdout/stderr;
- command preview;
- rutas locales;
- stack trace.

## 12. Readiness, heartbeat y cola

Archivo: `src/lib/orquestador/banco-reservas-last-week.ts`.

Constantes:

```ts
BANCO_RESERVAS_LAST_WEEK_JOB_TYPE = "banco_reservas_actualizar"
BANCO_RESERVAS_LAST_WEEK_MODE = "last-week"
BANCO_RESERVAS_TARGET_WORKER_ID = "pc_operaciones_01"
BANCO_RESERVAS_REQUESTED_SOURCE = "web_orchestrator_last_week"
BANCO_RESERVAS_PRIORITY = 1
BANCO_RESERVAS_HEARTBEAT_MAX_AGE_MS = 120_000
ACTIVE_JOB_STATUSES = new Set(["queued", "claimed", "running"])
```

Aclaracion de contrato: `claimed` aparece en el codigo del PC 2 como estado activo defensivo/compatible. Segun el contexto auditado del PC 1, la RPC de claim actualmente mueve el job directamente de `queued` a `running`, y el schema auditado del PC 1 define como estados persistidos `queued`, `running`, `succeeded`, `failed` y `cancelled`. Por lo tanto, `claimed` no esta confirmado como estado persistido real del schema actual; su inclusion en PC 2 debe entenderse como compatibilidad defensiva de la web. La fuente canonica para estados reales del worker/schema es `docs/contexto_pc1_worker_y_agentes.md` dentro del repositorio PC 1.

Criterio heartbeat:

- `isWorkerHeartbeatRecent(lastSeenAt, nowMs)` parsea `last_seen_at`.
- El heartbeat es vigente si `nowMs - lastSeenMs <= 120_000`.
- Si falta o no parsea, se considera no vigente.

Readiness de Banco de Reservas:

`getBancoReservasReadiness()` exige:

1. job type existe;
2. job type `enabled=true`;
3. worker existe y es `pc_operaciones_01`;
4. heartbeat reciente;
5. `worker.status === "idle"`;
6. `worker.locked_job_id` nulo;
7. no existe ningun job global con `queued`, `claimed` o `running`.

Codigos UI:

- `ready` -> `Listo`
- `job_type_disabled` -> `No disponible`
- `job_type_missing` -> `No disponible`
- `worker_missing` -> `Worker fuera de linea`
- `worker_offline` -> `Worker fuera de linea`
- `worker_busy` -> `Worker ocupado`
- `active_queue` -> `Otra operacion activa`

Limitacion importante:

- La doble comprobacion reduce carreras, pero no prueba atomicidad total. No se observa una RPC transaccional especifica para reservar cola+worker+crear job en una sola operacion desde el codigo del PC 2.

## 13. Polling y estado UI

Controles client-side:

- `src/app/orquestador/worker-health-check-button.tsx`
- `src/app/orquestador/source-connection-check-control.tsx`
- `src/app/orquestador/banco-reservas-last-week-control.tsx`

Patron comun:

- `AbortController` por solicitud/polling;
- aborta al desmontar componente;
- `isMountedRef` evita setState despues de desmontar;
- `waitUntilVisible()` pausa si `document.visibilityState !== "visible"`;
- polling por ID exacto del job creado;
- terminal statuses: `succeeded`, `failed`, `cancelled`;
- timeout visual con mensaje si no termina dentro del numero de intentos;
- el timeout visual no cancela job ni modifica Supabase.

Frecuencias observadas:

| Control | Intentos | Espera inicial | Espera posterior |
|---|---:|---:|---:|
| Health Check | 30 | 700 ms | 2000 ms |
| Source Connection Check | 30 | 700 ms | 2000 ms |
| Banco Reservas last-week | 60 | 700 ms | 3000 ms |
| Banco Packs actualizar-packs | 120 | 700 ms | 30000 ms |

## 14. Health Check

| Campo | Valor observado |
|---|---|
| UI | `WorkerHealthCheckButton` |
| Endpoint | `POST /api/orquestador/health-check` |
| Body permitido | vacio; rechaza contenido no vacio |
| Query params | rechazados |
| Job type | `worker_health_check` |
| Payload | `{}` |
| requested_source | `web` |
| target_worker_id | `null` |
| priority | `100` |
| Resultado seguro | `ok`, `worker_id`, `checked_at`, `dry_run`, `real_execution_allowed` |
| Proposito | probar que worker toma y responde un job seguro |
| Riesgo | bajo; no debe ejecutar agentes ni procesos reales segun contrato esperado |

No confirmado desde PC 2:

- implementacion exacta del handler en PC 1.

## 15. Source Connection Check

| Campo | Valor observado |
|---|---|
| UI | `SourceConnectionCheckControl` |
| Endpoint | `POST /api/orquestador/source-connection-check` |
| Body permitido | vacio; rechaza contenido no vacio |
| Query params | rechazados |
| Job type | `source_connection_check` |
| Payload | `{}` |
| requested_source | `web` |
| target_worker_id | `null` |
| priority | `100` |
| Validacion adicional | job type existe y `enabled=true` antes de crear |
| Resultado seguro | `ok`, `source_key`, `checked_at`, `duration_ms`, `read_only`, `worker_id` |
| Proposito | comprobar conectividad read-only desde worker local |
| Riesgo | medio; depende de que PC 1 mantenga consulta minima y resultado sanitizado |

Limitaciones:

- No valida worker exacto ni cola global desde PC 2.
- No confirmado desde PC 2 si el handler PC 1 fuerza fuente fija y consulta read-only.

## 16. Banco de Reservas last-week

| Campo | Valor observado |
|---|---|
| UI | `BancoReservasLastWeekControl` |
| Endpoint | `POST /api/orquestador/banco-reservas/last-week` |
| Body cliente | `{ "confirm": true }` exacto |
| Query params | rechazados |
| Job type | `banco_reservas_actualizar` |
| Payload server-side | `{ modo: "last-week" }` |
| requested_source | `web_orchestrator_last_week` |
| target_worker_id | `pc_operaciones_01` |
| priority | `1` |
| Heartbeat maximo | 120 segundos |
| Cola activa global | `queued`, `claimed`, `running` |
| Segunda comprobacion | `loadReadiness()` se ejecuta dos veces antes de `createBancoReservasLastWeekJob()` |
| Resultado seguro | `ok`, `duration_seconds`, `modo`, `returncode`, `timed_out` |

Validaciones previas:

- admin activo;
- body JSON objeto exacto con solo `confirm:true`;
- job type existe;
- job type habilitado;
- worker `pc_operaciones_01` existe;
- worker idle;
- `current_job_id` mapeado a `locked_job_id` debe estar vacio;
- heartbeat reciente;
- cola global sin jobs activos;
- segunda comprobacion inmediatamente antes de crear.

UI:

- muestra `Banco de Reservas`;
- indica `Modo fijo: Ultima semana`;
- indica `Ejecucion real`;
- muestra nota: la ejecucion solo puede iniciarse cuando no existen otros jobs activos;
- exige modal `Confirmar ejecucion real`;
- envia solo `JSON.stringify({ confirm: true })`;
- bloquea doble clic con `isSubmitting` y `canSubmit`;
- polling aislado por ID y `job_type === "banco_reservas_actualizar"`;
- se detiene en `succeeded`, `failed` o `cancelled`.

Prueba real validada desde nueva web:

- No confirmado desde codigo del PC 2. El contexto operativo del proyecto indica que ya se valido una ejecucion real controlada, pero este documento no inspecciona logs del PC 1 ni Supabase en vivo.

## 17. Patron para replicar botones

Patron aprobado para replicar un control del orquestador antiguo:

1. Auditar primero el job type real del PC 1.
2. Confirmar payload y wrapper existente.
3. No modificar el worker si ya reconoce el job.
4. Cerrar payload en PC 1 si no es estricto.
5. Anadir lock en PC 1 si el agente lo requiere.
6. Mantener job type deshabilitado hasta validar.
7. Crear endpoint dedicado en PC 2.
8. Fijar server-side job type, payload, source, target y priority.
9. Validar worker, heartbeat y cola para acciones reales.
10. Exigir confirmacion en acciones reales.
11. Devolver DTO sanitizado.
12. Implementar polling aislado por ID exacto.
13. Agregar tests con mocks/estaticos que no llamen Supabase real.
14. Probar dry-run cuando corresponda.
15. Hacer prueba real controlada una sola vez.
16. Cerrar barreras.
17. Documentar resultado.
18. Continuar con otro boton solo despues.

### Separacion de tareas

| Area | Tareas |
|---|---|
| PC 1 | validar handler, payload estricto, locks, barreras, wrappers, agente |
| PC 2 | endpoint dedicado, UI, readiness, DTO, pruebas, documentacion |
| Supabase | job type, RPC existente, enabled controlado, auditoria de eventos |
| E2E | una ejecucion controlada, sin dashboard antiguo, cierre de barreras |

## 18. Preparacion de Agente 02

Estado PC 1 actualizado para Agente 02:

- Payload estricto confirmado desde PC 1 para `banco_packs_actualizar_sin_consumos` y `banco_packs_actualizar_completo`.
- Lock operacional confirmado desde PC 1.
- Commit de referencia PC 1: `89ee185 Harden Agent 02 job execution`.
- Lock file: `runtime/locks/agente_02_banco_packs.lock`.
- Script: `scripts/agente_02_lock.ps1`.
- Exit code de lock ocupado: `74`.
- Mensaje de lock ocupado: `Agente 02 ya tiene una ejecución en curso.`
- El lock aplica a todas las acciones del Agente 02.
- Alcance parcial: protege ejecuciones via wrapper del orquestador, no ejecucion manual directa desde `D:\mcparking-platform`.

Primera acción recomendada para la integración web: `actualizar-packs`, mediante el job type `banco_packs_actualizar_sin_consumos`.

### Control web `actualizar-packs`

Implementacion web PC 2 desplegada y validada en dry-run E2E desde produccion:

| Campo | Valor implementado/observado |
|---|---|
| UI | `BancoPacksUpdateControl` |
| Endpoint | `POST /api/orquestador/banco-packs/actualizar-packs` |
| Body cliente | `{ "confirm": true }` exacto |
| Query params | rechazados |
| Job type | `banco_packs_actualizar_sin_consumos` |
| Payload server-side | `{ action: "actualizar-packs" }` |
| requested_source | `web_orchestrator_banco_packs_actualizar_packs` |
| target_worker_id | `pc_operaciones_01` |
| priority | `1` |
| Heartbeat maximo | 120 segundos |
| Cola activa global | `queued`, `claimed`, `running` |
| Segunda comprobacion | readiness se ejecuta dos veces antes de `createBancoPacksUpdateJob()` |
| Resultado seguro | `ok`, `dry_run`, `message`, `duration_seconds`, `action`, `returncode`, `timed_out`, contadores opcionales si existen |
| Pruebas | `scripts/orquestador-banco-packs-actualizar-packs.test.mjs` |
| Commit funcional PC 2 | `95f633a Show Banco de Packs dry-run result` |
| Job E2E dry-run | `fcbc3229-8abf-48e7-a522-7b6fd1d07957` |
| Estado terminal | `succeeded` |
| Attempts | `1` |
| Worker | `pc_operaciones_01` |
| Duracion visible | aproximadamente 5 segundos |

Validacion E2E dry-run desde nueva web:

- Flujo validado: Nueva web -> endpoint dedicado -> Supabase -> worker PC 1 -> registry -> dry-run -> resultado -> polling -> UI.
- La UI mostro `Estado: Completado`, worker `pc_operaciones_01`, `Intentos: 1`, duracion aproximada de 5 segundos, resultado `Dry-run completado correctamente`, mensaje `Dry-run: comando real no ejecutado.` y accion `actualizar-packs`.
- El worker registro job recibido, `job_type=banco_packs_actualizar_sin_consumos` y termino `succeeded` en dry-run.
- Barreras efectivas observadas: `WORKER_DRY_RUN=true`, `WORKER_ALLOW_REAL_EXECUTION=false`, `ORCHESTRATOR_ALLOW_AGENT02_REAL_EXECUTION=false`.
- Estado final observado: worker idle, current job vacio, jobs en curso o cola `0`, job historico `succeeded`, `attempts=1/1`.
- La UI no expuso payload crudo, result crudo, stdout, stderr, `command_preview`, rutas locales ni secretos.
- El fix `95f633a` permitio mostrar correctamente el resultado dry-run aun cuando `ok=true` no estuviera presente.

Estado actual: integracion web local completada, control desplegado, evidencia funcional confirmada por ruta y prueba E2E desde web en dry-run, dry-run web E2E validado. Ejecucion real sigue pendiente.

La prueba no valido ejecucion del wrapper real, adquisicion del lock durante una ejecucion real, CLI real del Agente 02, escritura SQLite, acceso MySQL del Agente 02, backups/outputs reales ni semantica operacional real de `actualizar-packs`.

Pendiente para PC 2 antes de ejecucion real:

- planificar una prueba real controlada;
- confirmar que campos reales devolvera Agente 02;
- definir como validar SQLite antes/despues;
- cerrar barreras inmediatamente despues de la prueba;
- documentar si corresponde un procedimiento operativo de rollback.

## 19. Dashboard last-month

Control individual implementado localmente para actualizar metricas operacionales del ultimo mes mediante el job existente `dashboard_actualizar_metricas`. La web no recrea calculos, filtros ni logica del dashboard; solo crea el job en Supabase para que el worker `pc_operaciones_01` lo ejecute.

| Campo | Valor implementado |
|---|---|
| UI | `DashboardLastMonthControl` |
| Endpoint | `POST /api/orquestador/dashboard/last-month` |
| Body cliente | `{ "confirm": true }` exacto |
| Query params | rechazados |
| Job type | `dashboard_actualizar_metricas` |
| Payload server-side | `{ agent: "dashboard", action: "actualizar-metricas", periodo: "last-month" }` |
| requested_source | `web_orchestrator_dashboard_last_month` |
| target_worker_id | `pc_operaciones_01` |
| priority | `1` |
| Heartbeat maximo | 120 segundos |
| Cola activa global | `queued`, `claimed`, `running` |
| Segunda comprobacion | readiness se ejecuta dos veces antes de `createDashboardLastMonthJob()` |
| Resultado seguro | `ok`, `dry_run`, `message`, `duration_seconds`, `periodo`, `returncode`, `timed_out`, `rows_written`, `dates_processed` si existen |
| Pruebas | `scripts/orquestador-dashboard-last-month.test.mjs` |

UI/polling:

- Control separado bajo titulo `Dashboard` y accion `Actualizar metricas ultimo mes`.
- Badge `Ejecucion real`.
- Modal de confirmacion que aclara que no actualiza previamente Reservas ni Packs.
- Envia solo `JSON.stringify({ confirm: true })`.
- Bloquea doble clic, usa `AbortController`, evita setState tras unmount, pausa con pestana oculta y hace polling por ID exacto y `job_type === "dashboard_actualizar_metricas"`.
- Se detiene en `succeeded`, `failed` o `cancelled`; el timeout visual no cancela el job.

Estado: implementacion local lista. Dry-run web pendiente, ejecucion real pendiente y boton compuesto pendiente.


## 19.1 CompositeRunViewer

Componente local reutilizable implementado para visualizar ejecuciones compuestas sin conectarse todavia a un flujo real.

| Campo | Estado |
|---|---|
| Componente | `src/app/orquestador/composite-run-viewer.tsx` |
| Mapeador seguro | `src/lib/orquestador/composite-runs.ts` |
| Fixture/test local | `scripts/fixtures/composite-run-viewer-fixtures.mjs` y `scripts/orquestador-composite-run-viewer.test.mjs` |
| Primer consumidor previsto | `Actualizar datos operacionales` |
| Supabase real | No llamado por esta implementacion |
| Creacion de jobs | No implementada en este componente |
| Estado | viewer local listo; endpoints compuestos pendientes; integracion real pendiente; dry-run pendiente |

El modelo no incluye `payload`, `result` crudo, `stdout`, `stderr`, `command_preview`, rutas locales, metadata sensible, secretos ni PII. El mapeador ordena por `sequence_index`, crea placeholders para pasos faltantes, marca pasos posteriores a fallo como `blocked`, calcula progreso/duracion y reutiliza sanitizacion operacional existente para mensajes y errores.


### Endpoints compuestos `Actualizar datos operacionales`

Implementacion local server-side agregada para coordinar el flujo compuesto `actualizar_datos_operacionales_last_month`. La web no recrea logica, wrappers, filtros ni calculos; solo crea pasos correlacionados mediante RPC composite y consulta estado seguro.

| Etapa | Job type | Payload server-side | requested_source | priority |
|---:|---|---|---|---:|
| 1 | `banco_reservas_actualizar` | `{ "modo": "last-month" }` | `web_orchestrator_operaciones_last_month_reservas` | 90 |
| 2 | `banco_packs_actualizar_sin_consumos` | `{ "action": "actualizar-packs" }` | `web_orchestrator_operaciones_last_month_packs` | 91 |
| 3 | `dashboard_actualizar_metricas` | `{ "agent": "dashboard", "action": "actualizar-metricas", "periodo": "last-month" }` | `web_orchestrator_operaciones_last_month_dashboard` | 92 |

Constantes y guardas: `src/lib/orquestador/actualizar-datos-operacionales.ts`.

Endpoints locales:

- `POST /api/orquestador/operaciones/actualizar-datos`: exige `{ "confirm": true }`, valida admin activo, readiness de tres job types, worker `pc_operaciones_01`, heartbeat <= 120 segundos, worker idle, sin `locked_job_id` y cola global vacia; repite readiness y crea solo etapa 1.
- `POST /api/orquestador/operaciones/actualizar-datos/advance`: exige `{ "run_id": "<uuid>" }`, valida composite kind, no avanza si la etapa actual esta activa o terminal, y crea solo la siguiente etapa si corresponde.
- `GET /api/orquestador/operaciones/actualizar-datos/[runId]`: valida admin activo y devuelve DTO seguro del run.

RPC usadas: `orchestrator_create_composite_job_step` y `orchestrator_list_composite_run_jobs`. El DTO reutiliza `CompositeRunViewModel` y no devuelve `payload`, `result` crudo, stdout/stderr, `command_preview`, rutas locales, metadata sensible, secretos ni PII.

Estado: endpoints locales listos; boton UI pendiente; integracion `CompositeRunViewer` pendiente; dry-run web pendiente; ejecucion real pendiente.

## 20. Plantilla para futuros agentes

```text
Nombre del control:
Job type:
Endpoint PC 2:
Body cliente permitido:
Payload server-side:
requested_source:
target_worker_id:
priority:
Job type enabled requerido:
Worker requerido:
Heartbeat maximo:
Estados de cola bloqueantes:
Confirmacion requerida:
Resultado seguro visible:
Campos ocultos:
Pruebas con mocks:
Prueba dry-run:
Prueba real controlada:
Riesgos:
Hechos no confirmados:
```

## 21. Que no debe modificarse

PC 2/Vercel no debe:

- ejecutar scripts locales;
- acceder al disco `D:\`;
- conectarse directamente a fuentes operacionales del PC 1;
- reimplementar logica de agentes;
- aceptar comandos libres;
- aceptar rutas, SQL, host, credenciales o argumentos desde navegador;
- modificar funciones del worker para replicar botones existentes;
- crear endpoints genericos peligrosos;
- exponer payload/result/error crudos;
- asumir que `returncode=0` por si solo garantiza exito operacional;
- usar el dashboard antiguo como parte de los nuevos controles;
- tocar `/recuperacion` para cambios del orquestador.

## 22. Riesgos y limitaciones

| Riesgo | Estado |
|---|---|
| Doble comprobacion no atomica | Confirmado por codigo; mitiga carreras pero no prueba atomicidad total |
| `orchestrator_list_jobs` con `p_limit: 1000` podria no cubrir colas masivas | Riesgo teorico; no confirmado con datos reales |
| Health/source checks no validan cola global ni worker exacto | Confirmado por codigo |
| Resultado Banco usa `returncode` pero no prueba exito operacional completo | Confirmado por DTO; exito real depende de PC 1 |
| Worker/agentes PC 1 no auditados aqui | Limitacion explicita |
| Diferencia de estados activos entre PC 2 y PC 1 | PC 2 incluye `claimed` como compatibilidad defensiva; segun contexto auditado de PC 1, los estados persistidos confirmados son `queued`, `running`, `succeeded`, `failed` y `cancelled`, y la RPC de claim pasa de `queued` a `running` |
| Vercel project metadata no esta en `.vercel/project.json` | Confirmado previamente; no afecta codigo pero limita trazabilidad local |
| Lock Agente 02 parcial, no global | Confirmado por PC 1 en `89ee185`; protege wrapper del orquestador, no ejecucion manual directa desde plataforma |
| Lock Agente 02 durante ejecucion real | Aun no ejercitado desde la nueva web porque el E2E validado fue dry-run |
| Rollback operacional real de Agente 02 | Pendiente de validar/documentar antes de ejecucion real |
| Agente 02 `actualizar-packs` ya tiene control web en PC 2 | Implementado, desplegado y validado en dry-run E2E |
| Agente 02 `actualizar-packs` dry-run desde nueva web | Validado E2E con job `fcbc3229-8abf-48e7-a522-7b6fd1d07957`, `succeeded`, `attempts=1` |
| Agente 02 no ha sido validado en ejecucion real desde la nueva web | Pendiente; el dry-run no ejecuto wrapper, CLI, SQLite, MySQL ni outputs reales |
| Resultado seguro de Agente 02 | DTO de Packs soporta dry-run seguro; resultado real y contadores aun deben confirmarse |
| Dashboard last-month | Implementacion local lista; dry-run web, ejecucion real y boton compuesto pendientes |

## 23. Preguntas abiertas

- Cuando realizar prueba real controlada de `actualizar-packs` desde PC 2.
- Cuando realizar dry-run web de Dashboard last-month.
- Que campos reales devolvera Agente 02 despues de una ejecucion real.
- Como validar SQLite antes/despues de la prueba real.
- Como cerrar barreras inmediatamente despues de la prueba real.
- Si documentar un procedimiento operativo de rollback.
- Si el job type debe permanecer `enabled=true` durante pruebas o habilitarse solo por ventanas controladas.
- Si existe una RPC transaccional para crear jobs con guardas atomicas.
- Si conviene crear endpoint dedicado `GET /api/orquestador/jobs/[id]` para evitar depender de que el job aparezca en los ultimos 20.
- Si `listOrchestratorJobsForGuard()` debe usar una RPC especifica de jobs activos en vez de `p_limit: 1000`.
- Si conviene mantener `claimed` como compatibilidad defensiva en PC 2 o alinear la web a los estados persistidos reales confirmados por PC 1.
## 24. Glosario

| Termino | Definicion |
|---|---|
| PC 2 | Computador donde se desarrolla la nueva web Gobierno Operativo |
| PC 1 | Computador con worker local, wrappers y agentes |
| Worker | Proceso local que consulta Supabase y ejecuta jobs permitidos |
| Job type | Tipo controlado de trabajo en `ops_orchestrator` |
| Payload | Datos del job; en PC 2 debe fijarse server-side para controles seguros |
| Readiness | Estado calculado antes de permitir crear job real |
| Heartbeat | `last_seen_at` reportado por worker |
| Cola activa | Jobs con estado `queued`, `claimed` o `running` |
| DTO seguro | Objeto sanitizado devuelto al navegador |
| Agente | Proceso local ejecutado por wrapper/worker en PC 1 |

## 24. Referencias de archivos y funciones

| Archivo | Funcion/elemento | Uso |
|---|---|---|
| `src/app/orquestador/page.tsx` | `OrquestadorPage()` | entrada server-side de `/orquestador` |
| `src/app/orquestador/page.tsx` | `loadOrquestadorData()` | carga workers, jobs, eventos y tipos |
| `src/app/orquestador/page.tsx` | `statusTone()` | representacion visual de estados |
| `src/lib/auth/admin.ts` | `requireAdminAccess()` | auth admin para pagina |
| `src/lib/orquestador/auth.ts` | `getActiveAdminUser()` | auth admin para API routes |
| `src/lib/orquestador/supabase-admin.ts` | `createOrquestadorSupabaseAdminClient()` | cliente service role server-only |
| `src/lib/orquestador/supabase-admin.ts` | `listOrchestratorWorkers()` | RPC workers |
| `src/lib/orquestador/supabase-admin.ts` | `listOrchestratorJobs()` | RPC jobs recientes |
| `src/lib/orquestador/supabase-admin.ts` | `listOrchestratorJobsForGuard()` | RPC jobs para cola activa |
| `src/lib/orquestador/supabase-admin.ts` | `listOrchestratorEvents()` | RPC eventos |
| `src/lib/orquestador/supabase-admin.ts` | `listOrchestratorJobTypes()` | RPC job types |
| `src/lib/orquestador/supabase-admin.ts` | `createWorkerHealthCheckJob()` | crea health check fijo |
| `src/lib/orquestador/supabase-admin.ts` | `createSourceConnectionCheckJob()` | crea source check fijo |
| `src/lib/orquestador/supabase-admin.ts` | `createBancoReservasLastWeekJob()` | crea Banco Reservas last-week fijo |
| `src/lib/orquestador/types.ts` | `sanitizeOperationalText()` | sanitizacion de texto visible |
| `src/lib/orquestador/types.ts` | `safeJobRow()` | DTO seguro de jobs |
| `src/lib/orquestador/types.ts` | `safeWorkerRow()` | DTO seguro de workers |
| `src/lib/orquestador/types.ts` | `safeEventRow()` | DTO seguro de eventos |
| `src/lib/orquestador/types.ts` | `safeJobTypeRow()` | DTO seguro de job types |
| `src/lib/orquestador/banco-reservas-last-week.ts` | `getBancoReservasReadiness()` | readiness Banco Reservas |
| `src/lib/orquestador/banco-packs-actualizar-packs.ts` | `getBancoPacksUpdateReadiness()` | readiness Banco Packs |
| `src/lib/orquestador/banco-reservas-last-week.ts` | `isWorkerHeartbeatRecent()` | heartbeat 120 segundos |
| `src/app/api/orquestador/health-check/route.ts` | `POST()` | endpoint health check |
| `src/app/api/orquestador/source-connection-check/route.ts` | `POST()` | endpoint source check |
| `src/app/api/orquestador/banco-reservas/last-week/route.ts` | `POST()` | endpoint Banco Reservas real controlado |
| `src/app/api/orquestador/workers/route.ts` | `GET()` | endpoint workers seguro |
| `src/app/api/orquestador/jobs/route.ts` | `GET()` | endpoint jobs seguro |
| `src/app/api/orquestador/events/route.ts` | `GET()` | endpoint eventos seguro |
| `src/app/api/orquestador/job-types/route.ts` | `GET()` | endpoint job types seguro |
| `src/app/orquestador/worker-health-check-button.tsx` | `WorkerHealthCheckButton()` | UI/polling health check |
| `src/app/orquestador/source-connection-check-control.tsx` | `SourceConnectionCheckControl()` | UI/polling source check |
| `src/app/orquestador/banco-reservas-last-week-control.tsx` | `BancoReservasLastWeekControl()` | UI/polling Banco Reservas |
| `src/app/orquestador/banco-packs-update-control.tsx` | `BancoPacksUpdateControl()` | UI/polling Banco Packs |
| `src/app/orquestador/refresh-button.tsx` | `OrquestadorRefreshButton()` | refresh server data |
| `scripts/orquestador-source-connection-check.test.mjs` | tests | pruebas estaticas source check |
| `scripts/orquestador-banco-reservas-last-week.test.mjs` | tests A-AA | pruebas estaticas Banco Reservas |
| `scripts/orquestador-banco-packs-actualizar-packs.test.mjs` | tests A-AI | pruebas estaticas Banco Packs |