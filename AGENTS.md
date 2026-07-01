# AGENTS.md — Reglas para Codex en este proyecto

## Objetivo del proyecto

Este proyecto se llama “Red de Roles, Procesos, Áreas y Responsables”.

La plataforma debe mapear:
Empresa → País → Empresa/Filial → Sede → Área → Proceso → Subproceso → Rol funcional → Persona asignada.

Además, debe separar claramente:
- Roles funcionales de la empresa.
- Roles de acceso/permisos de la plataforma.

## Reglas generales

- Trabaja siempre en tareas pequeñas y acotadas.
- Antes de modificar archivos, explica brevemente qué vas a cambiar.
- No hagas refactors grandes sin autorización explícita.
- No instales dependencias sin autorización explícita.
- No modifiques package.json sin autorización explícita.
- No ejecutes builds largos salvo que el usuario lo pida.
- No ejecutes npm run dev.
- No leas ni modifiques node_modules, .next, .git, dist, build ni coverage.
- No cambies frontend si la tarea es solo de base de datos.
- No cambies base de datos si la tarea es solo de frontend.
- Prioriza claridad, simplicidad y trazabilidad.

## Carpetas pesadas o prohibidas

No revisar salvo que el usuario lo pida explícitamente:
- node_modules/
- .next/
- .git/
- dist/
- build/
- coverage/

## Flujo recomendado

Para cada tarea:
1. Confirmar entendimiento.
2. Indicar archivos que planeas tocar.
3. Hacer cambios mínimos.
4. Entregar resumen de archivos creados/modificados.
5. Indicar próximos pasos.

## Modelo conceptual

No confundir:

### Rol funcional
Función real dentro de la empresa.
Ejemplos:
- Analista de Revenue
- Gerente General
- Encargado de Finanzas
- Responsable de Tecnología
- Supervisor de Operaciones

### Rol de acceso
Permiso dentro de la plataforma.
Ejemplos:
- Administrador Global
- Administrador País
- Administrador Empresa
- Administrador Sede
- Usuario Operaciones
- Usuario Finanzas
- Usuario Revenue
- Solo Lectura

## Regla central de permisos

La lógica de acceso debe ser:

Persona
→ Rol de acceso
→ Alcance
→ Permisos efectivos

Alcances posibles:
- global
- country
- company
- site

No asignar permisos uno por uno a cada persona como regla principal.
Usar roles de acceso predefinidos.
Los permisos especiales deben ser excepciones.
