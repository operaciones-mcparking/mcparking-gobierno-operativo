# Modelo de roles de acceso y permisos

Este documento prepara el modelo de roles de acceso y permisos de la plataforma. Sera la base para una migracion SQL futura, pero en esta tarea no se implementa SQL ni se crean pantallas.

## 1. Diferencia entre rol funcional y rol de acceso

### Rol funcional

Un rol funcional representa una funcion real dentro de la empresa.

Ejemplos:
- Analista de Revenue
- Gerente General
- Encargado de Finanzas
- Responsable de Tecnologia
- Supervisor de Operaciones

Se usa para entender quien es responsable de procesos, subprocesos, controles, metricas, sistemas y riesgos.

### Rol de acceso

Un rol de acceso representa permisos dentro de la plataforma.

Ejemplos:
- Administrador Global
- Administrador Pais
- Administrador Empresa
- Administrador Sede
- Usuario Operaciones
- Usuario Finanzas
- Usuario Revenue
- Solo Lectura

Se usa para definir que puede ver o hacer una persona dentro del sistema.

## 2. Jerarquia de alcance

Los alcances iniciales son:

- global
- country
- company
- site

El permiso no solo define que puede hacer una persona, sino tambien donde puede hacerlo.

Por ejemplo, una persona puede tener permiso para ver revenue, pero ese permiso puede aplicar a toda la plataforma, a un pais, a una empresa o solo a una sede.

## 3. Logica principal

La logica principal debe ser:

Persona
-> Rol de acceso
-> Alcance
-> Permisos efectivos

Ejemplos:
- German -> Administrador Global -> global -> puede ver y administrar todo.
- Agustin -> Usuario Revenue -> country Chile -> puede ver revenue solo dentro de Chile.
- Cajero 1 -> Usuario Operaciones -> site McParking Santiago -> puede operar solo esa sede.

## 4. Roles de acceso iniciales

- Administrador Global
- Administrador Pais
- Administrador Empresa
- Administrador Sede
- Usuario Operaciones
- Usuario Finanzas
- Usuario Revenue
- Usuario Atencion Cliente
- Usuario Tecnologia
- Solo Lectura

## 5. Permisos iniciales sugeridos

- processes.view
- processes.create
- processes.update
- processes.delete
- roles.view
- roles.manage
- people.view
- people.manage
- tickets.view
- tickets.create
- tickets.update
- tickets.close
- finance.view
- finance.manage
- revenue.view
- revenue.manage
- systems.view
- systems.manage
- settings.manage

## 6. Tablas futuras sugeridas

- access_roles
- permissions
- access_role_permissions
- user_access_assignments
- permission_overrides

## 7. Regla principal de asignacion

No se deben asignar permisos uno por uno a cada persona como regla principal.

La regla principal debe ser:
- Persona recibe rol de acceso.
- Rol de acceso trae permisos.
- Asignacion tiene alcance.
- Permisos especiales son excepciones.

Los permisos especiales deben quedar reservados para casos justificados y auditables, no para reemplazar el uso normal de roles de acceso.

## 8. Base para implementacion futura

Esta documentacion sera la base para una migracion SQL futura.

En esta tarea no se debe implementar SQL.

## No implementar todavia

- No crear SQL.
- No crear pantallas.
- No tocar autenticacion.
- No tocar politicas RLS.
- No crear componentes.
- No crear formularios.
