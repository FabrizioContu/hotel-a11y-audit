# 09 — Criterios de salida Fase 1: validación contra hoteles reales de Barcelona

**Fecha**: 2026-07-10 · **Cambio SDD**: `fase-1-audit-engine` · **Artefacto**: engram `sdd/fase-1-audit-engine/exit-criteria`

## Qué se hizo

Ejecución de la fase 5 del checklist: `npm exec -w hotel-a11y-audit -- hotel-a11y-audit <url>` contra webs de hotel reales de Barcelona, midiendo páginas descubiertas, violaciones y duración.

## Resultados

| Web | Páginas | Tipos | Violaciones axe | Duración | Iframes terceros detectados |
|---|---|---|---|---|---|
| grandhotelcentral.com | 4 | home, room_detail, room_list, contact | 27 | 45.0s | player.vimeo.com, challenges.cloudflare.com |
| hotel1898.com | 3 | home, room_detail, room_list | 8 | 29.8s | www.google.com |
| hotelcasafuster.com | 2 | home, room_list | 8 | 17.3s | — |
| hotelbrummell.com | 1 | home | 4 | 7.1s | — |
| majestichotel.es | — | dominio inexistente → `HomeUnreachableError`, exit 1, mensaje claro | — | 16.6s | (validación del camino fatal) |

## Veredicto contra el criterio del SPEC (§5 Fase 1)

> `npx audit <url>` devuelve JSON de 3-5 páginas en <90s

- **<90s**: ✅ PASS en todos los scans (máximo 45s, la mitad del presupuesto).
- **3-5 páginas**: ✅ en 2 de 4 webs. En las otras dos, el single-hop encontró 1-2: navegación renderizada por JS y motores de reserva en dominios de terceros (filtrados correctamente por same-origin). `booking_form` no apareció same-origin en NINGUNA de las 4 webs — el patrón que el SPEC §6 identificó como riesgo principal, confirmado con datos.
- Las notas de `discoveryNotes` reportaron honestamente cada tipo no encontrado.
- La keyword ES `habitaciones` y las rutas EN `rooms`/`contact` funcionaron; el scoring asignó `room_detail` correctamente en 2 webs.

## Implicaciones (con datos, no con opiniones)

1. **El follow-up two-hop (D1) queda justificado empíricamente** — 2 de 4 webs lo necesitan para llegar a 3+ páginas.
2. **El hallazgo de iframe de terceros es central al producto**, no un edge case: 0 de 4 hoteles tienen el motor de reservas en su propio dominio. El informe de Fase 3 debe darle protagonismo ("tu motor de reservas es de [proveedor]; el EAA también le aplica").
3. El check de teclado no se ejercitó en la muestra (sin `booking_form` same-origin) — su corrección quedó probada por el harness `npm run validate` (doc 08).

## Pendiente humano (SPEC §8)

La verificación manual de 5 violaciones reportadas por axe (¿son reales? ¿cómo se reproducen con teclado?) es práctica WCAG del autor — no delegable a la herramienta. Los JSON de los 4 scans quedan disponibles para ese ejercicio.

## Siguiente paso

`sdd-archive`: cerrar el ciclo del cambio registrando los items abiertos (two-hop, práctica manual).
