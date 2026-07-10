import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { BrowserLaunchError } from "./errors.js";

export interface LaunchedBrowser {
  browser: Browser;
  context: BrowserContext;
}

/**
 * Boot a single reused Chromium instance + context for the whole scan.
 * Launch failure is FATAL (design §7) — caller should let this reject and
 * abort `runAudit` rather than attempt any degrade.
 */
export async function launchBrowser(opts: { headless: boolean }): Promise<LaunchedBrowser> {
  let browser: Browser;
  try {
    browser = await chromium.launch({ headless: opts.headless });
  } catch (cause) {
    throw new BrowserLaunchError(cause);
  }
  try {
    const context = await browser.newContext();
    return { browser, context };
  } catch (cause) {
    await browser.close().catch(() => undefined);
    throw new BrowserLaunchError(cause);
  }
}

/** Open a new page with default navigation timeout pre-applied. */
export async function newBoundedPage(context: BrowserContext, navTimeoutMs: number): Promise<Page> {
  const page = await context.newPage();
  page.setDefaultNavigationTimeout(navTimeoutMs);
  page.setDefaultTimeout(navTimeoutMs);
  return page;
}
