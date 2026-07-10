/**
 * Pure data: keyword dictionaries per non-home `page_type` x `Language`
 * (design §4, ADR-5; spec R2.2). No logic lives here — isolated so that
 * validation/tuning against the 3 real hotel sites (D2) never touches
 * discovery's control flow (`discovery.ts`).
 *
 * Non-exhaustive per spec (R2.2 explicitly leaves final dictionaries to
 * design/apply). Deliberately overlaps across page types in places (e.g.
 * "reserva"/"reserver" appear under both `room_list` and `booking_form`,
 * matching the spec's own representative terms) — `discovery.ts` assigns
 * each candidate link to its single highest-scoring type, so overlap is
 * safe by construction.
 *
 * Terms are stored lowercase, ASCII (no diacritics) — `discovery.ts`
 * normalizes candidate text/URLs the same way before matching, so
 * accented source variants (habitación, réserver, disponibilità) still
 * match.
 */
import type { Language, PageType } from "./types.js";

export type KeywordPageType = Exclude<PageType, "home">;

export const KEYWORD_TABLE: Record<KeywordPageType, Record<Language, string[]>> = {
  room_list: {
    es: ["habitaciones", "alojamiento", "reserva"],
    en: ["rooms", "accommodation", "book"],
    it: ["camere", "alloggio", "prenota"],
    fr: ["chambres", "hebergement", "reserver"],
  },
  room_detail: {
    es: ["habitacion", "suite", "ficha"],
    en: ["room", "suite", "detail"],
    it: ["camera", "suite"],
    fr: ["chambre", "suite"],
  },
  booking_form: {
    es: ["reserva", "reservar", "disponibilidad", "reservas"],
    en: ["booking", "book now", "reservation", "book"],
    it: ["prenota", "prenotazione", "disponibilita"],
    fr: ["reservation", "reserver"],
  },
  contact: {
    es: ["contacto"],
    en: ["contact"],
    it: ["contatti"],
    fr: ["contact"],
  },
};

/**
 * Priority order used for cap-fill (design §4 step 6): booking flow is the
 * product focus (SPEC §3), so `booking_form` and `room_detail` are filled
 * before `room_list`/`contact` when the cap would otherwise exclude one.
 */
export const PRIORITY_ORDER: KeywordPageType[] = [
  "booking_form",
  "room_detail",
  "room_list",
  "contact",
];
