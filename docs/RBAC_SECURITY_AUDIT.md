# Auditoria tecnica de seguridad RBAC

## Alcance

Esta auditoria revisa la migracion local `supabase/migrations/20260626100000_rbac_access_model.sql` y el estado reportado en Supabase produccion: tablas RBAC aplicadas y vistas RBAC visibles como `UNRESTRICTED`.

No se ejecutaron queries contra Supabase y no se modifico la base de datos.

## Partes RBAC ya aplicadas

La migracion crea los tipos:
- `access_scope_type`: `global`, `country`, `company`, `site`.
- `permission_override_effect`: `allow`, `deny`.

La migracion crea estas tablas:
- `permissions`
- `access_roles`
- `access_role_permissions`
- `user_access_assignments`
- `permission_overrides`

Tambien crea:
- indices basicos y dos indices unicos parciales para asignaciones activas y overrides activos.
- triggers de `updated_at` para las cinco tablas.
- seeds de permisos, roles de acceso, relaciones rol-permiso y algunas asignaciones iniciales por nombre de persona.
- vistas de consulta y auditoria RBAC.
- una funcion SQL para permisos efectivos por persona.
- RLS y policies para las cinco tablas RBAC.

## Tablas sensibles

### `user_access_assignments`

Tabla muy sensible. Expone que persona tiene que rol de acceso y en que alcance opera. Permite inferir administradores globales, responsables por pais, empresa o sede, y usuarios operativos.

### `permission_overrides`

Tabla muy sensible. Expone excepciones de permisos, incluyendo permisos especiales concedidos o denegados. Puede revelar debilidades operativas o accesos de emergencia.

### `access_role_permissions`

Tabla sensible. Permite reconstruir que capacidades tiene cada rol de acceso.

### `access_roles`

Sensibilidad media. Por si sola es catalogo, pero combinada con asignaciones revela estructura de acceso.

### `permissions`

Sensibilidad media. Lista capacidades internas disponibles. No contiene asignaciones, pero ayuda a mapear superficie funcional de la plataforma.

## Vistas sensibles

### `v_person_access_assignments`

Muy sensible. Une personas, emails, roles de acceso y alcances. Si cualquier usuario autenticado la puede leer, puede ver asignaciones RBAC de otros usuarios.

### `v_person_effective_permissions`

Muy sensible. Expone permisos efectivos por persona, modulo, rol de acceso y alcance. Es probablemente la vista mas critica del modelo.

### `v_global_access_users`

Muy sensible. Lista usuarios con alcance global activo.

### `v_admin_access_users`

Muy sensible. Lista usuarios administradores o con permisos de alto impacto como `settings.manage`, `roles.manage` o `people.manage`.

### `v_access_by_country`, `v_access_by_company`, `v_access_by_site`

Sensibilidad media. Son agregadas, pero permiten inferir distribucion de accesos por alcance.

## Funcion sensible

### `person_effective_permissions(target_person_id uuid)`

La funcion devuelve permisos efectivos para una persona dada. En la migracion aparece como `language sql stable`, sin `security definer` ni `security invoker` explicito.

Riesgo principal: si el rol que ejecuta puede leer la vista base o ejecutar la funcion, podria consultar permisos efectivos de otra persona pasando su `person_id`.

## Policies RLS actuales

La migracion habilita RLS en:
- `permissions`
- `access_roles`
- `access_role_permissions`
- `user_access_assignments`
- `permission_overrides`

Crea dos grupos de policies:

1. Lectura para usuarios autenticados:
   - `permissions_read_authenticated`
   - `access_roles_read_authenticated`
   - `access_role_permissions_read_authenticated`
   - `user_access_assignments_read_authenticated`
   - `permission_overrides_read_authenticated`

Todas usan `using (true)`.

2. Administracion total:
   - `permissions_admin_all`
   - `access_roles_admin_all`
   - `access_role_permissions_admin_all`
   - `user_access_assignments_admin_all`
   - `permission_overrides_admin_all`

Estas usan `public.is_app_admin()` como `using` y `with check`.

## Policies demasiado amplias

Las policies de lectura son demasiado amplias para tablas de asignaciones y excepciones:
- `user_access_assignments_read_authenticated using (true)`
- `permission_overrides_read_authenticated using (true)`
- `access_role_permissions_read_authenticated using (true)` puede ser aceptable para catalogo interno, pero conviene revisarlo.

Para `permissions` y `access_roles`, lectura autenticada puede ser razonable si se tratan como catalogos. Para asignaciones reales y overrides, no parece suficiente.

## Riesgo de vistas `UNRESTRICTED`

Si las vistas RBAC estan `UNRESTRICTED`, cualquier usuario con acceso a las vistas podria consultar datos combinados aunque las tablas tengan RLS.

Riesgos concretos:
- Un usuario autenticado podria ver quien es administrador global.
- Un usuario podria ver permisos efectivos de otras personas.
- Se podrian exponer emails, nombres, roles y alcances.
- Se podria mapear la estructura de seguridad interna.
- Se podria identificar quien tiene permisos altos para ataques dirigidos o errores operativos.

Ademas, la migracion no define `security_invoker = true` en las vistas. En Postgres/Supabase, esto debe revisarse con cuidado porque las vistas pueden no respetar RLS de la forma esperada si operan con privilegios del owner.

## Grants, security definer y security invoker

En la migracion revisada no aparecen:
- `grant`
- `revoke`
- `security definer`
- `security invoker`

Esto significa que los permisos efectivos dependen de defaults, ownership, API exposure y configuracion de Supabase. Para vistas RBAC sensibles, depender de defaults es riesgoso.

## Ajustes minimos recomendados en futuras migraciones

No modificar la migracion ya aplicada. Crear migraciones nuevas, pequenas y reversibles.

Recomendaciones:
- Crear una migracion para endurecer las vistas RBAC sensibles.
- Evaluar `security_invoker = true` para vistas que deban respetar RLS.
- Revocar acceso directo a vistas sensibles desde roles no administrativos si corresponde.
- Reemplazar lectura abierta `using (true)` en `user_access_assignments` por una policy que permita:
  - que admins vean todo;
  - que usuarios vean solo sus propias asignaciones;
  - que responsables con alcance superior vean solo lo que corresponda a su alcance, si se implementa esa logica.
- Reemplazar lectura abierta `using (true)` en `permission_overrides` por admin-only o self-only muy controlado.
- Revisar si `v_admin_access_users`, `v_global_access_users` y `v_person_effective_permissions` deben ser solo admin.
- Crear tests/manual checklist de seguridad antes de construir la pantalla de administracion.

## Que no se debe tocar directamente

Como la migracion ya esta aplicada en produccion:
- No editar `20260626100000_rbac_access_model.sql` para corregir produccion.
- No borrar tablas RBAC.
- No borrar vistas RBAC sin migracion planificada.
- No eliminar policies existentes manualmente desde el dashboard sin respaldo.
- No cambiar seeds historicos en la migracion aplicada.
- No construir una pantalla de administracion que consuma vistas sensibles antes de cerrar la decision de seguridad.

## Evaluacion general

El modelo conceptual es correcto y coincide con `docs/PERMISOS_RBAC.md`:

Persona -> Rol de acceso -> Alcance -> Permisos efectivos

El riesgo no esta en el modelo, sino en la exposicion:
- lectura autenticada demasiado amplia;
- vistas RBAC sensibles marcadas como `UNRESTRICTED`;
- ausencia de `security_invoker` o grants/revokes explicitos;
- vistas que exponen personas, emails, roles, permisos y administradores.

## Recomendacion final antes de construir la pantalla

Antes de crear la pantalla "Administracion de Accesos", conviene hacer una migracion de ajuste minima y especifica para seguridad.

Prioridad recomendada:
1. Restringir o proteger vistas sensibles.
2. Ajustar policies de lectura de `user_access_assignments` y `permission_overrides`.
3. Confirmar comportamiento de vistas con RLS en Supabase.
4. Definir que consultas usara la pantalla y que rol puede ejecutarlas.

Despues de eso, construir la pantalla usando solo endpoints o queries que respeten el alcance del usuario y evitando exponer datos RBAC completos a cualquier usuario autenticado.
