/**
 * PUBLIC API façade. This is the ONLY module referenced by the package's
 * `exports` map — internals (audit.ts, page-scan.ts, discovery.ts, etc.)
 * are not part of the public surface and may be refactored freely as long
 * as this file's export list stays stable (design §1).
 */
export { runAudit } from "./audit.js";

export type {
  PageType,
  Language,
  AuditOptions,
  AxeViolation,
  AxeIncomplete,
  AxeSubResult,
  KeyboardTabThrough,
  ThirdPartyIframe,
  PageError,
  PageResult,
  DiscoveryNote,
  AuditResult,
} from "./types.js";

export { ENGINE_VERSION } from "./types.js";

/**
 * Pre-Fase-1 scaffold placeholder, kept for backward compatibility with
 * apps/api's existing import (design scope excludes changes to apps/*).
 */
export function engineStatus(): string {
  return `hotel-a11y-audit engine v0.0.0 — single-page axe scan available via runAudit()`;
}
