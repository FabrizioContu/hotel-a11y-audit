# 04 — Tasks Fase 1: motor de escaneo

**Fecha**: 2026-07-10 · **Cambio SDD**: `fase-1-audit-engine` · **Artefacto**: engram `sdd/fase-1-audit-engine/tasks` (#102)

## Qué se hizo

Desglose del cambio en un checklist de **27 tareas** agrupadas en 5 fases, cada una con archivos afectados, referencia a spec/ADR y commit al que pertenece.

| Fase                                                                           | Tareas | Commit                               |
| ------------------------------------------------------------------------------ | ------ | ------------------------------------ |
| 1. Infraestructura (deps, chromium, packaging, types, errors, util)            | 6      | `feat(engine): single-page axe scan` |
| 2. Scan axe de página única (browser, axe, page-scan, keyboard, iframe, audit) | 9      | `feat(engine): single-page axe scan` |
| 3. Discovery de páginas clave (keywords, discovery, integración)               | 5      | `feat(engine): key-page discovery`   |
| 4. CLI (cli.ts, verificación bin/shebang en Windows)                           | 3      | `feat(engine): cli`                  |
| 5. Criterios de salida (validación manual 3 webs reales, <90s)                 | 4      | — (verificación)                     |

## Hallazgo del desglose

**Inconsistencia spec ↔ design detectada**: la spec fija el valor de enum `room_list` (R2.6) pero el design usa `rooms_list` en sus borradores de `types.ts`/`keywords.ts`. Reconciliación al valor de la spec registrada como tarea 3.1, bloqueante antes de codear los tipos. Detectarlo en planning evita un fallo seguro en `sdd-verify`.

## Riesgos hacia apply

- Las fases son secuenciales (cada commit depende del anterior); paralelismo solo dentro de la fase 1 y 2.
- La validación manual depende de que las 3 webs de hotel reales estén disponibles al momento del apply.
- Shebang + shim `.bin` de npm en Windows: verificar en concreto (tarea 4.2), no asumir.

## Estado del ciclo de planificación

`explore → propose → spec + design → tasks` **completo**. Lo que sigue es implementación (`sdd-apply`) por batches, empezando por la fase de infraestructura.
