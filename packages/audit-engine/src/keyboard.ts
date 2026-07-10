import type { Page } from "playwright";
import type { KeyboardTabThrough } from "./types.js";

const NO_FORM_RESULT: KeyboardTabThrough = {
  detectedForm: false,
  tabStops: 0,
  focusOrder: [],
  focusTrap: false,
  focusLossCount: 0,
  invisibleFocusCount: 0,
  reachedEnd: false,
  note: "no booking form detected",
};

/** Consecutive repeated (already-seen) focus stops before we call it a trap. */
const TRAP_REPEAT_THRESHOLD = 3;

interface FocusSnapshot {
  descriptor: string;
  isBody: boolean;
  focusVisible: boolean;
}

/**
 * Bounded Tab-key traversal starting from the booking form (design §5).
 * Always a SIGNAL, never a pass/fail compliance verdict (R3.2, positioning
 * constraint R7.1/R7.2). Any exception here is caught by page-scan.ts and
 * converted into `pageError.phase === 'keyboard'` — this function itself
 * does not need to catch broadly, but individual steps are defensive so a
 * transient per-press failure doesn't kill the whole trace.
 */
export async function checkTabThrough(
  page: Page,
  opts: { keyboardMaxTabs: number },
): Promise<KeyboardTabThrough> {
  const formHandleExists = await hasBookingFormLikeContainer(page);
  if (!formHandleExists) {
    return NO_FORM_RESULT;
  }

  await seedFocus(page);

  const focusOrder: string[] = [];
  const seen = new Set<string>();
  let focusTrap = false;
  let focusLossCount = 0;
  let invisibleFocusCount = 0;
  let reachedEnd = false;
  let repeatStreak = 0;

  for (let i = 0; i < opts.keyboardMaxTabs; i++) {
    await page.keyboard.press("Tab");
    const snapshot = await readFocusSnapshot(page);

    if (snapshot.isBody) {
      focusLossCount++;
      // In a headless page there is no browser chrome to escape into; focus
      // landing back on <body> is the practical equivalent of "focus left
      // the form/page" — treat as a natural end once at least one real stop
      // has been recorded.
      if (focusOrder.length > 0) {
        reachedEnd = true;
        break;
      }
      continue;
    }

    focusOrder.push(snapshot.descriptor);
    if (!snapshot.focusVisible) invisibleFocusCount++;

    if (seen.has(snapshot.descriptor)) {
      repeatStreak++;
      if (repeatStreak >= TRAP_REPEAT_THRESHOLD) {
        focusTrap = true;
        break;
      }
    } else {
      seen.add(snapshot.descriptor);
      repeatStreak = 0;
    }
  }

  if (!focusTrap && !reachedEnd && focusOrder.length < opts.keyboardMaxTabs) {
    // Loop ended (e.g. body-landing without prior stops never triggered,
    // but the for-loop ran out for another reason) without a detected trap.
    reachedEnd = true;
  }

  return {
    detectedForm: true,
    tabStops: focusOrder.length,
    focusOrder,
    focusTrap,
    focusLossCount,
    invisibleFocusCount,
    reachedEnd,
  };
}

async function hasBookingFormLikeContainer(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    if (document.querySelector("form")) return true;
    const dateOrGuestInputs = document.querySelectorAll(
      'input[type="date"], input[type="tel"], select[name*="guest" i], ' +
        'select[name*="adult" i], select[name*="room" i], ' +
        'input[name*="checkin" i], input[name*="checkout" i]',
    );
    return dateOrGuestInputs.length > 0;
  });
}

async function seedFocus(page: Page): Promise<void> {
  await page.evaluate(() => {
    const active = document.activeElement as HTMLElement | null;
    if (active && active !== document.body) active.blur();
  });
}

async function readFocusSnapshot(page: Page): Promise<FocusSnapshot> {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body) {
      return { descriptor: "BODY", isBody: true, focusVisible: false };
    }

    const tag = el.tagName.toLowerCase();
    const id = el.id ? `#${el.id}` : "";
    const classes = el.className ? `.${String(el.className).trim().split(/\s+/).join(".")}` : "";
    const name = el.getAttribute("name");
    const nameAttr = name ? `[name=${name}]` : "";
    const descriptor = `${tag}${id}${classes}${nameAttr}`;

    let focusVisible = false;
    try {
      focusVisible = el.matches(":focus-visible");
    } catch {
      focusVisible = false;
    }
    if (!focusVisible) {
      const style = window.getComputedStyle(el);
      const hasOutline = style.outlineStyle !== "none" && style.outlineWidth !== "0px";
      const hasBoxShadow = style.boxShadow !== "none" && style.boxShadow !== "";
      focusVisible = hasOutline || hasBoxShadow;
    }

    return { descriptor, isBody: false, focusVisible };
  });
}
