---
description: Ejecuta la Fase 5 del SPEC — README bilingüe del motor, licencia MIT, publicación open source, escaneo de 15-20 hoteles BCN, datos agregados y material de lanzamiento. Playbook pre-cocinado.
---

# Playbook Fase 5 — Open source + lanzamiento

> **Cómo usar este playbook**: sos el ejecutor de un plan ya diseñado. Esta fase mezcla trabajo técnico (tuyo) con acciones públicas e irreversibles (del usuario: publicar repo, publicar en npm, postear en LinkedIn). **Regla dura: NADA se publica hacia afuera sin confirmación explícita del usuario en ese momento.** Preparás todo hasta dejar la acción a un click de distancia.

## 0. Contexto y estado esperado del repo

Requiere Fases 2-4 completadas (motor con two-hop, API con informes IA, web desplegable). El monorepo es privado; el entregable open source es SOLO `packages/audit-engine` (SPEC §1: "motor open source" público, "capa web propia" cerrada).

**Verificación inicial:**

```bash
git log --oneline -12
npm run build && npm run lint && npm run validate -w hotel-a11y-audit
npm exec -w hotel-a11y-audit -- hotel-a11y-audit https://example.com   # smoke
```

Item abierto heredado (SPEC §8 / archive Fase 1): la **práctica manual WCAG** del autor — verificar a mano 5 violaciones reportadas por axe en los JSON de hoteles reales. Es PRERREQUISITO del post (da credibilidad y contenido). Está en el checklist, batch 3.

## 1. Objetivo (SPEC §5 Fase 5)

> README bilingüe del motor con GIF de demo, licencia MIT, publicación del repo. Escaneo de 15-20 hoteles BCN → datos agregados → post LinkedIn + caso de estudio en fabriziocontu.dev. Informes-regalo a 2-3 contactos hoteleros.

Métricas de éxito a 3 meses en SPEC §7 (no son gates de esta fase, pero el material debe apuntarlas).

## 2. Decisiones ya tomadas — NO re-decidir

| Decisión | Valor | Por qué |
|---|---|---|
| Qué se publica | Repo público nuevo `hotel-a11y-audit` SOLO con el contenido de `packages/audit-engine` (+ LICENSE, README propio, CI mínima). El monorepo NO se publica | SPEC §1: doble entregable. La API/web contienen prompts y decisiones de producto que son la capa cerrada |
| Cómo se extrae | `git subtree split --prefix=packages/audit-engine -b engine-public` → push de esa rama al repo público nuevo. Conserva la historia de commits del motor (portfolio: se ve el proceso) | Mejor que copiar archivos: la historia de commits ES parte del valor curricular |
| Licencia | MIT, copyright "Fabrizio Contu" | SPEC §5 |
| npm | Publicar `hotel-a11y-audit@0.1.0` (`npm publish --access public`) para que `npx hotel-a11y-audit <url>` funcione tal cual promete el SPEC §4. Subir `ENGINE_VERSION` en `types.ts` a `0.1.0` en el mismo cambio | El README y el post prometen `npx`; sin npm publish es mentira |
| GIF de demo | Grabar con [`vhs`](https://github.com/charmbracelet/vhs) (script `.tape` versionado en el repo público → GIF reproducible). Instalación Windows: `scoop install vhs` o binario de releases. Fallback si vhs no funciona en el entorno: grabación de pantalla + conversión, pero el `.tape` queda escrito igual | GIF reproducible > GIF artesanal; el tape documenta la demo |
| README | Bilingüe EN primero + ES después EN EL MISMO archivo (ancla `#español`), como pide el SPEC §4. Ver esqueleto §3.2 | Audiencia comunidad dev (EN) + mercado local (ES) |
| Hoteles BCN | Lista de 15-20 la aporta EL USUARIO (preguntar al empezar el batch 2; sugerí completar con búsqueda de hoteles medianos BCN si le faltan). Escaneo secuencial con el CLI, 1 a la vez, timeout default | Escaneo masivo paralelo = comportamiento de scraper agresivo; secuencial y espaciado es lo correcto |
| Datos agregados | Script `scripts/aggregate-scans.mjs` en el monorepo (NO en el repo público): lee `scans/*.json` → tabla: % hoteles con iframe de terceros, top 5 reglas violadas, media de violaciones critical/serious, % con 3+ páginas descubiertas, duración media | Es el insumo del post y del caso de estudio |
| Post LinkedIn / caso de estudio | Vos preparás ESQUELETO con los datos reales; el texto final y la voz son del usuario. Idioma: ES (mercado local) con versión EN opcional | La voz personal no se delega |
| Informes-regalo | 2-3 contactos que elige el usuario; se generan con la web (Fase 4) y se envían en PDF. Lenguaje: "diagnóstico automatizado + revisión guiada", NUNCA "auditoría experta" | SPEC §8: honestidad sobre la práctica manual |

**Fuera de alcance**: monetización, landing de venta, monitorización, contribuciones externas (se aceptan, no se buscan activamente todavía), traducir el README a IT/FR.

## 3. Diseño pre-cocinado

### 3.1 Preparación del paquete para publicación

En `packages/audit-engine` (dentro del monorepo, ANTES del split):

- `package.json`: `"version": "0.1.0"`, `description`, `keywords` (`accessibility, a11y, wcag, eaa, hotel, axe-core, playwright, audit`), `repository`, `homepage`, `bugs`, `author: "Fabrizio Contu"`, `license: "MIT"`, `engines: { "node": ">=20" }`. Verificar que `files: ["dist"]` + `bin` siguen bien.
- `LICENSE` (MIT) dentro del package.
- `.github/workflows/ci.yml` mínima para el repo público: `npm ci && npm run build && npm run lint` (el harness `validate` navega webs reales — NO meterlo en CI pública; documentarlo como script de mantenimiento).
- `CONTRIBUTING.md` corto: cómo buildear, cómo correr `validate`, convención de commits, y la nota del named import `{ AxeBuilder }` (gotcha documentado en Fase 1 para contribuidores).
- Gate previo a publicar: `npm pack -w hotel-a11y-audit --dry-run` → revisar que SOLO va `dist` + package.json + README + LICENSE.

### 3.2 Esqueleto del README bilingüe (rellenar, no reinventar)

```markdown
# hotel-a11y-audit
> Automated EAA/WCAG 2.1 AA accessibility diagnostic for hotel booking flows.
[GIF demo]
⚠️ Disclaimer: initial automated diagnostic (~30-40% of WCAG issues). NOT a
compliance certification or legal advice.   ← arriba del fold, innegociable

EN: Why (EAA in force since 2025-06-28) · Install/Use (npx hotel-a11y-audit <url>,
flags --lang --out --timeout) · What it checks (axe + keyboard tab-through +
third-party booking iframe detection + key-page discovery en/es/it/fr) · Output
(JSON schema resumido con ejemplo real recortado) · Limitations (honestas: SPAs
exóticas, ~30-40%, no login/pago) · Library usage (runAudit + tipos) · License MIT

---
## Español  (#español)
Mismas secciones, mismo orden.
```

### 3.3 Esqueleto del post LinkedIn (rellenar con datos reales del batch 2)

1. Gancho: dato agregado más fuerte (candidato conocido: "0 de N hoteles gestionan las reservas en su propia web — y el EAA les aplica igual").
2. Contexto EAA en 2 frases, sin alarmismo.
3. 3 hallazgos agregados con números (del script de agregación).
4. Lo que las herramientas automáticas NO ven (material del pase manual de Fase 4 + práctica manual batch 3).
5. Qué construí: motor open source (link repo) + herramienta web (link).
6. CTA doble: developers → repo; hoteleros → diagnóstico gratis.

Caso de estudio para fabriziocontu.dev: misma estructura expandida + metodología + limitaciones.

## 4. Checklist por batch

### Batch 1 — README + licencia + publicación (commits: `docs(engine): readme + examples` → `chore: MIT license`)

- [ ] §3.1 completo (package.json, LICENSE, CI, CONTRIBUTING, npm pack dry-run).
- [ ] README §3.2 completo, con un ejemplo de salida JSON real (recortado y anonimizado si el usuario lo pide).
- [ ] `demo.tape` de vhs (comando: `hotel-a11y-audit https://example.com` con salida acortada) → `demo.gif` referenciado en el README.
- [ ] Commit en el monorepo: `docs(engine): readme + examples` y luego `chore: MIT license`.
- [ ] `git subtree split --prefix=packages/audit-engine -b engine-public`.
- [ ] **CHECKPOINT con el usuario** (irreversible/público): crear repo GitHub público `hotel-a11y-audit` (con `gh repo create`), push de `engine-public` como `main`. Solo con su OK explícito.
- [ ] **CHECKPOINT con el usuario**: `npm publish --access public` (requiere su `npm login`). Verificar después: `npx hotel-a11y-audit@latest https://example.com` funciona desde una carpeta ajena al repo.
- [ ] Documentar en `docs/release-engine.md` el proceso de sync monorepo→repo público para futuras versiones (subtree split + push, versionado).

### Batch 2 — escaneo BCN + datos agregados

- [ ] Pedir al usuario la lista de hoteles (15-20). Guardarla en `scans/hotels-bcn.txt` (gitignored).
- [ ] Script `scripts/scan-batch.mjs`: lee la lista, corre el CLI secuencialmente (`--out scans/<slug>.json`), 10s de pausa entre hoteles, log de progreso, tolera fallos individuales (`HomeUnreachableError` se anota y sigue).
- [ ] Ejecutar. Presupuesto ~45s/hotel → ~15-20 min total. Revisar que ≥80% de scans terminaron ok; re-intentar los caídos una vez.
- [ ] `scripts/aggregate-scans.mjs` según §2 (tabla de agregados) → salida markdown lista para pegar.
- [ ] Gate: tabla de agregados generada y coherente (nº de hoteles correcto, porcentajes suman, sin NaN).
- [ ] Los scripts se commitean (`chore(scripts): bcn batch scan + aggregation`); los JSON no (gitignored).

### Batch 3 — práctica manual WCAG (LA EJECUTA EL USUARIO; vos preparás)

- [ ] Elegir de los scans 5 violaciones variadas (contraste, alt, label, foco, nombre accesible) en 2-3 hoteles distintos. Preparar guion en `docs/wcag-manual-practice.md`: por cada una → cómo reproducirla a mano (teclado/inspección), link a la regla WCAG oficial (el `helpUrl` de axe), y campo "¿es un falso positivo?".
- [ ] Sesión del usuario (30-60 min). Documentar resultados. Elegir 2 hoteles y hacer la mini-revisión manual del formulario de reserva (30 min c/u, SPEC §8.3).
- [ ] Este material alimenta el punto 4 del post (§3.3).

### Batch 4 — material de lanzamiento

- [ ] Esqueleto del post (§3.3) RELLENO con los datos reales → `docs/launch/post-linkedin.md` (borrador; el usuario lo reescribe con su voz).
- [ ] Esqueleto del caso de estudio → `docs/launch/caso-estudio.md`.
- [ ] Generar con la web los 2-3 informes-regalo (PDF) para los contactos que indique el usuario.
- [ ] **CHECKPOINT con el usuario**: publicar post y caso de estudio es acción suya; vos no publicás nada.

## 5. Cierre de fase y del proyecto (obligatorio)

1. `docs/process/15-fase-5-lanzamiento.md` + índice del README de process. Incluir: URL del repo público, versión npm, tabla de agregados, y estado de cada checkpoint (publicado o pendiente).
2. Registrar en el doc los items para el post-lanzamiento (SPEC §7: revisar métricas a los 3 meses — sugerir al usuario un recordatorio de calendario).
3. `mem_save` del cierre (URLs públicas, decisiones de publicación, datos agregados clave) + `mem_session_summary`.
4. Conventional commits, sin atribución IA. Y el recordatorio final: **ningún material público promete "cumplimiento" ni "auditoría experta"** — diagnóstico inicial, siempre.
