# 05 — Apply batch 1: infraestructura + scan axe de página única

**Fecha**: 2026-07-10 · **Cambio SDD**: `fase-1-audit-engine` · **Artefacto**: engram `sdd/fase-1-audit-engine/apply-progress` (#103)

## Qué se hizo

Implementación de las fases 1 y 2 del checklist (15/15 tareas): toda la infraestructura del motor y el pipeline completo de scan axe sobre una página, correspondiente al commit `feat(engine): single-page axe scan`.

- **Dependencias**: `playwright` + `@axe-core/playwright` (caret pin) en `packages/audit-engine`; Chromium instalado vía `npx playwright install chromium`.
- **Módulos creados** (`src/`): `types.ts`, `errors.ts`, `util.ts`, `browser.ts`, `axe.ts`, `iframe.ts`, `keyboard.ts`, `page-scan.ts`, `audit.ts`; `index.ts` pasó a façade que re-exporta `runAudit` + tipos.
- **Packaging**: `bin`, `files` y `exports` agregados al package.json del motor.

## Verificación del batch

| Gate                                    | Resultado                                             |
| --------------------------------------- | ----------------------------------------------------- |
| `tsc -p packages/audit-engine --noEmit` | ✅ limpio                                             |
| `npm run lint`                          | ✅ limpio                                             |
| Smoke test (`example.com`)              | ✅ JSON con 2 violaciones, 0 `pageError`              |
| Dominio inalcanzable                    | ✅ `HomeUnreachableError` fatal (no fallo silencioso) |

## Desvíos respecto al design (justificados)

1. **`room_list`** (valor spec-exacto) usado desde el inicio en `types.ts` — el erratum `rooms_list` del design no llegó al código.
2. **`engineStatus()` se mantuvo** en el façade además de `runAudit`: `apps/api/src/index.ts` lo importa y quitarlo rompía silenciosamente ese workspace. Se retirará cuando la API real de Fase 2 lo reemplace.
3. **Named import `{ AxeBuilder }`**: el default export de `@axe-core/playwright` no type-checkea bajo NodeNext + esModuleInterop (TS2351). Cero diferencia en runtime; documentado para contribuidores.

## Estado

- `runAudit` por ahora escanea solo la home (`discoveryNotes: []`) — el loop de discovery llega en el batch 2, según el corte por commits del SPEC.
- Batch revisado y aprobado por el usuario → commit `feat(engine): single-page axe scan`.

## Siguiente paso

Batch 2 de `sdd-apply`: fase 3 (discovery de páginas clave) y fase 4 (CLI), luego `sdd-verify` con los criterios de salida.
