import type { Page } from "playwright";
import { runAxe } from "./axe.js";
import { detectIframes } from "./iframe.js";
import { checkTabThrough } from "./keyboard.js";
import { toPageError } from "./errors.js";
import { withTimeout } from "./util.js";
import type {
  AxeSubResult,
  KeyboardTabThrough,
  PageError,
  PageResult,
  PageType,
  ThirdPartyIframe,
} from "./types.js";

export interface ScanPageParams {
  url: string;
  pageType: PageType;
  source: "home" | "discovered";
}

export interface ScanPageOptions {
  navTimeoutMs: number;
  networkIdleMs: number;
  pageTimeoutMs: number;
  keyboardMaxTabs: number;
}

/**
 * Per-page pipeline (design §1/§3). Composes axe + iframe (+ keyboard only
 * for booking_form). Never throws upward — every failure mode (navigation,
 * axe, keyboard, iframe) is captured as data on the returned `PageResult`
 * (R1.4). The caller (audit.ts) decides whether a navigation-phase
 * `pageError` on the HOME page should be escalated to FATAL — from this
 * module's point of view every page is treated the same way (DEGRADE).
 */
export async function scanPage(
  page: Page,
  params: ScanPageParams,
  origin: string,
  opts: ScanPageOptions,
): Promise<PageResult> {
  const start = Date.now();
  try {
    const result = await withTimeout(
      runPipeline(page, params, origin, opts),
      opts.pageTimeoutMs,
      "page",
    );
    return { ...result, durationMs: Date.now() - start };
  } catch (err) {
    // Either navigation itself failed/timed out, or the whole per-page
    // budget (opts.pageTimeoutMs) was exceeded — both degrade to a
    // navigation-phase pageError with no axe/iframe/keyboard data, since we
    // cannot vouch for anything having completed cleanly.
    return {
      url: params.url,
      pageType: params.pageType,
      source: params.source,
      pageError: toPageError("navigation", err),
      durationMs: Date.now() - start,
    };
  }
}

async function runPipeline(
  page: Page,
  params: ScanPageParams,
  origin: string,
  opts: ScanPageOptions,
): Promise<Omit<PageResult, "durationMs">> {
  // 1. Navigate — bounded by navTimeoutMs. A rejection here propagates up
  // to scanPage's catch, which turns it into a full navigation pageError.
  await withTimeout(
    page.goto(params.url, {
      waitUntil: "domcontentloaded",
      timeout: opts.navTimeoutMs,
    }),
    opts.navTimeoutMs,
    "navigation",
  );

  // 2. Bounded, NON-FATAL networkidle settle (R1.2) — sites with a
  // persistent poller (analytics/chat widgets) must not hang the scan.
  await page
    .waitForLoadState("networkidle", { timeout: opts.networkIdleMs })
    .catch(() => undefined);
  await page.waitForTimeout(500);

  // 3. axe — per-check try/catch, degrades independently of iframe/keyboard.
  let axe: AxeSubResult | undefined;
  let pageError: PageError | undefined;
  try {
    axe = await runAxe(page);
  } catch (err) {
    pageError = toPageError("axe", err);
  }

  // 4. Third-party iframe detection — informational, never fatal (R4.3).
  let thirdPartyIframes: ThirdPartyIframe[] | undefined;
  try {
    thirdPartyIframes = await detectIframes(page, origin);
  } catch (err) {
    if (!pageError) pageError = toPageError("iframe", err);
  }

  // 5. Keyboard tab-through — booking_form pages only (R3.4).
  let keyboardTabThrough: KeyboardTabThrough | undefined;
  if (params.pageType === "booking_form") {
    try {
      keyboardTabThrough = await checkTabThrough(page, {
        keyboardMaxTabs: opts.keyboardMaxTabs,
      });
    } catch (err) {
      if (!pageError) pageError = toPageError("keyboard", err);
    }
  }

  return {
    url: params.url,
    pageType: params.pageType,
    source: params.source,
    axe,
    keyboardTabThrough,
    thirdPartyIframes,
    pageError,
  };
}
