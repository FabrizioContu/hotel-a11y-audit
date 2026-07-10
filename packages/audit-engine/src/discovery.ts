import type { Page } from "playwright";
import { KEYWORD_TABLE, PRIORITY_ORDER, type KeywordPageType } from "./keywords.js";
import { sameOrigin, normalizeUrl } from "./util.js";
import type { DiscoveryNote, Language } from "./types.js";

/** Single-hop discovery result (D1). Two-hop seam: `source` stays flat here;
 * a future hop-2 pass would append `source:'hop2'` entries (design §4). */
export interface DiscoveredPage {
  url: string;
  pageType: KeywordPageType;
  source: "discovered";
}

interface LinkCandidate {
  href: string;
  text: string;
  ariaLabel: string;
  title: string;
}

interface Winner {
  url: string;
  score: number;
  pathDepth: number;
  domOrder: number;
}

const WEIGHT_URL_PATH = 3;
const WEIGHT_LINK_TEXT = 2;
const WEIGHT_ARIA_TITLE = 1;

/**
 * Strip diacritics + lowercase so ES/FR/IT accented terms (habitación,
 * réserver, disponibilità) match the ASCII `KEYWORD_TABLE` regardless of
 * how the source page encodes them.
 */
function normalizeForMatch(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const keywordRegexCache = new Map<string, RegExp>();

/**
 * Word-boundary match, not raw substring: a naive `.includes('book')` false
 * -positives on unrelated links like "facebookcontainer" (contains "book").
 * `\b` treats hyphens/slashes/spaces as boundaries, so "book-now" and
 * "/book/" still match; multi-word keywords ("book now") match across
 * flexible whitespace via `\s+`.
 */
function keywordRegex(keyword: string): RegExp {
  let regex = keywordRegexCache.get(keyword);
  if (!regex) {
    const pattern = keyword.trim().split(/\s+/).map(escapeRegex).join("\\s+");
    regex = new RegExp(`\\b${pattern}\\b`);
    keywordRegexCache.set(keyword, regex);
  }
  return regex;
}

function surfaceMatches(surface: string, keywords: string[]): boolean {
  const normalized = normalizeForMatch(surface);
  return keywords.some((kw) => keywordRegex(normalizeForMatch(kw)).test(normalized));
}

/**
 * Weighted score (design §4 step 4): URL path segment (3) > link text (2)
 * > aria-label/title (1), summed across every requested language hint.
 */
function scoreCandidateForType(
  candidate: LinkCandidate,
  pageType: KeywordPageType,
  languageHints: Language[],
): number {
  let pathname = candidate.href;
  try {
    pathname = new URL(candidate.href).pathname;
  } catch {
    // Relative href without a resolvable base at this point — fall back to
    // scoring the raw href string, still informative.
  }

  let score = 0;
  for (const lang of languageHints) {
    const keywords = KEYWORD_TABLE[pageType][lang];
    if (surfaceMatches(pathname, keywords)) score += WEIGHT_URL_PATH;
    if (surfaceMatches(candidate.text, keywords)) score += WEIGHT_LINK_TEXT;
    if (surfaceMatches(candidate.ariaLabel || candidate.title, keywords))
      score += WEIGHT_ARIA_TITLE;
  }
  return score;
}

function pathDepthOf(url: string): number {
  try {
    return new URL(url).pathname.split("/").filter(Boolean).length;
  } catch {
    return Number.MAX_SAFE_INTEGER;
  }
}

async function extractLinks(page: Page): Promise<LinkCandidate[]> {
  return page.$$eval("a[href]", (anchors) =>
    anchors.map((a) => ({
      href: a.getAttribute("href") ?? "",
      text: a.textContent?.trim() ?? "",
      ariaLabel: a.getAttribute("aria-label") ?? "",
      title: a.getAttribute("title") ?? "",
    })),
  );
}

/** Fallback notes used when discovery cannot even attempt scoring (defensive — see audit.ts). */
export function notFoundAllNotes(detail: string): DiscoveryNote[] {
  return PRIORITY_ORDER.map((pageType) => ({ pageType, status: "not_found", detail }));
}

/**
 * Single-hop key-page discovery (D1, design §4). Extracts same-origin links
 * from the already-loaded home page, scores them per `page_type` against
 * `KEYWORD_TABLE`, dedups by normalized URL, and priority-fills up to
 * `maxPages - 1` additional pages (home always occupies slot 1 elsewhere).
 *
 * Never throws: the only async op that can fail (`extractLinks`, a Playwright
 * `$$eval`) is caught internally and degrades to "nothing discovered" plus
 * `not_found` notes for every type, matching R2.5's "diagnóstico inicial"
 * honesty requirement rather than aborting the scan.
 */
export async function discoverPages(
  homePage: Page,
  homeUrl: string,
  origin: string,
  opts: { maxPages: number; languageHints: Language[] },
): Promise<{ pages: DiscoveredPage[]; notes: DiscoveryNote[] }> {
  let links: LinkCandidate[];
  try {
    links = await extractLinks(homePage);
  } catch (err) {
    return {
      pages: [],
      notes: notFoundAllNotes(
        `Link extraction failed: ${err instanceof Error ? err.message : String(err)}`,
      ),
    };
  }

  const normalizedHome = normalizeUrl(homeUrl);

  // Same-origin filter (R2.1) + dedup by normalized URL (R2.3), first
  // occurrence wins + drop the home URL itself (design §4 steps 2/3).
  const seenUrls = new Set<string>([normalizedHome]);
  const candidates: Array<{ normalizedUrl: string; link: LinkCandidate }> = [];
  for (const link of links) {
    if (!link.href || !sameOrigin(link.href, origin)) continue;
    let normalized: string;
    try {
      normalized = normalizeUrl(link.href, homeUrl);
    } catch {
      continue; // unparseable href — skip, not an error (design §4 step 1/2)
    }
    if (seenUrls.has(normalized)) continue;
    seenUrls.add(normalized);
    candidates.push({ normalizedUrl: normalized, link });
  }

  // Score every unique candidate against every non-home page_type; each
  // candidate is assigned to its single highest-scoring type (design §4
  // step 4). Ties at the top score are tracked for the 'ambiguous' note
  // (design §4 step 7) and broken deterministically: shorter path depth,
  // then earlier DOM order (design §4 step 5).
  const bestPerType = new Map<KeywordPageType, Winner>();
  const tiedTopPerType = new Set<KeywordPageType>();

  candidates.forEach(({ normalizedUrl, link }, domOrder) => {
    for (const pageType of PRIORITY_ORDER) {
      const score = scoreCandidateForType(link, pageType, opts.languageHints);
      if (score === 0) continue;

      const pathDepth = pathDepthOf(normalizedUrl);
      const candidate: Winner = { url: normalizedUrl, score, pathDepth, domOrder };
      const current = bestPerType.get(pageType);

      if (!current || score > current.score) {
        bestPerType.set(pageType, candidate);
        tiedTopPerType.delete(pageType);
      } else if (score === current.score) {
        tiedTopPerType.add(pageType);
        if (pathDepth < current.pathDepth) {
          bestPerType.set(pageType, candidate);
        }
      }
    }
  });

  // A single URL cannot serve two page types (R2.3): if it won for more
  // than one, keep it only for the higher-priority type (PRIORITY_ORDER is
  // iterated highest-priority-first, so the first claimant wins).
  const assignedUrls = new Set<string>();
  const urlOwner = new Map<string, KeywordPageType>();
  const winners: Array<{ pageType: KeywordPageType; winner: Winner }> = [];
  // Tracks page types that DID match a link but lost the URL to a
  // higher-priority type — used to give these an honest "reassigned" note
  // (W3) instead of the misleading "no link matched" wording below.
  const reassignedTo = new Map<KeywordPageType, KeywordPageType>();
  for (const pageType of PRIORITY_ORDER) {
    const winner = bestPerType.get(pageType);
    if (!winner) continue;
    if (assignedUrls.has(winner.url)) {
      const owner = urlOwner.get(winner.url);
      if (owner) reassignedTo.set(pageType, owner);
      continue;
    }
    assignedUrls.add(winner.url);
    urlOwner.set(winner.url, pageType);
    winners.push({ pageType, winner });
  }

  // Cap at maxPages total (home + discovered), priority-fill order (R2.4).
  const slots = Math.max(0, opts.maxPages - 1);
  const filled = winners.slice(0, slots);
  const overflow = winners.slice(slots);

  const pages: DiscoveredPage[] = filled.map(({ pageType, winner }) => ({
    url: winner.url,
    pageType,
    source: "discovered",
  }));

  const notes: DiscoveryNote[] = [];
  for (const { pageType, winner } of filled) {
    if (tiedTopPerType.has(pageType)) {
      notes.push({
        pageType,
        status: "ambiguous",
        detail:
          `Multiple candidate links scored equally for ${pageType}; selected ` +
          `${winner.url} via tie-break (shorter URL path, then earlier link order).`,
      });
    }
  }
  for (const { pageType } of overflow) {
    notes.push({
      pageType,
      status: "capped",
      detail: `A ${pageType} candidate was found but discovery is capped at ${opts.maxPages} total pages.`,
    });
  }
  const foundTypes = new Set(winners.map((w) => w.pageType));
  for (const pageType of PRIORITY_ORDER) {
    if (foundTypes.has(pageType)) continue;

    const owner = reassignedTo.get(pageType);
    if (owner) {
      // W3: a link DID match this type's keyword dictionary — it just lost
      // the URL to a higher-priority type (R2.3 dedup). Say so honestly
      // instead of implying no candidate was found at all.
      notes.push({
        pageType,
        status: "not_found",
        detail:
          `A same-origin link matched the ${pageType} keyword dictionary, but its URL ` +
          `was already assigned to the higher-priority page type '${owner}' (R2.3 ` +
          `dedup: one URL cannot serve two page types).`,
      });
    } else {
      notes.push({
        pageType,
        status: "not_found",
        detail: `No same-origin link matched the ${pageType} keyword dictionary.`,
      });
    }
  }

  return { pages, notes };
}
