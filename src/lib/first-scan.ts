// oxlint-disable anti-slop/require-readable-spacing
import { animate, stagger, type AnimationPlaybackControls } from "motion";
import { ease } from "@/lib/motion";

const enterDuration = 0.25; // anything arriving: the sidebar, the player, the headers, each row
const exitDuration = 0.15; // anything leaving: the first-run words and glyph; also the glyph's lock
const clearDelay = 0.08; // when the first-run screen's background starts clearing to the library
const clearDuration = 0.2; // how long the background takes to clear

const headerDelay = clearDelay + enterDuration; // when the page header has landed and rows begin

const rowStep = 0.04; // the time between the rows appearing
const rowRise = 4; // the amount the rows rise as they appear in pixels
const rowBlur = 1.5; // the amount of blur applied to the rows as they appear in pixels

const minimumLength = 0.8; // the reveal lasts at least this long, however few rows there are
const rowWaitFrames = 30; // how long to wait for the list's rows before only fading, in frames

// CSS's default `ease`, for the glyph's dots locking to full amber
const easeCssDefault = [0.25, 0.1, 0.25, 1] as const;
// A cubic ease-out, so the count slows into its total without crawling
const easeCount = [0.33, 1, 0.68, 1] as const;

// Motion leaves each finished value inline; the reveal clears these when it ends.
const inlineStylesToClear = ["opacity", "transform", "filter", "background-color"];

type Targets = Element | Element[] | null | undefined;

/**
 * Plays from the moment the first scan ends. `firstRunScreen` is the "Add your music" screen,
 * still on top of the new library: its words and glyph leave, its background clears as the sidebar
 * and player arrive, then the header, the count and the first screenful of rows arrive in turn.
 * Under reduced motion, or when the folder held no audio, the screen only fades. Returns a cleanup
 * that cancels everything.
 */
export function playFirstScan(firstRunScreen: HTMLElement, onDone: () => void) {
  const animations: AnimationPlaybackControls[] = [];
  const animatedElements = new Set<Element>();
  let frame = 0;
  let timeout = 0;
  let framesWaited = 0;
  let restoreCount = () => {};

  const animateElements = (
    targets: Targets,
    keyframes: Record<string, (string | number)[]>,
    options: Parameters<typeof animate>[2],
  ) => {
    const elements = [targets ?? []].flat();

    if (elements.length === 0) return;

    elements.forEach((element) => animatedElements.add(element));
    animations.push(animate(elements, keyframes, options));
  };

  const fadeOutFirstRunScreen = () => {
    animateElements(
      firstRunScreen,
      { opacity: [1, 0] },
      { duration: exitDuration, ease: ease.out },
    );

    return exitDuration;
  };

  const revealLibrary = (list: HTMLElement) => {
    const screenBackground = firstRunScreen.querySelector("main") ?? firstRunScreen;
    const scroller = list.closest<HTMLElement>("[data-scroll-container]");
    const pageHeader = document.querySelector("[data-slot=page-header]");
    const titleGroup = pageHeader?.children[0];

    // 1. The words leave, softer than they arrived, with the glyph.
    animateElements(
      Array.from(firstRunScreen.querySelectorAll("[data-onboarding-part]")),
      { opacity: [1, 0], transform: ["translateY(0)", "translateY(-4px)"] },
      { delay: stagger(0.03), duration: exitDuration, ease: ease.out },
    );

    const shimmer = firstRunScreen.querySelector("[data-slot=scan-glyph-shimmer]");

    // The shimmer locks: every dot eases from where its twinkle left it to full amber.
    if (shimmer)
      [shimmer, ...shimmer.querySelectorAll("rect")].forEach((dot) => {
        const opacity = Number(getComputedStyle(dot).opacity);

        if (dot instanceof SVGElement) dot.style.animation = "none";

        animateElements(
          dot,
          { opacity: [opacity, 1] },
          { duration: exitDuration, ease: easeCssDefault },
        );
      });

    animateElements(
      firstRunScreen.querySelector("[data-slot=scan-glyph]"),
      { opacity: [1, 0] },
      { duration: exitDuration, ease: ease.out },
    );

    // 2. The background clears to the library, whose sidebar and player arrive from the edges.
    const pageColor = getComputedStyle(screenBackground).backgroundColor;

    // Motion only animates values with numbers in them, so the end is the same colour at 0%.
    animateElements(
      screenBackground,
      { backgroundColor: [pageColor, `color-mix(in oklab, ${pageColor} 0%, transparent)`] },
      { delay: clearDelay, duration: clearDuration, ease: ease.out },
    );
    animateElements(
      document.querySelector("[data-slot=sidebar-container][data-side=left]"),
      { opacity: [0, 1], transform: ["translateX(-12px)", "none"] },
      { delay: clearDelay + 0.04, duration: enterDuration, ease: ease.out },
    );
    animateElements(
      document.querySelector("header[aria-label=Player]"),
      { opacity: [0, 1], transform: ["translateY(-8px)", "none"] },
      { delay: clearDelay + 0.1, duration: enterDuration, ease: ease.out },
    );

    // 3. The page header and the column header arrive as the background finishes clearing.
    const riseIn = (targets: Targets, delay: number | ReturnType<typeof stagger>) =>
      animateElements(
        targets,
        { opacity: [0, 1], transform: ["translateY(4px)", "none"] },
        { delay, duration: enterDuration, ease: ease.out },
      );

    riseIn(titleGroup?.querySelector("h1"), headerDelay - 0.14);
    riseIn(titleGroup?.querySelector("p"), headerDelay - 0.1);
    riseIn(
      Array.from(pageHeader?.children ?? []).slice(1),
      stagger(0.05, { startDelay: headerDelay - 0.09 }),
    );
    animateElements(
      list.querySelector("thead"),
      { opacity: [0, 1] },
      { delay: headerDelay - 0.06, duration: enterDuration, ease: ease.out },
    );

    restoreCount = countUp(document.querySelector("[data-slot=track-count]"), animations);

    // 4. The rows on screen develop, one every 40ms. The rest of the list is there at once, below
    // the fold.
    const scrollerBottom = scroller?.getBoundingClientRect().bottom ?? Infinity;
    const rowsOnScreen = Array.from(
      list.querySelectorAll<HTMLElement>("tbody tr[data-entry-id]"),
    ).filter((row) => row.getBoundingClientRect().top < scrollerBottom);

    animateElements(
      rowsOnScreen,
      {
        opacity: [0, 1],
        transform: [`translateY(${rowRise}px)`, "none"],
        filter: [`blur(${rowBlur}px)`, "none"],
      },
      {
        delay: stagger(rowStep, { startDelay: headerDelay }),
        duration: enterDuration,
        ease: ease.out,
      },
    );

    return Math.max(
      headerDelay + (rowsOnScreen.length - 1) * rowStep + enterDuration,
      headerDelay + minimumLength,
    );
  };

  const waitForRows = () => {
    const list = document.querySelector<HTMLElement>("#tracks");

    // The list renders its rows a frame after mounting (the virtualizer measures first).
    if (!list?.querySelector("tbody tr[data-entry-id]") && framesWaited++ < rowWaitFrames) {
      frame = requestAnimationFrame(waitForRows);

      return;
    }

    // Motion's `animate()` doesn't read MotionConfig, so the preference is checked here.
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const seconds = list && !reduced ? revealLibrary(list) : fadeOutFirstRunScreen();

    timeout = window.setTimeout(onDone, seconds * 1000);
  };

  frame = requestAnimationFrame(waitForRows);

  return () => {
    cancelAnimationFrame(frame);
    clearTimeout(timeout);
    animations.forEach((animation) => animation.cancel());
    animatedElements.forEach((element) => {
      if (element instanceof HTMLElement || element instanceof SVGElement)
        inlineStylesToClear.forEach((style) => element.style.removeProperty(style));
    });
    restoreCount();
  };
}

/**
 * Rolls the track count up from 00 as the header lands. Two digits from the start, so the line
 * doesn't jump as the count begins; when a digit or a comma is added, the stats after the count
 * glide over. Writes to React's text node and stops if React writes to it first.
 */
function countUp(countElement: HTMLElement | null, animations: AnimationPlaybackControls[]) {
  const text = countElement?.firstChild;
  const statsAfterCount = countElement?.nextElementSibling;

  if (!countElement || !(text instanceof Text) || !(statsAfterCount instanceof HTMLElement))
    return () => {};

  const reactText = text.data;
  const total = Number(reactText.replace(/\D/g, "")) || 0;
  let lastShown = "";

  const formatCount = (value: number) => (value < 10 ? `0${value}` : value.toLocaleString());

  // A transform needs a box; the leading space has to survive it.
  statsAfterCount.style.display = "inline-block";
  statsAfterCount.style.whiteSpace = "pre";

  const showCount = (next: string) => {
    if (next === text.data) return;

    const widthBefore = countElement.getBoundingClientRect().width;

    text.data = next;
    lastShown = next;

    const shift = countElement.getBoundingClientRect().width - widthBefore;

    if (!shift) return;

    // Starts from wherever a glide still in flight has got to.
    const startX = new DOMMatrix(getComputedStyle(statsAfterCount).transform).m41 - shift;

    animations.push(
      animate(
        statsAfterCount,
        { transform: [`translateX(${startX}px)`, "none"] },
        { duration: exitDuration, ease: ease.inOut },
      ),
    );
  };

  showCount(formatCount(0));

  // 4ms per track on top of an entry, so small libraries don't spin and large ones cap at 0.8s
  const countAnimation = animate(0, total, {
    delay: headerDelay,
    duration: Math.min(0.8, enterDuration + total * 0.004),
    ease: easeCount,
    onUpdate: (value) => {
      if (text.data !== lastShown) countAnimation.stop();
      else showCount(formatCount(Math.round(value)));
    },
    // React's own text, which drops the leading zero under ten tracks
    onComplete: () => text.data === lastShown && showCount(reactText),
  });

  animations.push(countAnimation);

  return () => {
    statsAfterCount.style.removeProperty("display");
    statsAfterCount.style.removeProperty("white-space");
    statsAfterCount.style.removeProperty("transform");

    if (text.data === lastShown) text.data = reactText;
  };
}
