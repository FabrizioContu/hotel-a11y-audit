---
description: Ejecuta la Fase 2 del SPEC — apps/api (Express + TS), two-hop discovery, Supabase, Docker/Railway. Playbook pre-cocinado, no re-decidir arquitectura.
---

# Playbook Fase 2 — API (Express + Supabase + Docker)

> **Cómo usar este playbook**: sos el ejecutor de un plan ya diseñado. Todas las decisiones de arquitectura están tomadas y justificadas. Tu trabajo es implementar, verificar cada gate y commitear. **Si el estado real del repo contradice algo escrito acá, PARÁ y preguntá al usuario — nunca improvises una decisión de diseño.**

## 0. Contexto y estado esperado del repo

Proyecto: auditor EAA para webs de hotel (leer `SPEC.md` §1-4 si necesitás contexto de producto). Monorepo npm workspaces: `apps/web`, `apps/api`, `packages/audit-engine`.

**Ya existe (Fase 0+1, cerradas y archivadas):**

- `packages/audit-engine` (package npm `hotel-a11y-audit`): motor completo. API pública en `src/index.ts`: `runAudit(url, options?): Promise<AuditResult>` + tipos re-exportados desde `src/types.ts` (`AuditResult`, `PageResult`, `PageType`, `AuditOptions`, `DiscoveryNote`, `ThirdPartyIframe`, etc.). Los tipos son camelCase y DB-agnósticos **a propósito**: el mapeo a snake_case ocurre en apps/api (este playbook).
- CLI: `npm exec -w hotel-a11y-audit -- hotel-a11y-audit <url> [--lang es|en|it|fr] [--out file] [--timeout ms]`.
- Harness de validación adversarial: `npm run validate -w hotel-a11y-audit`.
- Discovery **single-hop** en `src/discovery.ts` con seam documentado para two-hop (comentario "Two-hop discovery seam (D1)" y en `types.ts` el campo `PageResult.source` dice "additive 'hop2' value can be added later").
- `apps/api` es un stub: `package.json` con dependencia `"hotel-a11y-audit": "*"` y un `src/index.ts` que importa `engineStatus()` (placeholder a reemplazar).
- Trazabilidad: `docs/process/00-10` (Fase 1) y `docs/process/11-playbooks-fases-2-5.md` (este sistema de playbooks).

**Verificación inicial (antes de tocar nada):**

```bash
git log --oneline -5          # rama main limpia
npm run build                 # todos los workspaces compilan
npm run lint                  # limpio
npm run validate -w hotel-a11y-audit   # harness del motor en verde
```

Si algo falla acá, PARÁ y reportá al usuario.

**Branching (regla del repo)**: NUNCA trabajes directo en `main`. Cada batch de este playbook arranca con `git checkout -b <tipo>/<slug>` desde `main` (ej. `feat/fase-2-two-hop`, `feat/fase-2-scan-endpoints`); el commit del batch va en esa branch y el merge a `main` lo decide el usuario.

## 1. Objetivo y criterio de salida (SPEC §5 Fase 2, literal)

> Express + TS: endpoints /scan y /report, integración Supabase, rate limit, validación.
> ✅ Criterio: flujo completo por curl sin frontend.

Más el item heredado del archive de Fase 1: **two-hop discovery** (justificado con datos: 2/4 hoteles reales de BCN necesitan el segundo salto para llegar a 3+ páginas; ver `docs/process/09-exit-criteria-fase-1.md`).

## 2. Decisiones ya tomadas — NO re-decidir

| Decisión | Valor | Por qué |
|---|---|---|
| Framework | Express 5 + TypeScript (NodeNext, igual que el motor) | SPEC §4; cierra gap backend del autor |
| Validación | `zod` | SPEC §4 |
| Rate limit | `express-rate-limit`, por IP, solo en `POST /scan`: 5 req/hora | SPEC §3.7 (anónimo con rate limit por IP) |
| Persistencia | Supabase (`@supabase/supabase-js`), tablas `scans`/`pages`/`reports` | SPEC §4, esquema exacto abajo |
| Jobs | Runner in-process, concurrencia 1, sin colas | SPEC §4: "nada de colas complejas"; polling desde el front |
| CORS | Middleware `cors` con origen configurable por env (`WEB_ORIGIN`) | La Fase 4 lo necesita; agregarlo ahora evita tocar la API después |
| Tests | **Sin Vitest en esta fase.** Gates = tsc + lint + curl. Vitest se introduce en Fase 3 (donde nace lógica pura testeable: resumen de violaciones, score, glosario) | Decisión D2 de Fase 1 revisada: la API de `runAudit` ya es estable, pero la Fase 2 es I/O y orquestación — el curl end-to-end la cubre mejor que unit tests de plumbing |
| Docker | Imagen oficial `mcr.microsoft.com/playwright:v<VERSION>-jammy` donde `<VERSION>` = versión exacta de `playwright` instalada (mirala en `package-lock.json`, p.ej. `1.61.x`) | SPEC §9; Chromium + deps del sistema preinstalados. La versión de la imagen DEBE coincidir con la del package o Playwright falla en runtime |
| Deploy | Railway (notas al final; el deploy real lo dispara el usuario) | SPEC §9, ~5€/mes |
| Two-hop | Valor **aditivo** `'hop2'` en `PageResult.source`; segundo pase de discovery sobre las páginas descubiertas, mismo scoring y filtros | El seam ya está diseñado (design D1); no cambiar la forma del JSON existente |

**Fuera de alcance de esta fase** (SPEC §3 "Fuera" + límites propios): auth/cuentas, colas, pagos, monitorización programada, informe IA (Fase 3), frontend (Fase 4). Cualquier cosa no listada en el checklist → parar y preguntar.

## 3. Diseño pre-cocinado

### 3.1 Two-hop discovery (motor)

En `packages/audit-engine`:

1. `types.ts`: ampliar `PageResult.source` a `"home" | "discovered" | "hop2"`.
2. `discovery.ts`: la interfaz `DiscoveredPage.source` pasa a `"discovered" | "hop2"`. Extraer del cuerpo de `discoverPages` una función reutilizable que puntúe candidatos contra los `PageType` **faltantes** (misma tabla `KEYWORD_TABLE`, mismos pesos 3/2/1, mismo tie-break por profundidad de path y orden DOM).
3. `audit.ts` (leerlo primero para entender el loop): tras escanear las páginas hop-1, si quedan `PageType` sin encontrar Y quedan slots libres (`maxPages`), ejecutar discovery sobre cada página hop-1 **ya cargada** (reusar la `Page` de Playwright del scan si el flujo lo permite; si el scan cierra la página, re-navegar con los mismos timeouts). Dedup global contra URLs ya vistas. Las páginas hop-2 llevan `source: 'hop2'`.
4. `DiscoveryNote`: cuando un tipo se encuentra en hop-2, no genera nota (se encontró); las notas `not_found` solo si tampoco aparece en hop-2. Añadir al `detail` de las notas restantes que se buscó en dos niveles.
5. Presupuesto: el two-hop NO debe romper el criterio `<90s` de Fase 1. Límite duro: como máximo 3 páginas hop-1 se re-exploran, y el hop-2 no re-escanea nada que no entre en `maxPages`.

**Regla de oro**: el JSON de salida solo cambia de forma **aditiva** (`source: 'hop2'`). Nada existente se renombra.

### 3.2 Esquema Supabase (SQL de migración)

Crear `apps/api/supabase/migrations/0001_initial_schema.sql`:

```sql
-- hotel-a11y-audit — esquema inicial (SPEC §4)
create table scans (
  id          uuid primary key default gen_random_uuid(),
  url         text not null,
  status      text not null default 'pending'
              check (status in ('pending','running','done','error')),
  error       text,
  created_at  timestamptz not null default now()
);

create table pages (
  id          uuid primary key default gen_random_uuid(),
  scan_id     uuid not null references scans(id) on delete cascade,
  url         text not null,
  page_type   text not null
              check (page_type in ('home','room_list','room_detail','booking_form','contact')),
  source      text not null check (source in ('home','discovered','hop2')),
  axe_json    jsonb,          -- PageResult completo serializado (axe, keyboard, iframes, pageError)
  created_at  timestamptz not null default now()
);

create table reports (
  id            uuid primary key default gen_random_uuid(),
  scan_id       uuid not null references scans(id) on delete cascade,
  lang          text not null check (lang in ('es','en','it','fr')),
  executive_md  text,
  executive_json jsonb,       -- salida estructurada del modelo (Fase 3)
  score         integer check (score between 0 and 100),
  created_at    timestamptz not null default now(),
  unique (scan_id, lang)      -- caché por scan+idioma (SPEC §6)
);

create index pages_scan_id_idx on pages (scan_id);
create index reports_scan_id_idx on reports (scan_id);
create index scans_created_at_idx on scans (created_at desc);
```

Aplicarla con el SQL editor de Supabase o `supabase db push` si el CLI está configurado. La tabla `reports` queda lista para Fase 3 (acá no se escribe).

**RLS**: la API usa la **service role key** (server-side only, nunca al front), así que activar RLS en las 3 tablas sin policies públicas: `alter table scans enable row level security;` (ídem pages, reports). El front nunca habla con Supabase directo.

### 3.3 Contratos HTTP

```
POST /scan
  body: { "url": "https://hotel-ejemplo.com" }
  validación zod: string, URL http/https válida, max 2048 chars
  201 → { "scanId": "<uuid>", "status": "pending" }
  400 → { "error": "invalid_url", "message": "..." }
  429 → (express-rate-limit) { "error": "rate_limited", "message": "..." }

GET /report/:id            (id = scanId)
  200 (pending|running) → { "scanId", "url", "status", "createdAt" }
  200 (done)            → { "scanId", "url", "status": "done", "createdAt",
                            "result": {
                              "engineVersion", "scannedAt", "durationMs",
                              "pages": [PageResult...],       -- tal cual el motor, camelCase
                              "discoveryNotes": [...],
                              "disclaimer": "..." } }
  200 (error)           → { "scanId", "url", "status": "error", "error": "<mensaje>" }
  404                   → { "error": "not_found" }

GET /healthz → 200 { "ok": true }    (para Railway healthcheck)
```

El disclaimer del motor viaja SIEMPRE en la respuesta (SPEC §3.9, posicionamiento innegociable).

### 3.4 Estructura de archivos objetivo (`apps/api/src/`)

```
src/
  index.ts        # bootstrap: env, express, rutas, listen
  env.ts          # lectura y validación (zod) de process.env — falla al arrancar si falta algo
  routes/
    scan.ts       # POST /scan (zod + rate limit + encola job)
    report.ts     # GET /report/:id
  jobs/
    runner.ts     # cola in-process concurrencia 1: toma scan pending → runAudit → persiste
  store/
    supabase.ts   # cliente supabase-js (service role)
    scans.ts      # insertScan, setStatus, getScanWithPages, insertPages — único lugar con snake_case
  mapping.ts      # AuditResult (camelCase) ⇄ filas DB (snake_case)
```

Batch 1 usa un `store/memory.ts` (Map en memoria) detrás de la MISMA interfaz que `store/scans.ts` expondrá; batch 2 lo sustituye por Supabase sin tocar rutas ni runner. Definí la interfaz del store primero (`ScanStore` con `create`, `setRunning`, `saveResult`, `saveError`, `get`).

### 3.5 Variables de entorno (`apps/api/.env.example`, commitear)

```
PORT=3001
WEB_ORIGIN=http://localhost:3000
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>   # NUNCA commitear el valor real
RATE_LIMIT_MAX=5
RATE_LIMIT_WINDOW_MINUTES=60
```

`.env` ya está en `.gitignore`. Cargar con `dotenv` solo en dev (`import 'dotenv/config'`).

## 4. Checklist por batch/commit

### Batch 0 — two-hop discovery (motor)

- [ ] Leer `packages/audit-engine/src/{discovery.ts,audit.ts,types.ts,keywords.ts}` completos antes de editar.
- [ ] Implementar §3.1. Estilo: seguir los comentarios doc existentes del motor (referencian requisitos R*/design §*; mantené esa convención citando "two-hop (D1)").
- [ ] Gate: `tsc -p packages/audit-engine --noEmit` ✅ · `npm run lint` ✅ · `npm run validate -w hotel-a11y-audit` ✅
- [ ] Gate real: `npm run build -w hotel-a11y-audit && npm exec -w hotel-a11y-audit -- hotel-a11y-audit https://www.hotelcasafuster.com --out scans/casafuster-2hop.json` → debe encontrar **más de 2 páginas** (en Fase 1 encontró 2) y terminar <90s. Verificá que las nuevas traen `"source": "hop2"`. Repetir con `https://www.hotelbrummell.com` (encontró 1 en Fase 1).
- [ ] Si un hotel real cambió su web y el gate no es concluyente, probá con el otro y documentalo — no "ajustes" el motor para forzar el resultado.
- [ ] Commit: `feat(engine): two-hop discovery`

### Batch 1 — endpoints con store en memoria

- [ ] `npm install -w api express cors express-rate-limit zod && npm install -w api -D @types/express @types/cors dotenv` (versiones actuales, caret pin como el resto del repo).
- [ ] Implementar §3.3 + §3.4 con `store/memory.ts`. El runner llama a `runAudit` importado de `hotel-a11y-audit` (el workspace ya lo enlaza). Eliminar el uso de `engineStatus()` (era placeholder — el façade del motor lo marca como retirable cuando llegue la API real: es ahora).
- [ ] `apps/api/package.json`: scripts `build` (`tsc -p .`), `start` (`node dist/index.js`), `dev` (`tsc -p . --watch` + `node --watch dist/index.js`, o `tsx` si preferís una sola dep).
- [ ] Gate: `tsc -p apps/api --noEmit` ✅ · `npm run lint` ✅
- [ ] Gate curl (con la API levantada):
  ```bash
  curl -s -X POST localhost:3001/scan -H 'content-type: application/json' -d '{"url":"https://example.com"}'
  # → 201 {"scanId":"...","status":"pending"}
  curl -s localhost:3001/report/<scanId>          # polling hasta status done, con result.pages
  curl -s -X POST localhost:3001/scan -d '{"url":"nope"}' -H 'content-type: application/json'   # → 400
  # 6 POSTs seguidos → el 6º devuelve 429
  ```
- [ ] Commit: `feat(api): scan job endpoints`

### Batch 2 — persistencia Supabase

- [ ] Pedirle al usuario (si no están en `.env`) `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` — esto es un blocker legítimo para preguntar.
- [ ] Crear y aplicar la migración §3.2 (guardar el .sql en el repo aunque se aplique por dashboard).
- [ ] `npm install -w api @supabase/supabase-js`
- [ ] Implementar `store/scans.ts` + `mapping.ts` detrás de la interfaz `ScanStore`; retirar `store/memory.ts`. Un `PageResult` entero va a `pages.axe_json`; los campos de primer nivel (`url`, `page_type`, `source`) se duplican como columnas para poder consultar sin abrir el JSON.
- [ ] Gate: mismo flujo curl de batch 1 pero verificando en Supabase (dashboard o `select count(*) from pages`) que las filas existen y que reiniciar la API no pierde los scans (`GET /report/:id` de un scan viejo sigue respondiendo).
- [ ] Commit: `feat(api): supabase persistence`

### Batch 3 — Docker + Railway

- [ ] Leer la versión exacta de `playwright` en `package-lock.json` → usar `mcr.microsoft.com/playwright:v<ESA VERSIÓN>-jammy`.
- [ ] `apps/api/Dockerfile` (build context = raíz del monorepo, por los workspaces):
  ```dockerfile
  FROM mcr.microsoft.com/playwright:v<VERSION>-jammy
  WORKDIR /app
  COPY package.json package-lock.json tsconfig.base.json ./
  COPY packages/audit-engine/package.json packages/audit-engine/
  COPY apps/api/package.json apps/api/
  RUN npm ci --omit=dev=false
  COPY packages/audit-engine packages/audit-engine
  COPY apps/api apps/api
  RUN npm run build -w hotel-a11y-audit && npm run build -w api
  ENV NODE_ENV=production
  EXPOSE 3001
  CMD ["node", "apps/api/dist/index.js"]
  ```
  (La imagen ya trae Chromium: NO correr `npx playwright install`.)
- [ ] `.dockerignore` en la raíz: `node_modules`, `**/dist`, `.git`, `scans`, `.env*`, `apps/web`.
- [ ] Gate: `docker build -f apps/api/Dockerfile -t hotel-a11y-api .` y `docker run --env-file apps/api/.env -p 3001:3001 hotel-a11y-api` → repetir el flujo curl contra el contenedor (esto valida Chromium dentro de la imagen). Si el usuario no tiene Docker corriendo, pedile que lo arranque; no saltees este gate.
- [ ] `docs/deploy-railway.md` breve: crear proyecto Railway → deploy from repo con `apps/api/Dockerfile` → variables de entorno (§3.5) → healthcheck `/healthz`. **El deploy real lo ejecuta el usuario** (requiere su cuenta); dejalo documentado y ofrecé acompañarlo.
- [ ] Commit: `chore(api): dockerfile + railway deploy`

## 5. Cierre de fase (obligatorio)

1. Verificación final contra el criterio del SPEC: flujo completo por curl (POST → polling → JSON persistido) documentado con outputs reales.
2. Escribir `docs/process/12-fase-2-api.md` siguiendo el formato narrativo de los docs 05-08 (qué se hizo, gates, desvíos justificados, siguiente paso) y añadir la fila al índice de `docs/process/README.md`.
3. `mem_save` (engram): decisiones tomadas, desvíos del playbook, gotchas encontrados. `mem_session_summary` al terminar.
4. Reglas de commits: conventional commits, mensajes **en inglés**, **sin** Co-Authored-By ni atribución IA. No commitear con gates en rojo. Siempre en la branch de la tarea, nunca directo en `main`.

Siguiente fase: `/fase-3-informe-ia`.
