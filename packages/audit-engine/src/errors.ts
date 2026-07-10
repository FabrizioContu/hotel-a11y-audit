import type { PageError } from "./types.js";

/**
 * FATAL error tier (design §7): the only two conditions that make the whole
 * result worthless. Everything else degrades into a per-page `pageError`
 * (DEGRADE tier) and the scan continues.
 */
export class AuditError extends Error {}

/** Chromium missing/crash on launch. Nothing to report — reject the whole audit. */
export class BrowserLaunchError extends AuditError {
  constructor(cause: unknown) {
    super(
      `Failed to launch Chromium. If the browser binary is missing, run ` +
        `"npx playwright install chromium". Cause: ${describeCause(cause)}`,
    );
    this.name = "BrowserLaunchError";
  }
}

/**
 * Home page navigation failed/timed out. The home page is also the
 * discovery source, so without it there is nothing to scan or discover.
 */
export class HomeUnreachableError extends AuditError {
  constructor(
    public readonly url: string,
    cause: unknown,
  ) {
    super(`Home page unreachable: ${url}. Cause: ${describeCause(cause)}`);
    this.name = "HomeUnreachableError";
  }
}

function describeCause(cause: unknown): string {
  if (cause instanceof Error) return cause.message;
  return String(cause);
}

/**
 * Classifies a caught error from a given pipeline phase into a `PageError`
 * (DEGRADE tier). Used by page-scan.ts so a failure in one sub-check never
 * bubbles up and aborts the whole per-page pipeline, let alone the scan.
 */
export function toPageError(phase: PageError["phase"], err: unknown): PageError {
  const message = err instanceof Error ? err.message : String(err);
  const code = classifyCode(phase, message);
  return { phase, code, message };
}

function classifyCode(phase: PageError["phase"], message: string): string {
  const lower = message.toLowerCase();
  if (phase === "navigation") {
    if (lower.includes("timeout:page:")) return "PAGE_TIMEOUT";
    if (lower.startsWith("timeout:") || lower.includes("timeout")) {
      return "NAV_TIMEOUT";
    }
    return "NAV_FAILED";
  }
  if (phase === "axe") {
    if (lower.includes("timeout")) return "AXE_TIMEOUT";
    return "AXE_FAILED";
  }
  if (phase === "keyboard") {
    return "KEYBOARD_CHECK_FAILED";
  }
  return "IFRAME_DETECTION_FAILED";
}
