# Plan Maestro del MVP

## Objetivo

Construir una plataforma web llamada Red de Roles, Procesos, Areas y Responsables para mapear la operacion de McParking desde su estructura funcional.

El MVP no busca construir todavia un dashboard avanzado, grafo nodal, inteligencia artificial ni autenticacion. El primer objetivo es dejar bien armado el modelo base de datos, la documentacion y una pantalla inicial simple.

## Principio Central

Los procesos no deben depender de personas. Los procesos deben depender de roles. Las personas solo ocupan roles en un momento determinado.

La logica organizacional correcta es:

```text
Empresa -> Area -> Proceso -> Subproceso -> Rol responsable -> Persona asignada actualmente
```

Esto permite responder dos preguntas distintas:

1. Que rol necesita la empresa para operar bien.
2. Que persona ocupa actualmente ese rol.

## Entidades Principales

- `companies`: empresas o unidades del grupo.
- `countries`: paises donde opera o podria operar la empresa.
- `sites`: sedes o ubicaciones operativas.
- `areas`: areas funcionales como Revenue, Operaciones, Finanzas o Tecnologia.
- `processes`: procesos principales de la empresa.
- `subprocesses`: unidades operativas dentro de un proceso.
- `roles`: funciones estables dentro de la organizacion.
- `people`: personas reales.
- `person_roles`: asignacion actual o historica de personas a roles.
- `process_roles`: relacion entre procesos, subprocesos y roles.
- `systems`: herramientas o plataformas usadas por la operacion.
- `process_systems`: relacion entre procesos/subprocesos y sistemas.
- `risks`: riesgos asociados a procesos, roles o sistemas.
- `controls`: controles asociados a procesos y riesgos.
- `metrics`: metricas asociadas a procesos o subprocesos.

## Vistas Futuras

- Vista por proceso.
- Vista por rol.
- Vista por persona.
- Vista de brechas organizacionales.
- Vista de cuellos de botella por rol.
- Vista de cuellos de botella por persona.

## MVP Inicial

El MVP inicial debe permitir:

- Registrar la estructura empresa, area, proceso y subproceso.
- Definir roles funcionales.
- Registrar personas.
- Asignar personas a roles.
- Asociar procesos y subprocesos a roles.
- Asociar sistemas, riesgos, controles y metricas al modelo.
- Detectar en etapas posteriores roles sin backup, procesos sin dueno y personas sobrecargadas.

## Ejemplo Base

| Elemento | Valor |
| --- | --- |
| Empresa | McParking |
| Area | Revenue |
| Proceso | Revenue Management |
| Subproceso | Dashboard de Revenue |
| Rol dueno | Analista de Revenue |
| Persona actual del rol | Agustin |
| Rol usuario principal | Gerente General |
| Persona actual del rol | German |

## Fuera de Alcance Inicial

- Autenticacion.
- Grafo nodal.
- Dashboards complejos.
- Formularios CRUD completos.
- Calculos avanzados de cuellos de botella.
- Multiempresa avanzado.
