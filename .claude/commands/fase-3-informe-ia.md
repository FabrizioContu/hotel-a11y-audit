---
description: Ejecuta la Fase 3 del SPEC — informe ejecutivo con la API de Claude, score 0-100, glosario WCAG e i18n ES/EN/IT/FR. Playbook pre-cocinado, no re-decidir arquitectura.
---

# Playbook Fase 3 — Informe con IA (Claude + i18n)

> **Cómo usar este playbook**: sos el ejecutor de un plan ya diseñado. Todas las decisiones (modelo, parámetros de la API de Claude, prompt, glosario, score) están tomadas. Implementá, verificá gates, commiteá. **Si el repo real contradice el playbook, PARÁ y preguntá.** No cambies modelo ni parámetros de la API de Claude por tu cuenta.

## 0. Contexto y estado esperado del repo

Requiere Fase 2 completada: `apps/api` con `POST /scan`, `GET /report/:id`, persistencia Supabase (tablas `scans`, `pages`, `reports` — `reports` existe pero está vacía), runner in-process, Docker. Motor con two-hop discovery.

**Verificación inicial:**

```bash
git log --oneline -8    # deben verse los commits de Fase 2 (feat(api): supabase persistence, etc.)
npm run build && npm run lint
# API levantada + un scan de prueba end-to-end por curl (ver playbook fase 2 §4 batch 1)
```

Dato de producto clave (validado con datos en `docs/process/09-exit-criteria-fase-1.md`): **0 de 4 hoteles reales tenían el motor de reservas en su propio dominio.** El hallazgo de iframe de terceros es CENTRAL al informe, no un edge case (SPEC §6 fila 1).

**Branching (regla del repo)**: NUNCA trabajes directo en `main`. Cada batch arranca con `git checkout -b <tipo>/<slug>` desde `main` (ej. `feat/fase-3-executive-summary`, `feat/fase-3-i18n`); el merge a `main` lo decide el usuario.

## 1. Objetivo y criterio de salida (SPEC §5 Fase 3, literal)

> Integración Claude: resumen ejecutivo + generación en 4 idiomas + glosario. Guardar en `reports`.
> ✅ Criterio: mismo scan produce informe coherente en los 4 idiomas.

## 2. Decisiones ya tomadas — NO re-decidir

| Decisión | Valor | Por qué |
|---|---|---|
| SDK | `@anthropic-ai/sdk` (TypeScript, en `apps/api`) | SDK oficial; nada de fetch a mano |
| Modelo | `claude-opus-4-8` (string exacto, sin sufijos de fecha) | Modelo por defecto recomendado; calidad de redacción multilingüe. Pricing $5/$25 por MTok → un informe (~3-6K in / ~1K out) cuesta ~3-5 céntimos: dentro del presupuesto del SPEC §6. Si el usuario quiere abaratar, ÉL decide bajar a `claude-sonnet-5` — no lo hagas por tu cuenta |
| Salida estructurada | `client.messages.parse()` con `output_config.format` + `zodOutputFormat` | Garantiza JSON válido contra schema. **PROHIBIDO** el prefill de assistant (devuelve 400 en modelos actuales) |
| Thinking | Omitir el parámetro `thinking` (defaults del modelo) | Tarea de redacción estructurada, no razonamiento profundo |
| `max_tokens` | 4096 | Informe de máx 5 hallazgos; sin streaming (respuesta corta) |
| Sampling | NO enviar `temperature`/`top_p`/`top_k` | Removidos en el modelo actual — devuelven 400 |
| Prompt caching | `cache_control: {type: "ephemeral"}` en el bloque de system (prompt + glosario, estables); el JSON de violaciones va en el turno user, después | El system+glosario es idéntico entre los 4 idiomas y entre scans → ~90% de descuento en los 3 idiomas siguientes |
| Errores | Cadena tipada del SDK: `RateLimitError` → retry con backoff (el SDK ya reintenta 2x solo); `APIStatusError` → informe no disponible, scan intacto. Chequear `stop_reason === "refusal"` antes de leer content | Un fallo del informe NUNCA rompe el scan |
| Caché de informes | Tabla `reports`, unique `(scan_id, lang)`: si existe, devolver sin llamar a Claude | SPEC §6 (coste) |
| Input al modelo | Solo violaciones `critical` y `serious`, agrupadas por regla (SPEC §6 fila 2), + iframes de terceros + señales de teclado + `discoveryNotes` | Falsos positivos de axe fuera del resumen ejecutivo |
| Score | Determinístico en TypeScript (NO lo calcula el modelo), fórmula exacta en §3.3 | Reproducible, explicable, gratis |
| Idiomas | 1 llamada por idioma bajo demanda (no 4 de golpe) | Informe solo bajo demanda (SPEC §6); el caching del prompt abarata las repeticiones |
| Tests | Introducir **Vitest** en `apps/api` SOLO para lógica pura: `summarize.ts`, `score.ts`, glosario | Cierre del item abierto D2 de Fase 1: acá nace la primera lógica pura que lo amerita |

**Fuera de alcance**: PDF (Fase 4), UI (Fase 4), traducir la salida cruda de axe (la capa técnica queda en inglés tal cual la emite axe), streaming, más idiomas.

## 3. Diseño pre-cocinado

### 3.1 Estructura (`apps/api/src/report/`)

```
report/
  summarize.ts    # AuditResult → ReportInput (agrupa violaciones por regla, filtra impactos, extrae iframes/teclado/notas)
  score.ts        # AuditResult → 0-100 (fórmula §3.3)
  glossary.ts     # glosario WCAG fijo por idioma (§3.5)
  prompt.ts       # system prompt (§3.4) + construcción del turno user
  claude.ts       # cliente Anthropic + messages.parse + manejo de errores/refusal
  schema.ts       # zod schema del informe (§3.6)
  index.ts        # generateReport(scanId, lang): caché reports → o genera+persiste
```

Endpoint (en `routes/report.ts`): `GET /report/:id?lang=es` — si `lang` está presente y el scan está `done`, la respuesta incluye además `report: { lang, score, executive }` (generado o cacheado). Sin `lang`, comportamiento de Fase 2 intacto. Validar `lang` con zod (`es|en|it|fr`).

`ANTHROPIC_API_KEY` va a `.env` / `.env.example` (placeholder). Recordarle al usuario poner límite de gasto mensual en la consola de Anthropic (SPEC §9, p.ej. 10€).

### 3.2 `ReportInput` (lo que ve el modelo)

```ts
interface ReportInput {
  hotelUrl: string;
  pagesScanned: { url: string; pageType: PageType }[];
  violationsByRule: {           // solo impact critical|serious, orden: critical primero, luego por totalNodes desc
    ruleId: string;             // ej. "color-contrast"
    impact: "critical" | "serious";
    help: string;               // texto help de axe (inglés, el modelo lo traduce al redactar)
    helpUrl: string;
    totalNodes: number;
    pages: string[];            // pageTypes afectados
  }[];
  thirdPartyIframes: { hostname: string; provider: string | null; pages: string[] }[];
  keyboardSignals: { pageType: string; focusTrap: boolean; focusLossCount: number; invisibleFocusCount: number; note?: string }[];
  coverageNotes: string[];      // discoveryNotes en frase corta (honestidad de cobertura)
  score: number;
}
```

Cap defensivo: máximo 25 reglas en `violationsByRule` (las de más nodos); si se trunca, añadir `coverageNotes` avisándolo.

### 3.3 Score — "índice de diagnóstico" (fórmula exacta)

```
pesos: critical = 12, serious = 6, moderate = 2.5, minor = 1
penalización = Σ (peso(impact) × nº de nodos afectados de esa violación)   // sobre TODAS las páginas
densidad     = penalización / nº de páginas escaneadas
score        = clamp(round(100 − densidad), 0, 100)
```

Reglas: páginas con `pageError` de navegación/axe no cuentan en el denominador. Documentar en el código y en la respuesta de la API que es un **índice de diagnóstico**, NUNCA "nota de cumplimiento" (SPEC §3.7). Tests Vitest: caso sin violaciones = 100, caso denso = 0, pesos correctos, denominador excluye páginas fallidas.

### 3.4 System prompt (usar tal cual; es el contrato editorial del producto)

```
Eres un consultor de accesibilidad web que escribe para dueños y gestores de
hoteles SIN conocimientos técnicos. Recibirás un JSON con los resultados de un
diagnóstico automático de accesibilidad (EAA / WCAG 2.1 AA) del sitio web de
un hotel.

Reglas innegociables:
- Escribe TODO el informe en el idioma indicado en <lang>.
- Usa EXACTAMENTE la terminología del glosario proporcionado para los términos
  técnicos WCAG. No inventes traducciones alternativas.
- Máximo 5 hallazgos, ordenados por impacto en las reservas y riesgo legal.
- Cada hallazgo explica el problema en términos de negocio: qué huésped se ve
  afectado, qué reserva se pierde, qué riesgo EAA implica. Sin jerga técnica,
  sin IDs de reglas, sin siglas sin explicar.
- Si el JSON incluye iframes de reserva de terceros, ese hallazgo va SIEMPRE
  incluido y redactado así: el motor de reservas es de un proveedor externo
  ([provider/hostname]); el EAA también aplica al hotel como prestador del
  servicio; debe pedirle a su proveedor la declaración de conformidad. Es
  información valiosa, no un fallo de su web.
- Si hay señales de teclado (focus trap, foco invisible, pérdida de foco),
  tradúcelas a su consecuencia: "un huésped que navega con teclado no puede
  completar la reserva".
- Tono claro y constructivo, sin alarmismo y sin promesas. NUNCA afirmes que
  el sitio "cumple" o "no cumple" la ley: esto es un diagnóstico automático
  parcial (~30-40% de los problemas detectables).
- prioridad: "alta" | "media" | "baja" según impacto en reserva + severidad.
- siguiente_paso: una única acción concreta y realista para un hotelero
  (p. ej. "envía este informe a la agencia que mantiene tu web").
- Usa las coverageNotes para ser honesto sobre lo que NO se pudo revisar.
```

Turno `user` (después del breakpoint de caché): `<lang>es</lang>\n<glossary>{...glosario del idioma}</glossary>\n<scan_results>{ReportInput JSON}</scan_results>`.

> Nota de orden para el caching: system prompt fijo → breakpoint `cache_control` → todo lo variable (idioma, glosario, JSON) en el turno user. No meter fechas ni IDs en el system.

### 3.5 Glosario WCAG fijo (embebido en `glossary.ts`)

| clave | es | en | it | fr |
|---|---|---|---|---|
| contrast | contraste de color | colour contrast | contrasto cromatico | contraste des couleurs |
| alt_text | texto alternativo de las imágenes | image alternative text | testo alternativo delle immagini | texte alternatif des images |
| form_label | etiqueta de campo de formulario | form field label | etichetta del campo modulo | étiquette de champ de formulaire |
| keyboard_nav | navegación por teclado | keyboard navigation | navigazione da tastiera | navigation au clavier |
| focus_visible | indicador visible de foco | visible focus indicator | indicatore di focus visibile | indicateur de focus visible |
| focus_trap | trampa de foco | keyboard trap | trappola per la tastiera | piège au clavier |
| screen_reader | lector de pantalla | screen reader | lettore di schermo | lecteur d'écran |
| accessible_name | nombre accesible (botones y enlaces) | accessible name (buttons and links) | nome accessibile (pulsanti e link) | nom accessible (boutons et liens) |
| doc_language | idioma declarado de la página | declared page language | lingua dichiarata della pagina | langue déclarée de la page |
| booking_engine | motor de reservas | booking engine | motore di prenotazione | moteur de réservation |
| third_party_iframe | módulo de reservas de un proveedor externo | third-party booking module | modulo di prenotazione di un fornitore esterno | module de réservation d'un prestataire externe |
| eaa | Ley Europea de Accesibilidad (EAA) | European Accessibility Act (EAA) | Legge Europea sull'Accessibilità (EAA) | Loi européenne sur l'accessibilité (EAA) |
| conformity_declaration | declaración de conformidad | declaration of conformity | dichiarazione di conformità | déclaration de conformité |
| initial_diagnostic | diagnóstico inicial automatizado | initial automated diagnostic | diagnosi iniziale automatizzata | diagnostic initial automatisé |

(Es la base mínima; si el modelo necesita un término que no está, se añade al glosario en las 4 columnas — nunca se traduce ad-hoc.)

### 3.6 Schema de salida (zod, `schema.ts`)

```ts
const Finding = z.object({
  titulo: z.string(),
  por_que_importa: z.string(),          // 2-4 frases, lenguaje hotelero
  prioridad: z.enum(["alta", "media", "baja"]),
  paginas: z.array(z.string()),          // pageTypes afectados
});
export const ExecutiveReport = z.object({
  resumen: z.string(),                   // 3-5 frases
  hallazgos: z.array(Finding).max(5),
  siguiente_paso: z.string(),
});
```

Llamada (forma exacta):

```ts
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
const response = await client.messages.parse({
  model: "claude-opus-4-8",
  max_tokens: 4096,
  system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
  messages: [{ role: "user", content: userTurn }],
  output_config: { format: zodOutputFormat(ExecutiveReport) },
});
if (response.stop_reason === "refusal") { /* informe no disponible; no romper el scan */ }
const report = response.parsed_output;   // null si falló el parse → tratar como error recuperable
```

Persistencia en `reports`: `executive_json` (objeto), `executive_md` (render markdown simple del objeto: resumen + lista de hallazgos + siguiente paso — lo genera una función TS, no el modelo), `score`, `lang`.

## 4. Checklist por batch/commit

### Batch 1 — resumen ejecutivo (ES primero)

- [ ] `npm install -w api @anthropic-ai/sdk` y `npm install -w api -D vitest`
- [ ] Implementar `summarize.ts`, `score.ts`, `schema.ts`, `prompt.ts`, `claude.ts`, `index.ts` según §3. Tests Vitest para `summarize` (agrupación, filtro critical/serious, cap 25) y `score` (§3.3). Script `test` en `apps/api/package.json`: `vitest run`.
- [ ] Extender `GET /report/:id?lang=es` según §3.1 (solo `es` en este batch si querés acotar, pero el código ya debe ser genérico por idioma).
- [ ] Gate: `tsc --noEmit` ✅ · lint ✅ · `npm test -w api` ✅
- [ ] Gate real: scan de un hotel real de BCN (p.ej. `grandhotelcentral.com`, 27 violaciones en Fase 1) → `GET /report/:id?lang=es` devuelve informe con ≤5 hallazgos, el hallazgo de iframe presente si el scan detectó iframes, score coherente, y segunda llamada al mismo endpoint NO llama a Claude (verificar por logs/latencia: es caché de `reports`).
- [ ] Verificar en la respuesta de Claude `usage.cache_read_input_tokens > 0` a partir de la segunda generación (si es 0 siempre, hay un invalidador en el prompt — revisá que el system sea byte-idéntico entre llamadas).
- [ ] Commit: `feat(report): executive summary via claude`

### Batch 2 — i18n ES/EN/IT/FR

- [ ] Completar/verificar `glossary.ts` con la tabla §3.5 completa.
- [ ] Gate del criterio del SPEC — script `apps/api/scripts/verify-i18n.mjs` (dejarlo en el repo):
  1. Toma un `scanId` done por argumento.
  2. Pide el informe en los 4 idiomas.
  3. Verifica: mismo nº de hallazgos (±1), mismas prioridades en el mismo orden, mismo score, el término del glosario correspondiente aparece cuando la regla correspondiente está en el input (p.ej. si hay violación `color-contrast`, el informe ES contiene "contraste de color", el FR "contraste des couleurs", etc.), y los 4 mencionan el iframe si aplica.
  4. Imprime tabla resumen PASS/FAIL por idioma.
- [ ] Gate: script en PASS con un scan real. Guardar los 4 informes de ejemplo en `scans/` (gitignored) y pegar la tabla en el doc de proceso.
- [ ] Coste: sumar `usage` de las 4 llamadas y anotar el coste real por informe en el doc de proceso (validar la estimación de céntimos del SPEC).
- [ ] Commit: `feat(report): i18n es/en/it/fr`

## 5. Cierre de fase (obligatorio)

1. Criterio del SPEC verificado: mismo scan → informe coherente en 4 idiomas (tabla del script).
2. `docs/process/13-fase-3-informe-ia.md` (formato narrativo de siempre) + fila en el índice del README de process. Incluir: coste real medido por informe, ejemplo de hallazgo de iframe redactado, y cualquier desvío.
3. `mem_save` de decisiones/gotchas + `mem_session_summary`.
4. Conventional commits, mensajes en inglés, sin atribución IA, gates en verde antes de cada commit. Siempre en la branch de la tarea, nunca directo en `main`.

Siguiente fase: `/fase-4-web`.
