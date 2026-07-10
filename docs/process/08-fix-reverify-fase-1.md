# 08 — Fix batch 3 + re-verify: PASS

**Fecha**: 2026-07-10 · **Cambio SDD**: `fase-1-audit-engine` · **Artefactos**: engram `apply-progress` (#103, batches 1+2+3), `verify-report` (#105, rondas 1+2)

## Qué se hizo

Corrección de los 5 hallazgos del verify (doc 07) con prueba empírica, y re-verificación formal enfocada.

| Hallazgo | Fix | Prueba |
|---|---|---|
| C1 — `:focus-visible` no detecta foco invisible | `keyboard.ts` ahora compara estilos computados (outline/box-shadow/border) entre estado enfocado y baseline | `npm run validate`: el campo `outline:none` reporta `invisibleFocusCount === 1` |
| W1 — iframe sin discriminador | Campo `kind: "third-party-booking-iframe"` en `ThirdPartyIframe` | Asserted en el harness |
| W2 — coexistencia axe + pageError | Se codificó la intención del design: coexisten cuando falla una etapa post-axe; `pageError` identifica la etapa. Spec enmendada (R5.3/R1.4) con nota de amendment | Escenario B del harness lo prueba en runtime |
| W3 — nota de discovery engañosa | Mapa `reassignedTo`: la nota dice "matched pero reasignada", que es la verdad | Asserted en el harness |
| W4 — cobertura adversarial no repetible | Nuevo `validation/run.mjs`: harness sin dependencias (node:http + node:assert) con fixtures de formulario trampa, foco invisible e iframe; `npm run validate` | Exit 0 con ambos escenarios verdes |

**El hallazgo técnico de oro** (memoria #106, para contribuidores y para el post): `:focus-visible` en Chromium refleja *modalidad de input* (si el foco vino por teclado), NO si el indicador se renderiza. Una heurística de accesibilidad que confíe en él aprueba exactamente el anti-patrón que debería cazar.

**Incidental**: `eslint.config.js` necesitó un override para `**/*.mjs` (primer archivo JS plano del repo).

## Re-verify (ronda 2)

**PASS** — 0 CRITICAL, 0 WARNING, 0 regresiones. Gates limpios (tsc, lint, build, validate, CLI, grep R7.2). Las 3 SUGGESTIONS de ronda 1 quedan informativas, sin acción.

## Estado del cambio

Todo verificado salvo la **fase 5 (criterios de salida: 3 webs de hotel reales, <90s)**, explícitamente diferida por decisión de usuario — item abierto que el archive debe registrar, no silenciar.

## Siguiente paso

Fase 5 (validación real contra hoteles) y luego `sdd-archive` para cerrar el ciclo.
