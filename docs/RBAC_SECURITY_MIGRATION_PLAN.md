# Plan de migracion de seguridad RBAC

## 1. Objetivo de la futura migracion

Preparar una migracion pequena y controlada para reducir la exposicion del modelo RBAC ya aplicado en Supabase produccion.

La migracion futura debe:
- Endurecer lectura de tablas RBAC sensibles.
- Proteger vistas que exponen asignaciones, permisos efectivos y administradores.
- Revisar permisos de ejecucion y lectura mediante grants/revokes.
- Mantener compatibilidad con el frontend actual hasta validar dependencias.

Este documento no implementa SQL.

## 2. Riesgos actuales detectados

La auditoria en `docs/RBAC_SECURITY_AUDIT.md` detecto:
- Policies de lectura para `authenticated` con `using (true)` sobre tablas RBAC sensibles.
- Vistas RBAC sensibles marcadas como `UNRESTRICTED` en Supabase.
- Posible exposicion de permisos efectivos, admins globales, asignaciones y overrides a cualquier usuario autenticado.
- Ausencia de `security_invoker`, `security_definer`, `grant` o `revoke` explicitos en la migracion RBAC original.
- Riesgo de que una pantalla nueva consuma vistas demasiado amplias antes de cerrar el modelo de seguridad.

## 3. Tablas RBAC sensibles

### `permissions`

Catalogo de permisos internos. Sensibilidad media. Puede ser legible para usuarios autenticados si se acepta que todos conozcan capacidades disponibles.

### `access_roles`

Catalogo de roles de acceso. Sensibilidad media. Puede ser legible para usuarios autenticados si se usa como referencia de UI, pero no deberia permitir escritura salvo administradores.

### `access_role_permissions`

Relacion entre roles de acceso y permisos. Sensibilidad media-alta porque permite reconstruir capacidades de cada rol.

### `user_access_assignments`

Tabla muy sensible. Expone persona, rol de acceso y alcance. Debe quedar restringida a administradores o a lecturas propias/cuidadosamente acotadas.

### `permission_overrides`

Tabla muy sensible. Expone excepciones de permisos. Debe quedar restringida principalmente a administradores.

## 4. Vistas RBAC sensibles

### `v_person_access_assignments`

Muy sensible. Expone asignaciones por persona, email, rol y alcance.

### `v_person_effective_permissions`

Muy sensible. Expone permisos efectivos por persona y alcance.

### `v_access_by_country`

Sensibilidad media. Agrega accesos por pais.

### `v_access_by_company`

Sensibilidad media. Agrega accesos por empresa.

### `v_access_by_site`

Sensibilidad media. Agrega accesos por sede.

### `v_global_access_users`

Muy sensible. Expone usuarios con alcance global.

### `v_admin_access_users`

Muy sensible. Expone usuarios administradores o con permisos altos.

## 5. Policies que conviene endurecer

Endurecer primero:
- `user_access_assignments_read_authenticated`
- `permission_overrides_read_authenticated`

Evaluar despues:
- `access_role_permissions_read_authenticated`

Podrian mantenerse como catalogos legibles, si el producto lo requiere:
- `permissions_read_authenticated`
- `access_roles_read_authenticated`

Regla recomendada:
- Usuarios normales solo deberian leer sus propias asignaciones y permisos efectivos.
- Administradores deberian leer y administrar todo dentro del alcance permitido por el modelo.
- Overrides deberian ser admin-only, salvo que exista una necesidad clara de mostrar al usuario sus propias excepciones.

## 6. Vistas que deberian dejar de ser unrestricted

Prioridad alta:
- `v_person_access_assignments`
- `v_person_effective_permissions`
- `v_global_access_users`
- `v_admin_access_users`

Prioridad media:
- `v_access_by_country`
- `v_access_by_company`
- `v_access_by_site`

La migracion futura deberia revisar si estas vistas deben:
- ejecutarse como `security_invoker`;
- tener grants revocados para roles no administrativos;
- reemplazarse por vistas admin-only;
- o moverse a consultas server-side controladas por la aplicacion.

## 7. Grants/revokes a revisar

Revisar permisos para:
- `anon`
- `authenticated`
- roles internos usados por Supabase/PostgREST

Recomendaciones:
- Revocar lectura directa de vistas sensibles para `anon`.
- Revocar lectura directa de vistas sensibles para `authenticated` cuando no sean self-only.
- Permitir lectura admin mediante policies, RPC controlada o consultas server-side.
- Evitar depender de defaults de Postgres/Supabase para vistas RBAC sensibles.

## 8. `security_invoker` vs `security_definer`

### `security_invoker`

Conviene para vistas que deben respetar permisos/RLS del usuario que consulta.

Ventajas:
- Reduce riesgo de bypass accidental de RLS.
- Hace que la vista se comporte de forma mas predecible con policies.

Riesgos:
- Puede romper consultas existentes si el usuario no tiene permisos directos sobre tablas base.
- Requiere probar frontend y endpoints actuales.

### `security_definer`

Solo conviene para funciones muy controladas que implementen validacion interna estricta.

Ventajas:
- Permite encapsular acceso con logica propia.

Riesgos:
- Puede saltarse controles si se implementa mal.
- Requiere validaciones explicitas de usuario, rol y alcance.

Recomendacion: preferir `security_invoker` para vistas y evitar `security_definer` salvo en RPCs pequenas, auditadas y con checks claros.

## 9. Permisos minimos para usuarios normales

Usuarios normales deberian poder:
- Ver su propio perfil de acceso.
- Ver sus propias asignaciones activas.
- Ver sus propios permisos efectivos, si la UI lo necesita.
- Ver catalogos no sensibles necesarios para navegacion.

Usuarios normales no deberian poder:
- Ver todos los usuarios con acceso.
- Ver todos los administradores.
- Ver overrides de otras personas.
- Ver permisos efectivos de otras personas.
- Modificar roles, permisos, asignaciones u overrides.

## 10. Permisos solo para administradores

Solo administradores deberian poder:
- Crear, editar, archivar o eliminar asignaciones RBAC.
- Administrar roles de acceso.
- Administrar relaciones rol-permiso.
- Ver y administrar permission overrides.
- Ver listados completos de administradores.
- Ver listados globales de permisos efectivos.
- Consultar auditoria completa de accesos.

## 11. Riesgos de romper frontend actual

La migracion puede romper frontend si alguna pantalla actual consume:
- `v_person_access_assignments`
- `v_person_effective_permissions`
- `v_global_access_users`
- `v_admin_access_users`
- tablas RBAC directamente desde cliente Supabase

Tambien puede romper formularios administrativos si se revocan permisos antes de mover operaciones a server actions o endpoints seguros.

Antes de aplicar, hay que identificar:
- que rutas leen RBAC;
- si usan cliente server-side o browser;
- que vistas/tablas consultan;
- que datos necesita realmente cada pantalla.

## 12. Checklist antes de aplicar en produccion

- Confirmar backup o punto de recuperacion.
- Confirmar que no hay migraciones pendientes no relacionadas.
- Listar pantallas o server actions que leen RBAC.
- Confirmar que la pantalla de administracion se construira sobre lecturas admin-only.
- Probar con usuario administrador.
- Probar con usuario normal.
- Probar con usuario sin asignaciones RBAC.
- Probar lectura de vistas sensibles desde usuario normal.
- Verificar que `anon` no pueda leer vistas sensibles.
- Verificar que `authenticated` no pueda leer datos RBAC de otros usuarios.
- Preparar rollback antes de ejecutar la migracion.

## 13. Plan de rollback

Si algo falla:
- Restaurar grants previos de lectura solo sobre las vistas necesarias para recuperar operacion.
- Rehabilitar temporalmente lectura autenticada solo en tablas catalogo si la UI lo requiere.
- No abrir `permission_overrides` ni `user_access_assignments` globalmente salvo emergencia.
- Revertir cambios de `security_invoker` si bloquean operaciones criticas.
- Documentar exactamente que policy o grant se reabrió y por cuanto tiempo.

El rollback debe ser otra migracion explicita, no cambios manuales silenciosos en produccion.

## 14. Orden recomendado para la migracion futura

1. Inventariar consumo actual de tablas y vistas RBAC.
2. Crear una migracion pequena que solo ajuste vistas y grants, sin cambiar modelo de datos.
3. Proteger primero vistas de mayor riesgo:
   - `v_person_effective_permissions`
   - `v_person_access_assignments`
   - `v_global_access_users`
   - `v_admin_access_users`
4. Ajustar policies de lectura en:
   - `user_access_assignments`
   - `permission_overrides`
5. Validar comportamiento con usuario admin y usuario normal.
6. Construir la pantalla "Administracion de Accesos" solo despues de confirmar que el acceso a datos RBAC esta acotado.

## Recomendacion final

No construir todavia la pantalla de administracion sobre vistas `UNRESTRICTED`.

Primero conviene crear una migracion de seguridad minima, con foco en lectura y exposicion, sin tocar el modelo conceptual RBAC ya aplicado.
