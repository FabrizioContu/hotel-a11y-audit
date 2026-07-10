#!/usr/bin/env node
/**
 * D2 lightweight validation harness (dependency-free — NOT a test
 * framework, per D2's "no automated test runner" decision). This is a
 * repeatable, node:http-only substitute for the ad-hoc Playwright fixtures
 * used during the fase-1-audit-engine verify pass (see verify-report,
 * apply-progress obs #103/#105) so Areas 3/4 (keyboard + iframe) and the
 * post-verify fixes below don't silently regress before real hotel-site
 * validation (Phase 5) is available again.
 *
 * Empirically re-proves, against the BUILT `dist/` output (not source):
 *   - C1 (R3.2): an `outline:none` field with no alternative indicator
 *     MUST report `focusVisible: false`, even though Chromium's
 *     `:focus-visible` may still match it (input-modality heuristic, not
 *     rendering — see keyboard.ts's readFocusSnapshot doc comment).
 *   - R3.3: a genuine keyboard trap (a widget that recaptures focus) MUST
 *     be detected (`focusTrap: true`).
 *   - W1 (R4.2): `ThirdPartyIframe` findings carry an explicit
 *     `kind: "third-party-booking-iframe"` discriminator.
 *   - W3 (R2.3): a page type whose winning URL was reassigned to a
 *     higher-priority type MUST get an honest "reassigned" note, not the
 *     generic "no link matched" wording.
 *   - W2 (R5.3/R1.4): `axe` MAY coexist with `pageError` when a stage
 *     AFTER axe (here: keyboard) fails — proven by breaking
 *     `getComputedStyle` mid-tab-traversal, after axe has already
 *     completed.
 *
 * Usage: `npm run validate -w hotel-a11y-audit` (run `npm run build` first
 * so `dist/` reflects the current source). Exits non-zero on any failed
 * assertion.
 */
import assert from "node:assert/strict";
import http from "node:http";
import { runAudit } from "../dist/index.js";

function page(body) {
  return `<!doctype html><html><body>${body}</body></html>`;
}

/**
 * Route lookup strips a trailing slash (except root), mirroring the
 * engine's own `normalizeUrl()` (util.ts) — `runAudit` normalizes the
 * input URL before navigating, so a route registered as `/site-a/` would
 * never be hit; routes below are keyed WITHOUT a trailing slash.
 */
function routeKeyFor(pathname) {
  if (pathname.length > 1 && pathname.endsWith("/")) {
    return pathname.slice(0, -1);
  }
  return pathname;
}

function startServer(routes, host) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url ?? "/", `http://${host ?? "localhost"}`);
      const handler = routes[routeKeyFor(url.pathname)];
      res.setHeader("content-type", "text/html; charset=utf-8");
      if (handler) {
        res.end(handler());
      } else {
        res.statusCode = 404;
        res.end(page("<p>not found</p>"));
      }
    });
    // Provider server (no explicit host): bind the default dual-stack
    // address so it accepts connections regardless of whether the browser
    // resolves "localhost" to the IPv4 or IPv6 loopback on this machine.
    if (host) {
      server.listen(0, host, () => resolve(server));
    } else {
      server.listen(0, () => resolve(server));
    }
  });
}

function closeServer(server) {
  return new Promise((resolve) => server.close(() => resolve()));
}

async function run() {
  // --- Fixture A: outline:none field (no alternative indicator) + a
  // genuine keyboard trap, on a page reached via keyword-matched discovery,
  // plus a cross-origin iframe embedded on the home page. ---
  const providerServer = await startServer({
    "/": () => page("<p>third-party booking widget</p>"),
  });
  const providerPort = providerServer.address().port;

  const siteARoutes = {
    "/site-a": () =>
      page(`
        <a href="/site-a/booking">Book Now</a>
        <iframe src="http://localhost:${providerPort}/" width="300" height="150"></iframe>
      `),
    "/site-a/booking": () =>
      page(`
        <form>
          <input id="outline-none-field" type="text" style="outline: none; box-shadow: none;" />
          <div id="trap-widget" tabindex="0">Date picker</div>
        </form>
        <script>
          document.getElementById('trap-widget').addEventListener('keydown', (e) => {
            if (e.key === 'Tab') {
              e.preventDefault();
              document.getElementById('trap-widget').focus();
            }
          });
        </script>
      `),
  };
  const siteAServer = await startServer(siteARoutes, "127.0.0.1");
  const siteAPort = siteAServer.address().port;

  // --- Fixture B: booking form whose page breaks `getComputedStyle` after
  // a couple of calls, forcing the KEYBOARD check (readFocusSnapshot calls
  // getComputedStyle twice per Tab press) to throw on its second press —
  // well after axe has already completed (axe runs before the keyboard
  // check in the pipeline, regardless of Tab-press count). Proves `axe`
  // and `pageError` (phase: 'keyboard') coexist (W2). A same-page reload
  // was tried first but is unreliable: it can complete fully between two
  // Tab presses without ever rejecting an in-flight `page.evaluate` call.
  const siteBRoutes = {
    "/site-b": () => page(`<a href="/site-b/booking">Book Now</a>`),
    "/site-b/booking": () =>
      page(`
        <form>
          <input id="field-1" type="text" />
          <input id="field-2" type="text" />
        </form>
        <script>
          let calls = 0;
          const original = window.getComputedStyle;
          window.getComputedStyle = function (...args) {
            calls++;
            if (calls > 2) {
              throw new Error('Simulated in-page failure (validation fixture)');
            }
            return original.apply(window, args);
          };
        </script>
      `),
  };
  const siteBServer = await startServer(siteBRoutes, "127.0.0.1");
  const siteBPort = siteBServer.address().port;

  try {
    console.log("[validate] Scenario A: outline:none focus + trap + cross-origin iframe...");
    const resultA = await runAudit(`http://127.0.0.1:${siteAPort}/site-a/`);

    const homeA = resultA.pages.find((p) => p.pageType === "home");
    assert.ok(homeA, "Scenario A: home page result missing");
    const iframeFinding = homeA.thirdPartyIframes?.find((f) => f.hostname === "localhost");
    assert.ok(iframeFinding, "Scenario A: cross-origin iframe not detected on home page (R4.1)");
    assert.equal(
      iframeFinding.kind,
      "third-party-booking-iframe",
      "W1 REGRESSION: ThirdPartyIframe.kind discriminator missing/wrong",
    );

    const bookingA = resultA.pages.find((p) => p.pageType === "booking_form");
    assert.ok(bookingA, "Scenario A: booking_form page not discovered (R2.2)");
    assert.ok(bookingA.keyboardTabThrough, "Scenario A: keyboardTabThrough missing");
    assert.equal(
      bookingA.keyboardTabThrough.focusOrder[0]?.includes("outline-none-field"),
      true,
      "Scenario A: expected the outline:none field to be the first focus stop",
    );
    assert.equal(
      bookingA.keyboardTabThrough.invisibleFocusCount,
      1,
      "C1 REGRESSION: outline:none field with no alternative indicator must be the " +
        "only invisible-focus step (focusVisible: false) — got a different count, " +
        "meaning the :focus-visible short-circuit may have crept back in",
    );
    assert.equal(
      bookingA.keyboardTabThrough.focusTrap,
      true,
      "Scenario A: genuine keyboard trap on #trap-widget was not detected (R3.3)",
    );

    const reassignedNote = resultA.discoveryNotes.find((n) => n.pageType === "room_list");
    assert.ok(
      reassignedNote,
      "Scenario A: expected a discoveryNotes entry for room_list (it shares the " +
        "'book'/'book now' keyword overlap with booking_form, see keywords.ts)",
    );
    assert.equal(
      /no same-origin link matched/i.test(reassignedNote.detail),
      false,
      "W3 REGRESSION: room_list note still uses the generic 'no link matched' wording " +
        "even though its winning URL was reassigned to booking_form (R2.3 dedup)",
    );

    console.log("[validate] Scenario A OK.");

    console.log("[validate] Scenario B: axe+pageError coexistence...");
    const resultB = await runAudit(`http://127.0.0.1:${siteBPort}/site-b/`);
    const bookingB = resultB.pages.find((p) => p.pageType === "booking_form");
    assert.ok(bookingB, "Scenario B: booking_form page not discovered (R2.2)");
    assert.ok(
      bookingB.axe,
      "Scenario B: expected axe results to be present (axe ran before the reload)",
    );
    assert.ok(
      bookingB.pageError,
      "W2 REGRESSION: expected a pageError once the keyboard check's page context " +
        "was destroyed by the mid-traversal reload",
    );
    assert.equal(
      bookingB.pageError?.phase,
      "keyboard",
      "Scenario B: expected the pageError to be attributed to the keyboard phase",
    );
    assert.equal(
      bookingB.keyboardTabThrough,
      undefined,
      "Scenario B: keyboardTabThrough should be absent when the check itself failed",
    );

    console.log("[validate] Scenario B OK.");
  } finally {
    await Promise.all([
      closeServer(providerServer),
      closeServer(siteAServer),
      closeServer(siteBServer),
    ]);
  }

  console.log("[validate] All assertions passed.");
}

run().catch((err) => {
  console.error("[validate] FAILED:", err);
  process.exitCode = 1;
});
