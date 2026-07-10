# 01 — Exploración Fase 1: motor de escaneo

**Fecha**: 2026-07-09 · **Cambio SDD**: `fase-1-audit-engine` · **Artefacto**: engram `sdd/fase-1-audit-engine/explore`

## Qué se hizo

Investigación técnica de los 8 puntos de decisión de la Fase 1 (`packages/audit-engine`: scan axe de página única → descubrimiento de páginas clave → CLI), leyendo SPEC.md y el scaffolding real, sin escribir código.

## Recomendaciones resultantes

| Punto                     | Recomendación                                                                   | Razón clave                                                                                               |
| ------------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Integración axe           | `@axe-core/playwright` (AxeBuilder)                                             | Soporte multi-frame/iframe cross-origin automático — el riesgo #1 del SPEC (motores de reserva en iframe) |
| Discovery de páginas      | Single-hop: home + heurística de keywords ES/EN/IT/FR, cap 5 páginas            | Simple para MVP; `room_detail` puede requerir two-hop → validar contra 3 webs reales antes de fijar       |
| Check de teclado          | Loop de Tab programático rastreando `activeElement`                             | Registra orden de foco, visibilidad de foco y keyboard traps del formulario de reserva                    |
| Detección iframe reservas | `page.frames()` + filtrado por hostname                                         | Extraer proveedor y reportarlo como hallazgo informativo, nunca como fallo del tool                       |
| CLI                       | Library-first: `runAudit()` exportado + `cli.ts` fino con `node:util parseArgs` | Cero dependencias de CLI; el motor es biblioteca, el CLI un consumidor más                                |
| Forma del JSON            | camelCase, agnóstico de DB                                                      | El mapeo a Supabase (scans/pages) es responsabilidad de `apps/api`, no del motor                          |
| Presupuesto <90s          | Secuencial, `domcontentloaded` + networkidle acotado, timeout por página        | Fallos parciales honestos (`pageError` por página) en vez de abortar el scan                              |
| Packaging npx             | Agregar `bin`, `files` y `exports` al package.json del motor                    | Necesario para `npx hotel-a11y-audit`                                                                     |

## Riesgos identificados

- Validación de Fase 1 depende de prueba manual contra 3 webs de hotel reales (no hay test runner).
- Iframes de reserva con sandbox/CSP pueden ser no-escaneables → se reportan como información de proveedor.
- `playwright install chromium` agrega peso real de setup para una tool distribuida por `npx` (documentar en el README del motor).
- El presupuesto de 90s es ajustado para 5 cargas de páginas reales.

## Fe de erratas

La exploración reportó que a `packages/audit-engine/package.json` le faltaba `"type": "module"` — verificado: **ya está presente**. Lo que falta de verdad es `bin`, `files` y `exports`.

## Siguiente paso

`sdd-propose`: formalizar intent, scope, approach y rollback del cambio.
