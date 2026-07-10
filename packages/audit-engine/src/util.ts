/** Pure helpers shared across the engine. Zero runtime deps beyond the URL global. */

/**
 * Race `promise` against a timeout. Rejects with an Error tagged `label` when
 * the timeout wins, so callers can classify it (see errors.ts / page-scan.ts).
 */
export async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`TIMEOUT:${label}:${ms}ms`));
    }, ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer!);
  }
}

/**
 * True when `href` resolves (against `origin`) to the same scheme+host+port
 * as `origin`. Non-parseable hrefs (mailto:, tel:, javascript:, bare `#...`)
 * resolve to false rather than throwing.
 */
export function sameOrigin(href: string, origin: string): boolean {
  try {
    const resolved = new URL(href, origin);
    const base = new URL(origin);
    if (resolved.protocol !== "http:" && resolved.protocol !== "https:") {
      return false;
    }
    return (
      resolved.protocol === base.protocol &&
      resolved.hostname === base.hostname &&
      resolved.port === base.port
    );
  } catch {
    return false;
  }
}

/**
 * Normalize a URL for dedup/comparison purposes: strips trailing slash
 * (except root), drops hash fragment, lowercases the host. Does not touch
 * the query string (query differences may be meaningful).
 */
export function normalizeUrl(href: string, base?: string): string {
  const url = new URL(href, base);
  url.hash = "";
  url.hostname = url.hostname.toLowerCase();
  let pathname = url.pathname;
  if (pathname.length > 1 && pathname.endsWith("/")) {
    pathname = pathname.slice(0, -1);
  }
  url.pathname = pathname;
  return url.toString();
}

/** Clamp `value` into the inclusive [min, max] range. */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
