# SPEC — Auditor EAA para webs de hotel

> Especificación SDD (Specification-Driven Development) · v1.0
> Autor: Fabrizio Contu · Objetivo: empleabilidad + open source + lead-gen freelance

---

## 1. Problema y posicionamiento

**Problema:** el European Accessibility Act (EAA) está en vigor desde el 28/06/2025 y obliga a que las webs de hotel con reserva o pago online cumplan WCAG 2.1 AA (estándar EN 301 549). La aplicación ya es real (primeras demandas en Francia, vigilancia de mercado activa en varios estados), pero la mayoría de hoteles pequeños y medianos no sabe si cumple, ni entiende los informes técnicos de accesibilidad.

**Solución:** una herramienta que escanea el recorrido de reserva de una web hotelera y genera un informe **en lenguaje de hotelero** (no de developer), en **ES/EN/IT/FR**, priorizando los fallos por impacto en las reservas y en el riesgo legal.

**Posicionamiento honesto (innegociable):** el escaneo automático detecta ~30-40% de los problemas WCAG. El producto se presenta SIEMPRE como **"diagnóstico inicial"**, nunca como certificación de cumplimiento. El disclaimer aparece en la web y en cada informe. La auditoría manual completa es el servicio humano (freelance) que la herramienta puede generar como lead — a ofrecer solo cuando la práctica manual esté consolidada (ver sección 8: upskilling integrado).

**Doble entregable estratégico:**

- **Motor open source** (repositorio público GitHub): el escáner CLI. Nombre propuesto: `hotel-a11y-audit`.
- **Capa web propia** (cerrada): la app que usa el motor y genera el informe bonito multilingüe con IA.

---

## 2. Usuarios y casos de uso

| Usuario                          | Caso de uso                                                                                 |
| -------------------------------- | ------------------------------------------------------------------------------------------- |
| Hotelero / gestor de alojamiento | Introduce la URL de su web → recibe informe comprensible con fallos priorizados             |
| Fabrizio (uso propio)            | Escanea 15-20 webs de hoteles de BCN → datos agregados para post LinkedIn + caso de estudio |
| Developer del sector (comunidad) | Usa el motor CLI open source en sus propios proyectos / contribuye                          |

---

## 3. Alcance del MVP

### Dentro (v1)

1. **Input:** una URL de web de hotel.
2. **Escaneo automático** de hasta 5 páginas clave: home, listado/búsqueda de habitaciones, ficha de habitación, formulario/motor de reserva (primer paso), página de contacto. Descubrimiento simple: home + heurística de enlaces (keywords "book", "reserva", "rooms", "habitaciones", "contact"...).
3. **Checks WCAG 2.1 AA** vía axe-core sobre navegador real (Playwright/Chromium): contraste, alt text, labels de formulario, orden de foco, navegación por teclado básica (tab-through programático del formulario de reserva), idioma del documento, nombres accesibles de botones/enlaces.
4. **Informe en 2 capas:**
   - **Resumen ejecutivo para hotelero** (generado con API de Claude): 3-5 hallazgos principales, explicados en términos de negocio ("un huésped que navega con teclado no puede completar la reserva → reserva perdida + riesgo EAA"), con prioridad Alta/Media/Baja.
   - **Detalle técnico** (salida cruda de axe-core formateada): para el developer que lo arregle.
5. **Multilingüe:** informe disponible en ES, EN, IT, FR (generación/traducción vía Claude con glosario WCAG fijo para consistencia terminológica).
6. **Persistencia:** informes guardados en Supabase (URL, fecha, resultados JSON, puntuación). Permite re-escanear y comparar.
7. **Puntuación simple:** 0-100 basada en densidad de violaciones ponderada por severidad axe (critical/serious/moderate/minor). NO llamarla "nota de cumplimiento" — llamarla "índice de diagnóstico".
8. **Export:** informe descargable en PDF.
9. **Disclaimer legal** visible: diagnóstico automático parcial ≠ certificación EAA.

### Fuera (explícitamente, v1)

- Escaneo de flujos con login o pago real (solo primer paso del motor de reservas).
- Monitorización periódica programada (v2 si hay tracción).
- Cuentas de usuario / auth (v1 es anónimo con rate limit por IP).
- Remediación automática (nunca: posicionamiento honesto).
- Cobros/pagos.
- Soporte a SPAs complejas con render exótico (best effort con Playwright; documentar limitación).

---

## 4. Arquitectura

```
┌─────────────────────────────────────────────────────┐
│  apps/web  (Next.js 16, App Router, shadcn/ui)       │
│  - Landing + form URL                                 │
│  - Página de informe (resumen hotelero + detalle)     │
│  - i18n UI: next-intl (ES/EN/IT/FR)                   │
│  - Export PDF (react-pdf o print CSS)                 │
└──────────────┬──────────────────────────────────────┘
               │ REST
┌──────────────▼──────────────────────────────────────┐
│  apps/api  (Node.js + Express + TypeScript)           │  ← cierra gap backend
│  - POST /scan  { url }  → job                         │
│  - GET  /report/:id                                   │
│  - Orquesta: motor de escaneo + Claude + Supabase     │
│  - Rate limiting (express-rate-limit), validación zod │
└──────┬───────────────┬───────────────┬───────────────┘
       │               │               │
┌──────▼──────┐ ┌──────▼──────┐ ┌──────▼──────────┐
│ packages/    │ │ Claude API  │ │ Supabase        │
│ audit-engine │ │ (informe    │ │ (Postgres:      │
│ (OPEN SOURCE)│ │ hotelero +  │ │ scans, reports) │
│ Playwright + │ │ i18n)       │ │                 │
│ axe-core     │ └─────────────┘ └─────────────────┘
│ CLI propio   │
└──────────────┘
```

- **Monorepo** (npm workspaces, sin Turborepo en v1): `apps/web`, `apps/api`, `packages/audit-engine`.
- `packages/audit-engine` se publica como repo/paquete independiente open source con su propio README bilingüe (EN/ES), licencia MIT y CLI: `npx hotel-a11y-audit https://hotel-ejemplo.com`.
- El escaneo es asíncrono: la API crea un job, el front hace polling del estado (suficiente para MVP; nada de colas complejas).

### Modelo de datos (Supabase)

```sql
scans:    id, url, status (pending|running|done|error), created_at
pages:    id, scan_id, url, page_type, axe_json
reports:  id, scan_id, lang, executive_md, score, created_at
```

### Prompt del informe (esbozo)

- Sistema: "Eres un consultor de accesibilidad que escribe para dueños de hoteles sin conocimientos técnicos. Prioriza impacto en reservas y riesgo EAA. Tono claro, sin alarmismo, sin jerga. Máx 5 hallazgos."
- Input: JSON resumido de violaciones (agrupadas por regla, con conteos y páginas afectadas).
- Output estructurado (JSON): { resumen, hallazgos: [{titulo, por_que_importa, prioridad, paginas}], siguiente_paso }.
- Glosario fijo de términos WCAG por idioma para consistencia (evitar traducciones distintas del mismo término entre informes).

---

## 5. Fases de implementación (commit por fase)

**Fase 0 — Scaffolding (1 día completo)**
Monorepo con **npm workspaces a secas** (sin Turborepo en v1: una herramienta nueva por proyecto es suficiente; Turborepo se añade en v2 si el build lo pide). Presupuestado 1 día porque es tu primera vez con workspaces: crea el monorepo mínimo (root package.json con "workspaces", 3 carpetas, un import cruzado funcionando) ANTES de escribir lógica. TypeScript, ESLint/Prettier. Commit: `chore: scaffold monorepo (npm workspaces)`.

**Fase 1 — Motor de escaneo (semana 1)**
`packages/audit-engine`: Playwright + axe-core sobre una URL única → JSON de violaciones. Luego descubrimiento de páginas clave (heurística de enlaces). Test con 3 webs de hotel reales. CLI básico.
Commits: `feat(engine): single-page axe scan` → `feat(engine): key-page discovery` → `feat(engine): cli`.
✅ Criterio de salida: `npx audit <url>` devuelve JSON de 3-5 páginas en <90s.

**Fase 2 — API (semana 2)**
Express + TS: endpoints /scan y /report, integración Supabase, rate limit, validación.
Commits: `feat(api): scan job endpoints` → `feat(api): supabase persistence`.
✅ Criterio: flujo completo por curl sin frontend.

**Fase 3 — Informe con IA (semana 2-3)**
Integración Claude: resumen ejecutivo + generación en 4 idiomas + glosario. Guardar en `reports`.
Commits: `feat(report): executive summary via claude` → `feat(report): i18n es/en/it/fr`.
✅ Criterio: mismo scan produce informe coherente en los 4 idiomas.

**Fase 4 — Web (semana 3-4)**
Next.js 16 + **shadcn/ui** (Tailwind + primitivas Radix): landing (con disclaimer), form, página de informe con las 2 capas, export PDF, i18n de UI. Nota a11y: los componentes shadcn parten de Radix, con buena base de accesibilidad (foco, ARIA, teclado) — buen punto de partida, pero NO exime del pase manual: verificar cada componente en su contexto real, y personalizar los colores del theme respetando contraste AA (los defaults de shadcn son razonables, pero cualquier cambio de paleta se re-verifica). La web en sí debe ser WCAG AA (¡obvio pero crítico: sería ridículo que no lo fuera! — y es argumento de venta: "esta web que te audita es accesible").
Commits: `feat(web): landing + scan flow` → `feat(web): report view` → `feat(web): pdf export` → `a11y: AA pass on own UI (manual)`.
✅ Criterio: Lighthouse a11y ≥ 95 **y además** pase manual completo de la propia web: navegación 100% por teclado + sesión con lector de pantalla NVDA (gratuito, Windows). Este pase manual ES tu entrenamiento WCAG práctico (ver sección 8) — documenta lo que encuentres que axe NO detectó: ese hallazgo es contenido de oro para el post de LinkedIn ("lo que las herramientas automáticas no ven").

**Fase 5 — Open source + lanzamiento (semana 4-5)**
README bilingüe del motor con GIF de demo, licencia MIT, publicación del repo. Escaneo de 15-20 hoteles BCN → datos agregados → post LinkedIn + caso de estudio en fabriziocontu.dev. Informes-regalo a 2-3 contactos hoteleros.
Commits: `docs(engine): readme + examples` → `chore: MIT license`.

---

## 6. Riesgos y mitigaciones

| Riesgo                                                                 | Mitigación                                                                                                                                                                                                                                                      |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Webs de hotel con motores de reserva en iframe de terceros (muy común) | Detectar iframe y reportarlo como hallazgo específico: "tu motor de reservas es de [proveedor]; el EAA también te aplica a ti como servicio — pregúntale a tu proveedor por su conformidad". Es información valiosísima para el hotelero, no un fallo del tool. |
| Falsos positivos de axe-core                                           | Mostrar severidad y enlazar a la regla oficial; el resumen IA solo usa violaciones critical/serious.                                                                                                                                                            |
| Coste API Claude                                                       | Informe solo bajo demanda + caché por scan+idioma. Estimación: céntimos por informe.                                                                                                                                                                            |
| Scope creep                                                            | Todo lo que no esté en la sección 3 "Dentro" requiere terminar v1 primero.                                                                                                                                                                                      |
| Aspecto legal (¿asesoramiento?)                                        | Disclaimer: información general, no asesoramiento legal. Nunca prometer "cumplimiento".                                                                                                                                                                         |

---

## 7. Métricas de éxito (evaluar a los 3 meses del lanzamiento)

- **Empleabilidad (principal):** proyecto mencionado en ≥5 candidaturas; ≥1 conversación de entrevista originada por el post/repo.
- **Comunidad:** ≥25 estrellas GitHub o ≥1 contribución externa.
- **Ingresos (opcional):** ≥1 solicitud de auditoría manual/remediación.
- Si ninguna métrica se mueve: el proyecto queda como caso de portfolio y se congela sin culpa.

---

## 8. Upskilling WCAG integrado (decisión post-elicitación)

**Situación honesta:** la práctica WCAG actual es sobre todo automática (Lighthouse/axe). El servicio freelance de "auditoría manual" NO se ofrece hasta consolidar la práctica manual. Mientras tanto, el lenguaje correcto en web/informes/candidaturas es "diagnóstico automatizado + revisión guiada", no "auditoría manual experta".

**Plan de entrenamiento incrustado en el proyecto (sin tiempo extra separado):**

1. **Fase 1:** al validar el motor contra 3 webs reales, verificar a mano 5 violaciones reportadas por axe (¿son reales? ¿cómo se reproducen con teclado?). Aprende leyendo las reglas oficiales que enlaza cada hallazgo.
2. **Fase 4:** el pase AA de la propia web se hace manual: teclado completo + NVDA (lector de pantalla gratuito para Windows). Primera experiencia real con tecnología asistiva.
3. **Post-lanzamiento:** de los 15-20 hoteles escaneados para el post, elegir 2 y hacerles mini-revisión manual del formulario de reserva (30 min cada una). Con eso ya hay práctica manual demostrable y honesta.

**Resultado:** al final del proyecto, la línea del CV pasa de "Accesibilidad WCAG" a "Accesibilidad WCAG: auditoría automatizada (axe/Lighthouse) y testing manual con teclado y lector de pantalla (NVDA)" — verificable y defendible en entrevista.

---

## 9. Despliegue (decisión post-elicitación: presupuesto ~5€/mes OK)

- **apps/web (Next.js 16):** Vercel (soporte de primera para Next 16) o Netlify, plan gratuito (ya conocido de fabriziocontu.dev).
- **apps/api (Express + Playwright):** **Railway** (o Fly.io) con **Docker**, usando la imagen oficial `mcr.microsoft.com/playwright:v<version>-jammy` que trae Chromium y dependencias del sistema preinstaladas. Coste estimado: 5€/mes. Añadir a Fase 2 un commit `chore(api): dockerfile + railway deploy`.
- **Supabase:** plan gratuito (suficiente para MVP).
- **Claude API:** pago por uso; con caché por scan+idioma, céntimos por informe. Poner límite de gasto mensual en la consola de Anthropic (p. ej. 10€) como red de seguridad.
- **Ventaja curricular colateral:** Dockerfile + deploy en Railway = otra pieza de backend/DevOps real para el CV, la misma familia de skills que pedía la oferta de GNA (composer, tooling) y que piden los fullstack.
