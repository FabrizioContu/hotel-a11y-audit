import { launchBrowser, newBoundedPage } from "./browser.js";
import { scanPage } from "./page-scan.js";
import { discoverPages, notFoundAllNotes } from "./discovery.js";
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
 * boundary (design §7), key-page discovery, and result assembly.
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
  let discoveryNotes: AuditResult["discoveryNotes"] = [];

  try {
    const homePage = await newBoundedPage(context, opts.navTimeoutMs);
    const homeResult = await scanPage(
      homePage,
      { url: normalizedUrl, pageType: "home", source: "home" },
      origin,
      opts,
    );

    // FATAL: home page itself unreachable — the whole audit is meaningless
    // without it (it's also the discovery source, design §7). scanPage
    // always degrades navigation failures into a pageError; here we
    // escalate that specific case for the home page only.
    if (homeResult.pageError?.phase === "navigation") {
      await homePage.close().catch(() => undefined);
      throw new HomeUnreachableError(normalizedUrl, new Error(homeResult.pageError.message));
    }

    pages.push(homeResult);

    // Key-page discovery (D1, single-hop) reuses the already-loaded home
    // page for its $$eval link scrape (design §3: "home is scanned AND
    // reused as the discovery source in one load") — close it only after.
    const discovery = await discoverPages(homePage, normalizedUrl, origin, {
      maxPages: opts.maxPages,
      languageHints: opts.languageHints,
    }).catch((err: unknown) =>
      // Defensive last resort — discoverPages() itself is designed to
      // never throw (DEGRADE, design §7), but a discovery bug must never
      // sink the whole scan either.
      ({
        pages: [],
        notes: notFoundAllNotes(
          `Discovery failed unexpectedly: ${err instanceof Error ? err.message : String(err)}`,
        ),
      }),
    );
    discoveryNotes = discovery.notes;

    await homePage.close().catch(() => undefined);

    for (const discovered of discovery.pages) {
      const page = await newBoundedPage(context, opts.navTimeoutMs);
      const result = await scanPage(
        page,
        { url: discovered.url, pageType: discovered.pageType, source: "discovered" },
        origin,
        opts,
      );
      await page.close().catch(() => undefined);
      pages.push(result);
    }
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
    discoveryNotes,
    disclaimer: DISCLAIMER,
  };
}
