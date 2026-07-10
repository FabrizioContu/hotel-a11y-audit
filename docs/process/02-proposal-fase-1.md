# 02 — Proposal Fase 1: motor de escaneo

**Fecha**: 2026-07-09 · **Cambio SDD**: `fase-1-audit-engine` · **Artefacto**: engram `sdd/fase-1-audit-engine/proposal`

## Qué se hizo

Se formalizó la propuesta del cambio a partir de la exploración (doc 01): intent, scope dentro/fuera, approach técnico, dependencias, riesgos con mitigación, plan de rollback y plan de commits alineado con SPEC §5.

## Approach adoptado

`packages/audit-engine` entrega una biblioteca `runAudit(url, options)` con CLI fino encima (`node:util parseArgs`, cero dependencias de CLI):

1. **Scan axe de página única** — Playwright + `@axe-core/playwright` (AxeBuilder, soporte multi-frame automático).
2. **Discovery de páginas clave** — home + heurística de keywords ES/EN/IT/FR, cap 5 páginas tipadas (home, room_list, room_detail, booking_form, contact).
3. **Check custom de teclado** — tab-through programático del formulario de reserva (orden de foco, visibilidad, traps).
4. **Detección de iframes de reserva de terceros** — hallazgo informativo con hostname del proveedor, nunca fallo del tool.
5. **CLI** — `npx hotel-a11y-audit <url>` → JSON de 3-5 páginas en <90s (secuencial, timeout por página, fallos parciales honestos).

**Rollback**: cambio aditivo (código nuevo en un solo package sin consumidores todavía) → revertir los commits del engine, sin impacto en el resto del monorepo.

**Commits planificados** (SPEC §5): `feat(engine): single-page axe scan` → `feat(engine): key-page discovery` → `feat(engine): cli`.

## Decisiones abiertas resueltas con el usuario

| #   | Cuestión                                                                                                                        | Decisión                                                                                                                         |
| --- | ------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Discovery single-hop puede no encontrar `room_detail`/`booking_form` en webs reales                                             | Aceptado (default): single-hop en v1, two-hop pre-diseñado como follow-up                                                        |
| D2  | Sin test runner en Fase 1; validación manual contra 3 webs reales + script ligero opcional                                      | Aceptado (default): validación manual (que además es el upskilling WCAG del SPEC §8); Vitest se difiere hasta estabilizar la API |
| D3  | El criterio `npx audit <url>` se valida con bin local del workspace (`npm exec -w`), no contra el registry público hasta Fase 5 | Aceptado (default)                                                                                                               |

> Nota: aceptadas por el orquestador con los defaults recomendados (usuario AFK al momento de la consulta); revisables antes de `sdd-apply`.

## Siguiente paso

`sdd-spec` + `sdd-design` (pueden correr en paralelo sobre esta proposal).
