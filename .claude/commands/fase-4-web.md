---
description: Ejecuta la Fase 4 del SPEC — apps/web (Next.js 16 + shadcn/ui + next-intl), informe en 2 capas, PDF por print CSS y pase AA manual. Playbook pre-cocinado, no re-decidir arquitectura.
---

# Playbook Fase 4 — Web (Next.js + shadcn/ui + pase AA)

> **Cómo usar este playbook**: sos el ejecutor de un plan ya diseñado. Implementá, verificá gates, commiteá. **Si el repo real contradice el playbook, PARÁ y preguntá.** Regla especial de esta fase: la web de un auditor de accesibilidad DEBE ser accesible — "sería ridículo que no lo fuera" (SPEC §5). Cada componente se verifica, no se asume.

## 0. Contexto y estado esperado del repo

Requiere Fases 2 y 3 completadas: API en `apps/api` con `POST /scan`, `GET /report/:id` (polling) y `GET /report/:id?lang=xx` (informe ejecutivo + score + capa técnica). `apps/web` es un stub (`package.json` mínimo con `"name": "web"`).

**Verificación inicial:**

```bash
git log --oneline -10        # commits de fase 2 y 3 presentes
npm run build && npm run lint
# API levantada y un scan+informe funcionando por curl
```

## 1. Objetivo y criterio de salida (SPEC §5 Fase 4, literal)

> Landing (con disclaimer), form, página de informe con las 2 capas, export PDF, i18n de UI.
> ✅ Criterio: Lighthouse a11y ≥ 95 **y además** pase manual completo de la propia web: navegación 100% por teclado + sesión con lector de pantalla NVDA. Documentar lo que axe NO detectó (contenido de oro para el post de LinkedIn).

## 2. Decisiones ya tomadas — NO re-decidir

| Decisión | Valor | Por qué |
|---|---|---|
| Framework | Next.js 16, App Router, TypeScript | SPEC §4 |
| UI | shadcn/ui (Tailwind + Radix) | SPEC §5: buena base a11y de Radix, pero NO exime del pase manual |
| i18n UI | `next-intl`, locales `es en it fr`, routing por prefijo (`/es/...`), `es` default | SPEC §4 |
| Export PDF | **Print CSS** (`@media print` + `window.print()`), NO react-pdf | Decisión pre-tomada: el informe ya es HTML semántico; cero dependencias nuevas; el "PDF" es imprimir a PDF desde el diálogo del navegador. Tradeoff aceptado: sin control fino de paginación — documentarlo. Si el usuario pide PDF server-side, es un cambio de alcance: preguntar |
| Comunicación con API | REST directo a `NEXT_PUBLIC_API_URL`; polling de `GET /report/:id` cada 3s con backoff suave, timeout de UI a los 3 min | SPEC §4 (asíncrono con polling) |
| Estado | Nada de librerías de estado; `useState` + fetch en client components donde haga falta. Server components por defecto | MVP; scope guard |
| Tema/paleta | Defaults de shadcn (neutral). Cualquier personalización de color se re-verifica contraste AA antes de commitear | SPEC §5 |
| Scaffolding | `create-next-app` NO se lleva bien con un dir no vacío: borrar el `apps/web/package.json` stub primero, scaffoldear, y re-verificar que `"name": "web"` y que el workspace sigue enlazando | El stub solo existía para reservar el workspace |
| Disclaimer | Visible en landing Y en cada informe: diagnóstico automático parcial (~30-40%) ≠ certificación EAA ≠ asesoramiento legal | SPEC §1/§3.9/§6 — innegociable |

**Fuera de alcance**: auth, cuentas, histórico de scans por usuario, comparación entre scans (la API lo permite pero la UI v1 no), SEO avanzado, analytics, deploy (documentar Vercel al final, lo ejecuta el usuario).

## 3. Diseño pre-cocinado

### 3.1 Rutas (App Router, bajo `app/[locale]/`)

```
/[locale]                      → landing: hero + form URL + cómo funciona + disclaimer
/[locale]/scan/[id]            → estados pending/running (polling) → redirige a informe al terminar
/[locale]/report/[id]          → informe 2 capas + botón "Descargar PDF" (print) + selector idioma
```

- Landing: form con un solo input URL (label visible, no placeholder-como-label), validación client + errores accesibles (`aria-describedby`), submit → `POST /scan` → redirect a `/scan/[id]`.
- `/scan/[id]`: client component con polling; estado anunciado con `aria-live="polite"` ("Escaneando la página de reservas…"); manejo de `status: error` con mensaje claro y opción de reintentar.
- `/report/[id]`:
  - **Capa 1 — hotelero**: score (visual + texto "índice de diagnóstico, no nota de cumplimiento"), resumen, hallazgos con prioridad (badge alta/media/baja — color + TEXTO, nunca solo color), siguiente paso. Viene de `GET /report/:id?lang={locale}`.
  - **Capa 2 — técnica**: `<details>`/accordion por página escaneada con las violaciones axe crudas (regla, impacto, nodos, helpUrl enlazado). En inglés tal cual axe (decisión de Fase 3).
  - Hallazgo de iframe de terceros con presencia visual destacada (es el hallazgo estrella del producto).
  - Disclaimer al pie, también en la versión impresa.

### 3.2 Print CSS (el "export PDF")

- `app/[locale]/report/[id]/print.css` con `@media print`: ocultar nav/botones/selector, expandir todos los `<details>`, tipografía serif legible, `page-break-inside: avoid` en cada hallazgo, header con URL del hotel + fecha + score, footer con disclaimer.
- Botón "Descargar PDF" = `window.print()`. Texto del botón honesto: "Guardar como PDF (imprimir)".

### 3.3 i18n

- `next-intl` con `messages/{es,en,it,fr}.json`. TODAS las cadenas de UI salen de ahí (gate: cero strings hardcodeados en JSX).
- El informe ejecutivo llega ya localizado desde la API (`?lang={locale}`); la UI solo traduce su propio chrome.
- `<html lang>` correcto por locale (es una de las reglas que el propio motor audita — no fallarla en casa).
- Selector de idioma accesible por teclado, en header y en página de informe (cambiar idioma en el informe re-pide el informe en ese idioma — la API lo cachea, es barato).

### 3.4 Accesibilidad de la propia web (requisitos de implementación, no de auditoría)

- Skip link "Saltar al contenido", landmarks (`header/main/footer/nav`), jerarquía h1-h2-h3 sin saltos.
- Foco visible SIEMPRE (no borrar el outline; personalizarlo si se quiere, nunca eliminarlo).
- El score no se comunica solo por color/gauge: texto numérico + interpretación.
- Imágenes decorativas con `alt=""`; informativas con alt real.
- Formularios: label asociado, errores con texto + `aria-invalid` + `aria-describedby`.
- Contraste AA verificado en cada par fg/bg que se toque (herramienta: DevTools o el propio axe).

## 4. Checklist por batch/commit

### Batch 1 — scaffolding + landing + flujo de scan

- [ ] Borrar `apps/web/package.json` (stub). `npx create-next-app@latest apps/web --typescript --tailwind --app --eslint --no-src-dir --import-alias "@/*"`. Restaurar `"name": "web"`, `"private": true`; quitar el lockfile que genere dentro de `apps/web` si aparece (el lock vive en la raíz); `npm install` desde la raíz para re-enlazar workspaces.
- [ ] Ajustar el eslint del monorepo si el flat config de la raíz choca con el generado (mantener UNA config raíz; extenderla para `apps/web` en vez de duplicar).
- [ ] `npx shadcn@latest init` en `apps/web` + componentes: `button input card badge accordion alert skeleton`.
- [ ] `npm install -w web next-intl`. Estructura `app/[locale]/` + middleware de next-intl + `messages/*.json` (los 4, aunque en este batch solo se rellene `es` y `en` — claves completas desde el inicio).
- [ ] Implementar landing + `/scan/[id]` según §3.1. `NEXT_PUBLIC_API_URL` en `.env.example` de `apps/web`.
- [ ] Gate: `npm run build -w web` ✅ · lint ✅ · flujo manual: pegar URL de `example.com` → ver polling → llegar a informe (aunque la página de informe sea placeholder todavía).
- [ ] Gate a11y incremental: tab-through completo de la landing con teclado (vos, el ejecutor, podés verificarlo con el propio motor: `npm exec -w hotel-a11y-audit -- hotel-a11y-audit http://localhost:3000/es` — comerse su propia comida).
- [ ] Commit: `feat(web): landing + scan flow`

### Batch 2 — página de informe (2 capas)

- [ ] Implementar `/report/[id]` completo según §3.1 (capa hotelero + capa técnica + iframe destacado + disclaimer).
- [ ] Rellenar `messages/{it,fr}.json` completos.
- [ ] Gate: build+lint ✅ · informe real de un hotel BCN renderizado en los 4 idiomas · capa técnica expande/colapsa con teclado · axe sobre la página de informe (motor propio o extensión) sin violaciones critical/serious.
- [ ] Commit: `feat(web): report view`

### Batch 3 — export PDF (print CSS)

- [ ] Implementar §3.2.
- [ ] Gate: imprimir a PDF desde Chrome y Firefox → el PDF contiene las 2 capas expandidas, header/footer, sin elementos de navegación, disclaimer presente. Adjuntar un PDF de ejemplo al doc de proceso (fuera del repo si pesa).
- [ ] Commit: `feat(web): pdf export`

### Batch 4 — pase AA manual (LO EJECUTA EL USUARIO; vos preparás y documentás)

Este batch es el entrenamiento WCAG práctico del autor (SPEC §8). Tu trabajo: preparar el guion, acompañar, y documentar hallazgos. NO lo marques como hecho sin que el usuario haya hecho la sesión.

- [ ] Gate automático primero: Lighthouse a11y ≥ 95 en landing y en informe (`npx lighthouse http://localhost:3000/es --only-categories=accessibility --chrome-flags="--headless"` — y sobre `/report/[id]` con un id real). Si <95, arreglar antes del pase manual.
- [ ] Preparar `docs/a11y-manual-pass.md` con el guion:
  1. **Teclado (sin ratón, literal)**: recorrer landing → form → submit → polling → informe → expandir capa técnica → cambiar idioma → imprimir. Verificar: orden de foco lógico, foco siempre visible, sin trampas, skip link funciona, Escape cierra lo que abre.
  2. **NVDA** (gratuito, Windows — el usuario lo instala de nvaccess.org): mismo recorrido con la pantalla apagada mentalmente. Verificar: título de página anunciado, landmarks navegables (D del explorador de NVDA), el form se entiende solo con audio, el estado del polling se anuncia (aria-live), el score se entiende sin verlo, la tabla/lista de hallazgos es navegable.
  3. Columna "¿axe lo habría detectado?" por cada hallazgo → ese material es el contenido del post de LinkedIn ("lo que las herramientas automáticas no ven").
- [ ] Sesión con el usuario. Arreglar lo que salga. Documentar hallazgos + fixes en el doc.
- [ ] Commit: `a11y: AA pass on own UI (manual)`

## 5. Cierre de fase (obligatorio)

1. Criterio del SPEC verificado: Lighthouse ≥95 (adjuntar scores) + pase manual documentado con hallazgos.
2. `docs/process/14-fase-4-web.md` + fila en el índice del README de process.
3. Documentar deploy: `docs/deploy-vercel.md` breve (proyecto Vercel apuntando a `apps/web`, root directory, `NEXT_PUBLIC_API_URL` a la URL de Railway). El deploy lo ejecuta el usuario.
4. `mem_save` de decisiones/gotchas (especialmente los hallazgos que axe no detectó) + `mem_session_summary`.
5. Conventional commits, sin atribución IA, gates en verde.

Siguiente fase: `/fase-5-lanzamiento`.
