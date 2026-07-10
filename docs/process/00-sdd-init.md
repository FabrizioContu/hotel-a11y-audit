# 00 — Inicialización SDD

**Fecha**: 2026-07-09 · **Fase SPEC**: post-Fase 0 (scaffold ya commiteado en `1624a01`)

## Qué se hizo

Se inicializó el contexto de Spec-Driven Development del proyecto: detección de stack, capacidades de testing y convenciones, con persistencia en memoria (modo engram — sin archivos SDD en el repo).

## Detectado

- **Stack**: monorepo npm workspaces (`apps/*`, `packages/*`), TypeScript 5.7 ESM, ESLint 9 (flat config + typescript-eslint), Prettier 3.4. Sin Turborepo (decisión deliberada del SPEC para v1).
- **Workspaces**: `packages/audit-engine` (motor open source, stub), `apps/api` (Express, futuro), `apps/web` (placeholder Next.js 16, Fase 4).
- **Testing**: sin test runner en ningún workspace → Strict TDD no disponible por ahora. Ojo: el Playwright que llega en Fase 1 es la herramienta de escaneo del motor, NO un framework de testing.
- **Calidad**: lint (`npm run lint`), type check (`tsc -p <workspace> --noEmit`), format (`npm run format`).

## Decisiones

| Decisión                | Elección                                         | Por qué                                                                            |
| ----------------------- | ------------------------------------------------ | ---------------------------------------------------------------------------------- |
| Store de artefactos SDD | engram                                           | Dev solo, iteración rápida; el SPEC ya está versionado en git                      |
| Modo de ejecución SDD   | Interactive                                      | Revisión humana entre fase y fase                                                  |
| Strict TDD              | Desactivado                                      | No hay test runner; se reevalúa cuando se agregue (Vitest es el candidato natural) |
| Registry de skills      | `.atl/skill-registry.md` (gitignoreado) + engram | Reglas compactas pre-digeridas para sub-agentes                                    |

## Siguiente paso

Arrancar el cambio `fase-1-audit-engine` (SPEC §5 Fase 1) con una exploración técnica.
