# 07 — Verify Fase 1: FAIL con hallazgo crítico real

**Fecha**: 2026-07-10 · **Cambio SDD**: `fase-1-audit-engine` · **Artefacto**: engram `sdd/fase-1-audit-engine/verify-report` (#105)

## Qué se hizo

Verificación formal de la implementación contra los 28+ escenarios de la spec, el design (8 ADRs) y el checklist. El verificador detectó que `keyboard.ts` e `iframe.ts` no habían sido ejercitados en runtime (los smoke tests usaron sitios sin formulario de reserva ni iframes) y construyó **fixtures locales de Playwright** para cerrar ese gap: formulario con trap de teclado y campo `outline:none`, iframe cross-origin, página colgada (NAV_TIMEOUT real), página que nunca llega a networkidle. Fixtures eliminados tras la verificación.

## Veredicto

**FAIL** — 27/31 escenarios PASS, 1 FAIL (crítico), 2 PARTIAL, 1 DEFERRED (fase 5, decisión de usuario).

### CRITICAL — C1: visibilidad de foco (viola R3.2)

`readFocusSnapshot()` en `keyboard.ts` confía en `el.matches(':focus-visible')`, que en Chromium refleja **modalidad de input**, no si el indicador de foco se renderiza. Confirmado empíricamente: un `<input>` con `outline: none` sin alternativa reporta `focusVisible: true`. El check no detecta el anti-patrón de foco invisible más común de la web real — exactamente el caso que la spec exige marcar.

### WARNINGS

| #   | Hallazgo                                                                                   | Naturaleza                                           |
| --- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| W1  | `ThirdPartyIframe` sin campo `type`/`category` explícito (R4.2)                            | Gap spec↔design, no slip de código                   |
| W2  | `axe` y `pageError` pueden coexistir contra el "EITHER...OR" de la spec (R5.3/R1.4)        | Intención del design; desviación sin documentar      |
| W3  | `discoveryNotes` dice "no matched" cuando en realidad la URL fue reasignada de tipo (R2.3) | Mensaje factualmente incorrecto                      |
| W4  | Áreas 3/4 sin cobertura empírica previa al verify                                          | Gap de proceso (cerrado por los fixtures del verify) |

- 3 SUGGESTIONS menores (en el reporte completo en Engram).

## Lección del paso

El smoke testing contra sitios "que funcionan" valida el camino feliz; los escenarios adversariales (foco invisible, traps, timeouts) necesitan fixtures dedicados. Esto refuerza el argumento del SPEC §1: las herramientas automáticas detectan una fracción del problema — y hasta la herramienta misma necesita verificación adversarial.

## Siguiente paso

`sdd-apply` batch 3 (fix): corregir C1 (heurística de visibilidad real: outline/box-shadow/border computados, no `:focus-visible`) + warnings accionables, y re-verificar antes del archive.
