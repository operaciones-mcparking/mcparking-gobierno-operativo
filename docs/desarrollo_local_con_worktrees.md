# Desarrollo local con Git worktrees

## 1. Objetivo

Los Git worktrees permiten trabajar en dos tareas del mismo repositorio usando carpetas y ramas separadas. Esto ayuda a evitar mezclar cambios sin commit cuando una tarea queda pendiente y otra necesita avanzar en paralelo.

Cada worktree tiene su propio working tree, su propia rama activa y su propio estado de archivos modificados. Todos comparten el mismo repositorio Git subyacente.

## 2. Ejemplo actual del proyecto

Carpeta original:

```text
C:\Users\McParking\Documents\red de roles, procesos, áreas y responsables
```

Uso actual:

- cambio pendiente del drawer de WhatsApp en `/recuperacion`;
- archivo pendiente:

```text
src/app/recuperacion/recovery-cart-chat-drawer.tsx
```

Segundo worktree:

```text
C:\Users\McParking\Documents\red-roles-segunda-tarea
```

Rama:

```text
trabajo/segunda-tarea
```

Base inicial:

```text
96db4b7 Fix composite run recovery
```

Uso actual:

- ficha técnica segura de jobs en `/orquestador`.

La carpeta original y el segundo worktree deben tratarse como espacios de trabajo separados. No se debe corregir una tarea desde la carpeta equivocada.

## 3. Crear un worktree

Desde la carpeta original del repositorio:

```powershell
git worktree add -b trabajo/segunda-tarea "..\red-roles-segunda-tarea" HEAD
```

Luego entrar al nuevo worktree:

```powershell
cd "C:\Users\McParking\Documents\red-roles-segunda-tarea"
```

Validar estado, rama y base:

```powershell
git status --short
git branch --show-current
git rev-parse --short HEAD
```

Resultados esperados para este caso:

```text
git status --short: sin salida
git branch --show-current: trabajo/segunda-tarea
git rev-parse --short HEAD: 96db4b7
```

## 4. Dependencias

Cada worktree debe tener su propio `node_modules` para usar Next.js con Turbopack.

Comando recomendado en el worktree nuevo:

```powershell
npm.cmd ci
```

No se recomienda usar junctions ni symlinks de `node_modules`, porque Turbopack puede fallar con errores como:

```text
Symlink node_modules is invalid, it points out of the filesystem root
```

Precauciones:

- no usar `npm audit fix` automáticamente;
- `npm ci` no debería modificar `package.json` ni `package-lock.json`;
- revisar `git status --short` después de instalar dependencias.

## 5. Variables de entorno

Cada worktree necesita su propio `.env.local`.

Ejemplo para copiarlo desde la carpeta original al worktree actual:

```powershell
Copy-Item `
  "C:\Users\McParking\Documents\red de roles, procesos, áreas y responsables\.env.local" `
  ".\.env.local"
```

Precauciones:

- no abrir ni compartir el contenido de `.env.local`;
- debe permanecer ignorado por Git;
- verificar con `git status --short`;
- copiar `.env.local` no modifica Supabase ni aplica migraciones.

## 6. Puertos paralelos

Carpeta original:

```text
http://localhost:3000
```

Segundo worktree:

```text
http://localhost:3001
```

Comando recomendado para levantar el segundo worktree:

```powershell
npm.cmd run dev -- -p 3001
```

El puerto `3001` evita colisiones cuando dos instancias de Next.js corren en paralelo.

## 7. Validaciones antes de levantar la web

Antes de abrir la web local, ejecutar:

```powershell
npx.cmd tsc --noEmit
npm.cmd run lint
git diff --check
git status --short
git diff --stat
```

Nota: `git diff --stat` no incluye archivos untracked. Para ver archivos nuevos sin seguimiento, usar `git status --short`.

## 8. Flujo de revisión

Secuencia recomendada:

1. Crear worktree.
2. Verificar rama y estado.
3. Ejecutar `npm ci`.
4. Copiar `.env.local`.
5. Ejecutar `tsc` y `lint`.
6. Levantar en puerto alternativo.
7. Validar visualmente.
8. Revisar Network y consola.
9. Corregir problemas.
10. Revisar diff.
11. Hacer commit solo después de aprobación.
12. Integrar ramas más adelante mediante merge o cherry-pick revisado.

## 9. Precauciones

- No ejecutar `git restore`, `git reset`, `git clean` o `git stash` en la carpeta equivocada.
- Comprobar siempre la carpeta actual con `pwd` o `Get-Location`.
- Comprobar siempre la rama con `git branch --show-current`.
- No trabajar en la carpeta original desde la ventana asignada al segundo worktree.
- No hacer commit ni push antes de revisión.
- No copiar secretos en chats o logs.
- No ejecutar `npm audit fix` sin revisión.
- No borrar worktrees mientras tengan cambios sin commit.

## 10. Eliminar un worktree

Solo documentado, no ejecutar durante una tarea activa:

```powershell
git worktree list
git worktree remove "..\red-roles-segunda-tarea"
```

Esto solo debe hacerse después de integrar o descartar conscientemente todos los cambios del worktree.

## 11. Estado actual de validación de la ficha técnica

Estado documentado de la ficha técnica segura de jobs en `/orquestador`:

- `tsc`: OK.
- `lint`: OK.
- `git diff --check`: OK.
- `npm ci`: OK.
- Next.js levantó correctamente en puerto `3001`.
- `/orquestador` carga.
- El botón `Ver detalle` aparece.
- El modal abre.
- `GET /api/orquestador/jobs/[jobId]/detail` responde `500`.
- Pendiente: revisar body de respuesta y stack de Next.js.
- No inventar todavía la causa del error.

No se deben registrar tokens, claves, contenido de `.env.local`, payloads, emails, teléfonos ni datos sensibles durante esta revisión.
