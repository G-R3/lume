import { animate, stagger, type AnimationPlaybackControls } from "motion";
import { EASE } from "@/lib/motion";

const ENTER_DURATION = 0.25;

const EXIT_DURATION = 0.15;

const CLEAR_DELAY = 0.08;

const CLEAR_DURATION = 0.2;

export const HEADER_DELAY = CLEAR_DELAY + ENTER_DURATION;

const ROW_STEP = 0.04;

const ROW_RISE = 4;

const ROW_BLUR = 1.5;

const MINIMUM_LENGTH = 0.8;

const EASE_CSS_DEFAULT = [0.25, 0.1, 0.25, 1] as const;

const INLINE_STYLES_TO_CLEAR = ["opacity", "transform", "filter", "background-color"];

type Targets = Element | Element[] | null | undefined;

export function playFirstScan(
  firstRunScreen: HTMLElement,
  list: HTMLElement | null,
  onDone: () => void,
) {
  const animations: AnimationPlaybackControls[] = [];
  const animatedElements = new Set<Element>();

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
      { duration: EXIT_DURATION, ease: EASE.out },
    );

    return EXIT_DURATION;
  };

  const revealLibrary = (list: HTMLElement) => {
    const screenBackground = firstRunScreen.querySelector("main") ?? firstRunScreen;
    const scroller = list.closest<HTMLElement>("[data-scroll-container]");
    const pageHeader = document.querySelector("[data-slot=page-header]");
    const titleGroup = pageHeader?.children[0];
    animateElements(
      Array.from(firstRunScreen.querySelectorAll("[data-onboarding-part]")),
      { opacity: [1, 0], transform: ["translateY(0)", "translateY(-4px)"] },
      { delay: stagger(0.03), duration: EXIT_DURATION, ease: EASE.out },
    );

    const shimmer = firstRunScreen.querySelector("[data-slot=scan-glyph-shimmer]");

    if (shimmer)
      [shimmer, ...shimmer.querySelectorAll("rect")].forEach((dot) => {
        const opacity = Number(getComputedStyle(dot).opacity);

        if (dot instanceof SVGElement) dot.style.animation = "none";

        animateElements(
          dot,
          { opacity: [opacity, 1] },
          { duration: EXIT_DURATION, ease: EASE_CSS_DEFAULT },
        );
      });

    animateElements(
      firstRunScreen.querySelector("[data-slot=scan-glyph]"),
      { opacity: [1, 0] },
      { duration: EXIT_DURATION, ease: EASE.out },
    );
    const pageColor = getComputedStyle(screenBackground).backgroundColor;
    animateElements(
      screenBackground,
      { backgroundColor: [pageColor, `color-mix(in oklab, ${pageColor} 0%, transparent)`] },
      { delay: CLEAR_DELAY, duration: CLEAR_DURATION, ease: EASE.out },
    );
    animateElements(
      document.querySelector("[data-slot=sidebar-container][data-side=left]"),
      { opacity: [0, 1], transform: ["translateX(-12px)", "none"] },
      { delay: CLEAR_DELAY + 0.04, duration: ENTER_DURATION, ease: EASE.out },
    );
    animateElements(
      document.querySelector("header[aria-label=Player]"),
      { opacity: [0, 1], transform: ["translateY(-8px)", "none"] },
      { delay: CLEAR_DELAY + 0.1, duration: ENTER_DURATION, ease: EASE.out },
    );

    const riseIn = (targets: Targets, delay: number | ReturnType<typeof stagger>) =>
      animateElements(
        targets,
        { opacity: [0, 1], transform: ["translateY(4px)", "none"] },
        { delay, duration: ENTER_DURATION, ease: EASE.out },
      );

    riseIn(titleGroup?.querySelector("h1"), HEADER_DELAY - 0.14);
    riseIn(titleGroup?.querySelector("p"), HEADER_DELAY - 0.1);
    riseIn(
      Array.from(pageHeader?.children ?? []).slice(1),
      stagger(0.05, { startDelay: HEADER_DELAY - 0.09 }),
    );
    animateElements(
      list.querySelector("thead"),
      { opacity: [0, 1] },
      { delay: HEADER_DELAY - 0.06, duration: ENTER_DURATION, ease: EASE.out },
    );

    const scrollerBottom = scroller?.getBoundingClientRect().bottom ?? Infinity;

    const rowsOnScreen = Array.from(
      list.querySelectorAll<HTMLElement>("tbody tr[data-entry-id]"),
    ).filter((row) => row.getBoundingClientRect().top < scrollerBottom);

    animateElements(
      rowsOnScreen,
      {
        opacity: [0, 1],
        transform: [`translateY(${ROW_RISE}px)`, "none"],
        filter: [`blur(${ROW_BLUR}px)`, "none"],
      },
      {
        delay: stagger(ROW_STEP, { startDelay: HEADER_DELAY }),
        duration: ENTER_DURATION,
        ease: EASE.out,
      },
    );

    return Math.max(
      HEADER_DELAY + (rowsOnScreen.length - 1) * ROW_STEP + ENTER_DURATION,
      HEADER_DELAY + MINIMUM_LENGTH,
    );
  };

  // Motion's animate() does not read MotionConfig's reduced-motion preference.
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const seconds = list && !reduced ? revealLibrary(list) : fadeOutFirstRunScreen();
  const timeout = window.setTimeout(onDone, seconds * 1000);

  return () => {
    clearTimeout(timeout);
    animations.forEach((animation) => animation.cancel());
    animatedElements.forEach((element) => {
      if (element instanceof HTMLElement || element instanceof SVGElement)
        INLINE_STYLES_TO_CLEAR.forEach((style) => element.style.removeProperty(style));
    });
  };
}
