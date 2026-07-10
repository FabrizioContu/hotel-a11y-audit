# 03 — Spec + Design Fase 1: motor de escaneo

**Fecha**: 2026-07-09 · **Cambio SDD**: `fase-1-audit-engine` · **Artefactos**: engram `sdd/fase-1-audit-engine/spec` (#100) y `sdd/fase-1-audit-engine/design` (#101)

## Qué se hizo

Se corrieron en paralelo las fases de especificación y diseño técnico sobre la proposal aprobada (doc 02).

## Spec (delta)

7 áreas de requisitos, **28 escenarios Given/When/Then** con keywords RFC 2119, todos verificables manualmente (decisión D2 — sin test runner):

| Área                                                                 | Escenarios |
| -------------------------------------------------------------------- | ---------- |
| Scan axe de página única (carga, timeout, fallo parcial)             | 4          |
| Discovery de páginas clave (same-origin, keywords 4 idiomas, cap 5)  | 6          |
| Tab-through de teclado del formulario de reserva                     | 4          |
| Detección de iframe de reservas de terceros                          | 3          |
| Contrato biblioteca + CLI (`runAudit`, args, JSON, exit codes, <90s) | 7          |
| Packaging (`bin`/`files`/`exports`)                                  | 2          |
| Posicionamiento ("diagnóstico inicial", nunca certificación)         | 2          |

## Design — decisiones clave (8 ADRs con alternativas rechazadas)

- **Library-first**: `runAudit()` en `audit.ts` es el producto; `cli.ts` es un consumidor fino con shebang. En Fase 2 la API importa la función directamente — sin subprocesos.
- **Layout `src/`**: `index.ts` (fachada), `audit.ts` (orquestador), `browser.ts`, `discovery.ts` + `keywords.ts` (datos puros, aislados del churn), `page-scan.ts` (frontera de fallo parcial), `axe.ts`, `keyboard.ts`, `iframe.ts`, `types.ts`, `errors.ts`, `util.ts`.
- **Tipos de axe re-exportados** (`Result` de axe-core), no redefinidos: cero drift con la versión pineada.
- **Modelo de error degrade-by-default**: solo el fallo de lanzamiento del browser y la home inalcanzable son FATALES; todo fallo por página se vuelve dato (`pageError`) y el scan continúa. Coherente con el posicionamiento honesto.
- **Secuencial** con un solo Chromium reutilizado; la concurrencia queda como palanca si la validación real muestra riesgo de presupuesto.
- **Discovery single-hop** con scoring ponderado URL > texto > aria contra tabla de keywords ES/EN/IT/FR; el campo `source` es la costura para el two-hop futuro sin rewrite (D1).
- **Teclado**: loop acotado a 60 Tabs, detección de traps por descriptores, visibilidad de foco vía proxy `:focus-visible` — señal etiquetada, no pass/fail.
- **Disclaimer estructural**: el campo `disclaimer` va dentro de `AuditResult` — el posicionamiento no depende de la documentación.

## Riesgos abiertos para apply/verify

- Preservación del shebang por `tsc` y el shim `.bin` de npm en Windows: verificar en concreto, no asumir.
- Peor caso teórico 5×timeout (~105s) supera los 90s — mitigado por degradación y cargas típicas; concurrencia en reserva.
- Sub-descubrimiento esperado de `room_detail`/`booking_form` en single-hop — se registra en `discoveryNotes`.

## Siguiente paso

`sdd-tasks`: desglose en checklist de implementación ordenada.
