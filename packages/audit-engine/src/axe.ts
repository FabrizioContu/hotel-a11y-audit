import type { Page } from "playwright";
import { AxeBuilder } from "@axe-core/playwright";
import type { AxeSubResult } from "./types.js";

/**
 * Run axe-core against `page` via AxeBuilder and pass violations/incomplete
 * through UNMODIFIED (R1.1). passes/inapplicable are summarized as counts
 * only — the full node arrays carry no diagnostic value and would bloat
 * the JSON payload against the <90s / lean-payload budget.
 */
export async function runAxe(page: Page): Promise<AxeSubResult> {
  const results = await new AxeBuilder({ page }).analyze();
  return {
    violations: results.violations,
    incomplete: results.incomplete,
    passCount: results.passes.length,
    inapplicableCount: results.inapplicable.length,
    testEngineVersion: results.testEngine.version,
  };
}
