import type { Page } from "playwright";
import type { ThirdPartyIframe } from "./types.js";

/**
 * Known third-party booking-engine providers (informational label only,
 * non-authoritative — design §6). Matched against the frame's hostname.
 */
const KNOWN_PROVIDERS: Array<{ match: RegExp; label: string }> = [
  { match: /booking\.com/i, label: "booking" },
  { match: /siteminder/i, label: "siteminder" },
  { match: /synxis/i, label: "synxis" },
  { match: /thebookingbutton/i, label: "thebookingbutton" },
  { match: /mews/i, label: "mews" },
  { match: /reservit/i, label: "reservit" },
  { match: /simplebooking/i, label: "simplebooking" },
];

function providerLabel(hostname: string): string | null {
  const hit = KNOWN_PROVIDERS.find((p) => p.match.test(hostname));
  return hit ? hit.label : null;
}

/**
 * Enumerate frames on `page` and surface cross-origin ones as informational
 * `thirdPartyIframes` findings (R4.1/R4.2). Never throws for an unscannable
 * frame (R4.3) — CSP/sandbox blocks are represented via `scannable: false`.
 */
export async function detectIframes(page: Page, origin: string): Promise<ThirdPartyIframe[]> {
  const baseHostname = new URL(origin).hostname.toLowerCase();
  const findings: ThirdPartyIframe[] = [];
  const seen = new Set<string>();

  for (const frame of page.frames()) {
    if (frame === page.mainFrame()) continue;

    const frameUrl = frame.url();
    if (!frameUrl || frameUrl === "about:blank") continue;

    let hostname: string;
    try {
      hostname = new URL(frameUrl).hostname.toLowerCase();
    } catch {
      continue; // unparseable frame URL — skip, not an error
    }

    if (hostname === baseHostname) continue; // first-party, not third-party

    const dedupeKey = `${hostname}:${frameUrl}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    // Best-effort noise filter: drop zero-size frames (tracking pixels) when
    // the owning <iframe> element is resolvable. Never fatal if it isn't.
    let isTrivialSize = false;
    try {
      const owner = await frame.frameElement();
      const box = await owner.boundingBox();
      if (box && (box.width <= 2 || box.height <= 2)) {
        isTrivialSize = true;
      }
    } catch {
      // Frame detached or inaccessible mid-check — treat as unscannable below.
    }
    if (isTrivialSize) continue;

    // Scannability heuristic: a trivial in-frame evaluate throwing indicates
    // axe would also fail to traverse into it (CSP/sandbox). Never a
    // pageError (R4.3) — captured only as `scannable: false` here.
    let scannable = true;
    try {
      await frame.evaluate(() => document.readyState);
    } catch {
      scannable = false;
    }

    findings.push({
      url: frameUrl,
      hostname,
      provider: providerLabel(hostname),
      scannable,
    });
  }

  return findings;
}
