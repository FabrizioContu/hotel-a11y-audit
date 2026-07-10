# 11 — Playbooks pre-cocinados para las Fases 2-5

**Fecha**: 2026-07-10 · **Artefactos**: `.claude/commands/fase-{2-api,3-informe-ia,4-web,5-lanzamiento}.md`

## Qué se hizo

Se crearon cuatro playbooks ejecutables, uno por fase pendiente del SPEC (§5), como slash commands de Claude Code commiteados al repo. La idea: aprovechar un modelo de alta capacidad (Fable 5) AHORA para tomar todas las decisiones de arquitectura, contratos, esquemas, prompts y comandos — de forma que en un segundo momento un modelo menos capaz pueda ejecutar cada fase sin decidir nada de diseño.

## Decisiones

1. **Formato slash command** (`.claude/commands/`) en vez de docs sueltos: invocables directamente (`/fase-2-api`) en una sesión futura, y versionados en git igual que un doc.
2. **Playbook pre-cocinado en vez de orquestar SDD**: el trabajo de propose/spec/design/tasks de cada fase está horneado dentro del playbook. El ejecutor solo hace el equivalente a apply + verify contra gates ya definidos. Se pierde el ciclo SDD formal por fase; se gana que las decisiones las tomó el modelo capaz. La capa narrativa (`docs/process/`) y engram se mantienen como registro.
3. **Autocontenidos**: cada playbook lleva su contexto, contratos TS reales del motor (leídos de `src/types.ts`, no inventados), SQL, prompts completos, glosario WCAG en 4 idiomas, comandos exactos y gates con salida esperada. Un modelo débil no debe ir a buscar contexto a otro lado.
4. **Guardrails para el ejecutor**: "si el repo contradice el playbook, pará y preguntá"; checkpoints explícitos para toda acción pública/irreversible (publicar repo, npm publish, post); scope guard contra todo lo no listado.

## Asignación de los items abiertos del archive de Fase 1

| Item abierto (doc 10) | Dónde quedó |
|---|---|
| Two-hop discovery (justificado con datos 2/4) | Fase 2, batch 0, commit propio |
| Práctica manual WCAG del autor (SPEC §8) | Fase 4 batch 4 (pase NVDA) y Fase 5 batch 3 (5 violaciones a mano) |
| Protagonismo del iframe de terceros en informes | Fase 3: regla innegociable del system prompt + término de glosario |
| Vitest diferido (D2) | Fase 3: entra solo para lógica pura (summarize, score); Fase 2 mantiene gates tsc/lint/curl |

## Detalles técnicos pre-decididos destacables

- **Fase 2**: store con interfaz `ScanStore` (batch 1 en memoria → batch 2 Supabase, mismo contrato); RLS activado sin policies (la API usa service role); Dockerfile sobre la imagen oficial de Playwright pineada a la versión exacta del package-lock.
- **Fase 3**: `claude-opus-4-8` con `messages.parse()` + `output_config.format` (zod) — sin prefill (400 en modelos actuales), sin sampling params (removidos), prompt caching en el system+reglas; score determinístico en TS con fórmula fija (el modelo no puntúa); glosario WCAG fijo ES/EN/IT/FR embebido.
- **Fase 4**: export PDF por print CSS (no react-pdf); pase AA manual como batch propio que ejecuta el usuario con guion preparado.
- **Fase 5**: `git subtree split` para publicar solo el motor conservando su historia; npm publish 0.1.0; escaneo BCN secuencial con pausas (no scraper agresivo); esqueletos de post/caso de estudio — el texto final es del usuario.

## Siguiente

Invocar `/fase-2-api` en una sesión nueva (con el modelo que se prefiera) para arrancar la Fase 2.
