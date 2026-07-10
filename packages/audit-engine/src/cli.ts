#!/usr/bin/env node
/**
 * Thin CLI consumer (design §1, ADR-1): no business logic lives here beyond
 * arg parsing, calling `runAudit`, and writing the result. `parseArgs` from
 * `node:util` only — no new CLI-parsing dependency (design keeps this
 * module deliberately minimal).
 */
import { parseArgs } from "node:util";
import { writeFile } from "node:fs/promises";
import { runAudit } from "./audit.js";
import { ALL_LANGUAGES } from "./types.js";
import type { AuditOptions, Language } from "./types.js";

const USAGE = `Usage: hotel-a11y-audit <url> [options]

Runs an initial automated accessibility diagnostic (diagnóstico inicial)
against a hotel website's home page and up to 4 discovered key pages
(room list, room detail, booking form, contact). This is NOT a legal or
official audit and MUST NOT be relied upon as proof of EAA/WCAG adherence.

Arguments:
  <url>              Home page URL to scan (required)

Options:
  --lang <code>       Discovery keyword language hint: one of es, en, it, fr
                       (default: try all four)
  --out <file>        Write the JSON result to <file> instead of stdout
  --timeout <ms>       Override the per-page scan timeout (default: 20000)
  -h, --help           Show this help message
`;

interface CliArgs {
  url?: string;
  lang?: Language;
  out?: string;
  timeoutMs?: number;
}

class CliUsageError extends Error {}

function parseCliArgs(argv: string[]): CliArgs {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      lang: { type: "string" },
      out: { type: "string" },
      timeout: { type: "string" },
      help: { type: "boolean", short: "h" },
    },
  });

  if (values.help) {
    // Handled by caller via a dedicated flag check, but parseArgs already
    // validated the rest of the flags by the time we get here.
    return { url: undefined };
  }

  const [url] = positionals;
  if (!url) {
    throw new CliUsageError("Missing required <url> argument.");
  }

  let lang: Language | undefined;
  if (values.lang !== undefined) {
    if (!ALL_LANGUAGES.includes(values.lang as Language)) {
      throw new CliUsageError(
        `Invalid --lang "${values.lang}". Expected one of: ${ALL_LANGUAGES.join(", ")}.`,
      );
    }
    lang = values.lang as Language;
  }

  let timeoutMs: number | undefined;
  if (values.timeout !== undefined) {
    const parsed = Number(values.timeout);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      throw new CliUsageError(
        `Invalid --timeout "${values.timeout}". Expected a positive number of ms.`,
      );
    }
    timeoutMs = parsed;
  }

  return { url, lang, out: values.out, timeoutMs };
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);

  if (argv.includes("-h") || argv.includes("--help")) {
    process.stdout.write(USAGE);
    process.exitCode = 0;
    return;
  }

  let args: CliArgs;
  try {
    args = parseCliArgs(argv);
  } catch (err) {
    if (err instanceof CliUsageError) {
      process.stderr.write(`${err.message}\n\n${USAGE}`);
      process.exitCode = 1;
      return;
    }
    throw err;
  }

  // parseCliArgs only returns without a url when --help was requested
  // through parseArgs' own boolean flag; already handled above, but guard
  // defensively so a future refactor can't silently skip the usage error.
  if (!args.url) {
    process.stderr.write(`Missing required <url> argument.\n\n${USAGE}`);
    process.exitCode = 1;
    return;
  }

  const options: AuditOptions = {
    languageHints: args.lang ? [args.lang] : undefined,
    pageTimeoutMs: args.timeoutMs,
    navTimeoutMs: args.timeoutMs,
  };

  let result;
  try {
    result = await runAudit(args.url, options);
  } catch (err) {
    // FATAL (design §7): browser launch failure or home page entirely
    // unreachable — nothing to report, exit non-zero (R5.5).
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`Scan failed: ${message}\n`);
    process.exitCode = 1;
    return;
  }

  const json = JSON.stringify(result, null, 2);

  if (args.out) {
    try {
      await writeFile(args.out, json, "utf8");
    } catch (err) {
      // CLI ERROR (design §7): the audit itself already succeeded — only
      // the file write failed. Report to stderr but do not mask the result.
      const message = err instanceof Error ? err.message : String(err);
      process.stderr.write(`Failed to write --out file "${args.out}": ${message}\n`);
      process.exitCode = 1;
      return;
    }
  } else {
    process.stdout.write(`${json}\n`);
  }

  // Partial per-page failures (pageError entries) are NOT a CLI failure
  // (R5.5) — process.exitCode defaults to 0 when not set.
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? (err.stack ?? err.message) : String(err);
  process.stderr.write(`Unexpected error: ${message}\n`);
  process.exitCode = 1;
});
