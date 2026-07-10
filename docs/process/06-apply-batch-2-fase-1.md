# 06 — Apply batch 2: discovery de páginas clave + CLI

**Fecha**: 2026-07-10 · **Cambio SDD**: `fase-1-audit-engine` · **Artefacto**: engram `sdd/fase-1-audit-engine/apply-progress` (#103, merged batch 1+2)

## Qué se hizo

Fases 3 y 4 del checklist (14/14 tareas): descubrimiento de páginas clave y CLI, cerrando los hitos `feat(engine): key-page discovery` y `feat(engine): cli`.

- **Discovery** (`keywords.ts` + `discovery.ts`, integrado en `audit.ts`): single-hop desde la home, filtro same-origin, scoring ponderado URL > texto > aria-label contra tabla de keywords ES/EN/IT/FR, dedup, cap 5 páginas, shortfalls en `discoveryNotes`, campo `source` como costura para two-hop futuro.
- **CLI** (`cli.ts`): consumidor fino con `node:util parseArgs` (cero deps nuevas de CLI), URL posicional, JSON a stdout, exit codes según spec, shebang que sobrevive al build. Verificado en Windows vía shim `.bin` de npm (`npm exec -w`).

## Hallazgos del batch (los importantes)

1. **Bug real detectado en smoke test**: el matching de keywords por substring producía falsos positivos — `facebookcontainer` matcheaba "book". Corregido con matching por word-boundary (regex). Lección: los smoke tests contra sitios reales encuentran lo que los ejemplos de laboratorio no.
2. **Violación de spec R7.2 heredada del batch 1**: el `DISCLAIMER` contenía "compliance certification"/"conformance" dentro de una frase negada; la spec exige cero apariciones de esos términos sin importar la polaridad (un scan literal no entiende negaciones). Reformulado en `types.ts` y `cli.ts` nació limpio.
3. **`@types/node` faltaba** como devDependency real del monorepo — una instalación global perdida lo enmascaraba. Agregado a la raíz.

## Verificación del batch

| Gate                                    | Resultado                                                             |
| --------------------------------------- | --------------------------------------------------------------------- |
| `tsc -p packages/audit-engine --noEmit` | ✅ limpio                                                             |
| `npm run lint`                          | ✅ limpio                                                             |
| Smoke discovery + CLI end-to-end        | ✅ contra mozilla.org / wikipedia.org / gnu.org (multi-página reales) |

**Limitación registrada**: las webs de hotel reales no fueron alcanzables desde el entorno del agente (red restringida). La validación de criterios de salida (fase 5: 3 webs de hotel, <90s) queda explícitamente pendiente y necesita red sin restricciones.

## Siguiente paso

Fase 5 del checklist (criterios de salida contra 3 webs de hotel reales) y luego `sdd-verify` contra las 28 escenarios de la spec.
