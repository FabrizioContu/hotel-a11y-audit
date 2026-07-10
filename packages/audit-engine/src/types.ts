/**
 * Public types for the audit engine. camelCase, DB-agnostic — no persistence
 * concerns leak in here (snake_case mapping, if any, happens downstream in
 * apps/api during a later phase).
 *
 * axe-core result shapes are re-exported, never redefined, so consumers stay
 * aligned with whichever axe-core version is actually pinned (see ADR-2,
 * design §2 / §7).
 */
import type { Result as AxeResult, IncompleteResult } from "axe-core";

/**
 * Spec-exact enum values (SPEC.md §3 / delta spec R2.6). NOTE: the design
 * draft used `rooms_list`; the spec is authoritative and uses `room_list`.
 */
export type PageType = "home" | "room_list" | "room_detail" | "booking_form" | "contact";

export type Language = "es" | "en" | "it" | "fr";

export interface AuditOptions {
  /** Cap on total pages scanned (home + discovered). Default 5, clamped 1..5. */
  maxPages?: number;
  /** Discovery keyword tables to prefer. Default: all four languages. */
  languageHints?: Language[];
  /** Default true. */
  headless?: boolean;
  /** Hard per-page timeout budget (ms). Default 20_000. */
  pageTimeoutMs?: number;
  /** goto(..., { waitUntil: 'domcontentloaded' }) timeout (ms). Default 20_000. */
  navTimeoutMs?: number;
  /** Bounded, non-fatal networkidle settle window (ms). Default 8_000. */
  networkIdleMs?: number;
  /** Bounded Tab-key loop size for the keyboard tab-through check. Default 60. */
  keyboardMaxTabs?: number;
  /** CLI convenience only; library callers (e.g. apps/api) ignore this. */
  outFile?: string;
}

/** axe-core passthrough — re-exported, NOT redefined (design ADR-2). */
export type AxeViolation = AxeResult;
export type AxeIncomplete = IncompleteResult;

export interface AxeSubResult {
  /** Full objects: rule id, impact, nodes, help URLs — unmodified from axe-core. */
  violations: AxeViolation[];
  /** Full objects — same treatment as violations (R1.1). */
  incomplete: AxeIncomplete[];
  /** Counts only — passes carry no diagnostic value, keep payload lean. */
  passCount: number;
  inapplicableCount: number;
  /** axe-core version actually run, for provenance. */
  testEngineVersion: string;
}

export interface KeyboardTabThrough {
  /** false when no booking form was found — heuristic was skipped, not an error. */
  detectedForm: boolean;
  /** Reachable focusable elements traversed. */
  tabStops: number;
  /** Ordered element descriptors (tag#id.class[name]). */
  focusOrder: string[];
  /** Repeat-cycle detected before natural end. */
  focusTrap: boolean;
  /** Tab landed on body/null activeElement. */
  focusLossCount: number;
  /** Focused element failed the focus-visibility heuristic. */
  invisibleFocusCount: number;
  /** Loop ended naturally (not cut short by the iteration cap). */
  reachedEnd: boolean;
  /** Human-readable note, e.g. 'no booking form detected'. Framed as SIGNAL, not pass/fail. */
  note?: string;
}

export interface ThirdPartyIframe {
  /**
   * Discriminator (R4.2 literal text) so this finding self-identifies as an
   * informational, non-defect signal even out of the context of the
   * `thirdPartyIframes` array key (e.g. if a downstream consumer flattens
   * findings from multiple arrays into one list).
   */
  kind: "third-party-booking-iframe";
  url: string;
  hostname: string;
  /** Known-provider label (e.g. 'booking', 'siteminder') or null when unrecognized. */
  provider: string | null;
  /** false when CSP/sandbox blocked axe from traversing into the frame. */
  scannable: boolean;
}

export interface PageError {
  /**
   * Which pipeline stage failed. Determines whether sibling fields on
   * `PageResult` (`axe`, `thirdPartyIframes`, `keyboardTabThrough`) can
   * still be present alongside this error — see `PageResult.axe`'s doc
   * comment for the full mutual-exclusivity semantics.
   */
  phase: "navigation" | "axe" | "keyboard" | "iframe";
  /** Machine-readable reason, e.g. 'NAV_TIMEOUT' | 'AXE_FAILED'. */
  code: string;
  message: string;
}

export interface PageResult {
  url: string;
  pageType: PageType;
  /** Two-hop discovery seam (D1): additive 'hop2' value can be added later. */
  source: "home" | "discovered";
  /**
   * Present iff axe ran to completion for this page. `axe` and `pageError`
   * are mutually exclusive ONLY when `pageError.phase` is `'navigation'` or
   * `'axe'` (nothing ran yet, or axe itself is what failed). When a LATER
   * stage fails (`pageError.phase === 'iframe' | 'keyboard'`), `axe` MAY be
   * present alongside `pageError` — a downstream hiccup after a successful
   * axe run must not discard good diagnostic data. This is the intentional
   * "honest-diagnostic" behavior from design §7, amended into the delta
   * spec's R5.3/R1.4 wording post-verify (see spec artifact amendment note,
   * dated 2026-07-10).
   */
  axe?: AxeSubResult;
  /**
   * Present only for `booking_form` pages. Absent when `pageError.phase`
   * is `'keyboard'` (the check itself threw) or an earlier stage never
   * reached it.
   */
  keyboardTabThrough?: KeyboardTabThrough;
  /**
   * Absent when `pageError.phase` is `'iframe'` (the check itself threw) or
   * an earlier stage never reached it.
   */
  thirdPartyIframes?: ThirdPartyIframe[];
  /**
   * Present => this page degraded at `phase`; the scan continued
   * regardless (R1.4). MAY coexist with `axe` — see `axe`'s doc comment.
   */
  pageError?: PageError;
  durationMs: number;
}

export interface DiscoveryNote {
  pageType: PageType;
  status: "not_found" | "ambiguous" | "capped";
  detail: string;
}

export interface AuditResult {
  /** Input URL, normalized. */
  url: string;
  /** ISO-8601 timestamp. */
  scannedAt: string;
  /** Whole scan wall-clock duration. */
  durationMs: number;
  /** Engine package provenance. */
  engineVersion: string;
  pages: PageResult[];
  /** Honest coverage gaps ("diagnóstico inicial" positioning, R2.5). */
  discoveryNotes: DiscoveryNote[];
  /** Fixed string: initial diagnostic only, not a legal/official guarantee (SPEC R7.1/R7.2). */
  disclaimer: string;
}

/** Internal defaults shared by audit.ts / discovery.ts / page-scan.ts. */
export const DEFAULT_OPTIONS: Required<Omit<AuditOptions, "outFile" | "languageHints">> = {
  maxPages: 5,
  headless: true,
  pageTimeoutMs: 20_000,
  navTimeoutMs: 20_000,
  networkIdleMs: 8_000,
  keyboardMaxTabs: 60,
};

export const ALL_LANGUAGES: Language[] = ["es", "en", "it", "fr"];

/** Engine package provenance, surfaced on every `AuditResult`. */
export const ENGINE_VERSION = "0.0.0";

export const DISCLAIMER =
  "This is an initial automated accessibility diagnostic (diagnóstico inicial). " +
  "It is NOT a legal or official audit, and it MUST NOT be relied upon as proof " +
  "of EAA/WCAG adherence.";
