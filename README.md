# Red de Roles, Procesos, Areas y Responsables

MVP inicial para mapear la empresa desde procesos y roles funcionales antes que desde personas individuales.

## Stack

- Next.js App Router
- TypeScript
- Tailwind CSS
- Supabase
- Preparado para Vercel

## Principio central

Todo proceso, subproceso, sistema, metrica, control y riesgo debe asociarse primero a un rol funcional. La persona asignada representa unicamente quien ocupa actualmente ese rol.

## Estructura inicial

- `docs/PLAN_MAESTRO.md`: definicion del MVP y modelo organizacional.
- `supabase/migrations`: modelo relacional inicial.
- `supabase/seed.sql`: datos de ejemplo para McParking.
- `src/app`: pagina inicial simple.

## Desarrollo local

```bash
npm install
npm run dev
```
