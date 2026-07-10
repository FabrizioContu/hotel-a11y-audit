import { launchBrowser, newBoundedPage } from "./browser.js";
import { scanPage } from "./page-scan.js";
import { HomeUnreachableError } from "./errors.js";
import { normalizeUrl, clamp } from "./util.js";
import { ALL_LANGUAGES, DEFAULT_OPTIONS, DISCLAIMER, ENGINE_VERSION } from "./types.js";
import type { AuditOptions, AuditResult, PageResult } from "./types.js";

interface ResolvedOptions {
  maxPages: number;
  languageHints: typeof ALL_LANGUAGES;
  headless: boolean;
  pageTimeoutMs: number;
  navTimeoutMs: number;
  networkIdleMs: number;
  keyboardMaxTabs: number;
}

function resolveOptions(options?: AuditOptions): ResolvedOptions {
  return {
    maxPages: clamp(options?.maxPages ?? DEFAULT_OPTIONS.maxPages, 1, 5),
    languageHints: options?.languageHints ?? ALL_LANGUAGES,
    headless: options?.headless ?? DEFAULT_OPTIONS.headless,
    pageTimeoutMs: options?.pageTimeoutMs ?? DEFAULT_OPTIONS.pageTimeoutMs,
    navTimeoutMs: options?.navTimeoutMs ?? DEFAULT_OPTIONS.navTimeoutMs,
    networkIdleMs: options?.networkIdleMs ?? DEFAULT_OPTIONS.networkIdleMs,
    keyboardMaxTabs: options?.keyboardMaxTabs ?? DEFAULT_OPTIONS.keyboardMaxTabs,
  };
}

/**
 * Orchestrator (design §1/§3). Owns browser lifecycle, the FATAL vs DEGRADE
 * boundary (design §7), and result assembly.
 *
 * NOTE (this batch / Commit 1 "single-page axe scan"): only the home page is
 * scanned. Key-page discovery (R2.x) is wired in during Commit 2 (Phase 3)
 * — see design §3/§4 and tasks.md 3.3. `discoveryNotes` is therefore always
 * empty here; that's expected for this milestone, not a bug.
 */
export async function runAudit(url: string, options?: AuditOptions): Promise<AuditResult> {
  const start = Date.now();
  const opts = resolveOptions(options);
  const normalizedUrl = normalizeUrl(url);
  const origin = new URL(normalizedUrl).origin;

  // FATAL: browser launch failure — nothing to report (design §7).
  const { browser, context } = await launchBrowser({
    headless: opts.headless,
  });

  const pages: PageResult[] = [];

  try {
    const homePage = await newBoundedPage(context, opts.navTimeoutMs);
    const homeResult = await scanPage(
      homePage,
      { url: normalizedUrl, pageType: "home", source: "home" },
      origin,
      opts,
    );
    await homePage.close().catch(() => undefined);

    // FATAL: home page itself unreachable — the whole audit is meaningless
    // without it (it's also the discovery source, design §7). scanPage
    // always degrades navigation failures into a pageError; here we
    // escalate that specific case for the home page only.
    if (homeResult.pageError?.phase === "navigation") {
      throw new HomeUnreachableError(normalizedUrl, new Error(homeResult.pageError.message));
    }

    pages.push(homeResult);

    // Commit 2 (Phase 3) inserts key-page discovery + the discovered-page
    // scan loop here, appending to `pages` and populating `discoveryNotes`.
  } finally {
    await context.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
  }

  return {
    url: normalizedUrl,
    scannedAt: new Date(start).toISOString(),
    durationMs: Date.now() - start,
    engineVersion: ENGINE_VERSION,
    pages,
    discoveryNotes: [],
    disclaimer: DISCLAIMER,
  };
}
